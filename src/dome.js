// src/dome.js — 3D sky dome visualization (Three.js)

import * as THREE from 'three';
import SunCalc from 'suncalc';

// ── Constants ─────────────────────────────────────────────────
const DOME_RADIUS        = 1.8;
const MAJOR_STANDSTILL   = 28.5;   // degrees declination
const MINOR_STANDSTILL   = 18.5;

// ── Astronomy helpers ─────────────────────────────────────────
function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

/** Altitude of an object at declination dec (deg) and hour angle ha (rad), from latitude lat (rad) */
function altitude(dec_deg, ha_rad, lat_rad) {
  const dec = toRad(dec_deg);
  return Math.asin(
    Math.sin(lat_rad) * Math.sin(dec) +
    Math.cos(lat_rad) * Math.cos(dec) * Math.cos(ha_rad)
  );
}

/** Azimuth of that same object */
function azimuth(dec_deg, ha_rad, lat_rad) {
  const dec = toRad(dec_deg);
  const alt = altitude(dec_deg, ha_rad, lat_rad);
  const cosAz = (Math.sin(dec) - Math.sin(lat_rad) * Math.sin(alt)) /
                (Math.cos(lat_rad) * Math.cos(alt));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(ha_rad) > 0) az = 2 * Math.PI - az;
  return az;
}

/** Convert altitude/azimuth → 3-D position on the dome surface */
function altAzTo3D(alt_rad, az_rad, radius) {
  const r = radius * Math.cos(alt_rad);
  const x = r * Math.sin(az_rad);
  const z = r * Math.cos(az_rad);
  const y = radius * Math.sin(alt_rad);
  return new THREE.Vector3(x, y, -z);   // flip z so South faces viewer
}

/** Build an array of 3-D points tracing the arc of a given declination */
function lunarArcPoints(dec_deg, lat_rad, radius, numPoints = 300) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const ha  = -Math.PI + (2 * Math.PI * i / numPoints);
    const alt = altitude(dec_deg, ha, lat_rad);
    if (alt < -0.01) continue;
    const az = azimuth(dec_deg, ha, lat_rad);
    points.push(altAzTo3D(Math.max(0, alt), az, radius));
  }
  return points;
}

/** Get today's moon declination via the north-pole trick.
 *  At lat=90°N the altitude equation simplifies to: sin(alt) = sin(dec),
 *  so altitude = declination exactly, regardless of time or hour angle.
 *  This is the same method used in bars.js and waves.js. */
function getMoonDeclination(date) {
  const pos = SunCalc.getMoonPosition(date, 90, 0);
  return toDeg(pos.altitude);
}

/** Current tropical month amplitude — how far the Moon swings this cycle.
 *  Near major standstill (Jan 2025) it's ~27–28°; decreases toward 2034. */
function currentTropicalAmplitude(date) {
  const NODAL_DAYS      = 18.613 * 365.25;
  const MAJOR_DATE      = new Date(Date.UTC(2025, 0, 15));
  const daysSinceMajor  = (date - MAJOR_DATE) / 86400000;
  const cyclePos        = ((daysSinceMajor % NODAL_DAYS) + NODAL_DAYS) % NODAL_DAYS / NODAL_DAYS;
  // Cosine oscillates from max (28.5°) at 0% to min (18.5°) at 50%
  const amplitude = MINOR_STANDSTILL + (MAJOR_STANDSTILL - MINOR_STANDSTILL) *
                    (1 + Math.cos(cyclePos * 2 * Math.PI)) / 2;
  return amplitude;
}

// ── Text sprite helper ────────────────────────────────────────
function makeTextSprite(text, color, fontSize = 42) {
  const canvas = document.createElement('canvas');
  canvas.width  = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font      = `bold ${fontSize}px "Courier New"`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55 });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.2, 0.2, 1);
  return sprite;
}

// ── Arc line helper ───────────────────────────────────────────
function createArc(dec_deg, lat_rad, color, opacity) {
  const points = lunarArcPoints(dec_deg, lat_rad, DOME_RADIUS - 0.01);
  if (points.length < 2) return null;
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geo, mat);
}

// ── Module state ──────────────────────────────────────────────
let renderer = null;
let scene    = null;
let camera   = null;
let animId   = null;
let spherical  = { theta: 0.3, phi: 1.1, radius: 2.8 };
let isDragging = false;
let prevMouse  = { x: 0, y: 0 };
let isRotating = true;   // auto-rotation on/off

// Cycle animation state
let cycleAnimating  = false;  // is the cycle animation playing?
let cycleAnimState  = null;   // { baseDate, simDate, daysPerSecond, lastFrameTime, savedState }

// Groups that get rebuilt on state change
let dynamicGroup = null;

// ── Build the static parts of the scene (dome, stars, etc.) ──
function buildStaticScene(lat_rad) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1225);

  // Hemisphere wireframe
  const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  scene.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
    color: 0x3a4870, wireframe: true, transparent: true, opacity: 0.1
  })));

  // Horizon ring
  const horizonGeo = new THREE.RingGeometry(DOME_RADIUS - 0.005, DOME_RADIUS + 0.005, 128);
  const horizonMesh = new THREE.Mesh(horizonGeo, new THREE.MeshBasicMaterial({
    color: 0x4a5a90, transparent: true, opacity: 0.55, side: THREE.DoubleSide
  }));
  horizonMesh.rotation.x = -Math.PI / 2;
  scene.add(horizonMesh);

  // Ground disc
  const groundMesh = new THREE.Mesh(
    new THREE.CircleGeometry(DOME_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color: 0x0a0e1a, transparent: true, opacity: 0.98, side: THREE.DoubleSide })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.002;
  scene.add(groundMesh);

  // Cardinal labels
  [{ l: 'N', az: 0 }, { l: 'E', az: Math.PI / 2 }, { l: 'S', az: Math.PI }, { l: 'W', az: 3 * Math.PI / 2 }]
    .forEach(({ l, az }) => {
      const r   = DOME_RADIUS + 0.15;
      const spr = makeTextSprite(l, '#8a9ab8');
      spr.position.set(r * Math.sin(az), 0.02, -r * Math.cos(az));
      scene.add(spr);
    });

  // Altitude labels on south meridian
  [10, 20, 30, 40, 50, 60, 70, 80].forEach(alt => {
    const pos = altAzTo3D(toRad(alt), Math.PI, DOME_RADIUS + 0.05);
    const lbl = makeTextSprite(`${alt}°`, '#3a4870', 32);
    lbl.position.copy(pos);
    lbl.scale.set(0.15, 0.15, 1);
    scene.add(lbl);
  });

  // N-S meridian line
  const meridPts = [];
  for (let a = 0; a <= 90; a++) meridPts.push(altAzTo3D(toRad(a), Math.PI, DOME_RADIUS - 0.005));
  for (let a = 90; a >= 0; a--) meridPts.push(altAzTo3D(toRad(a), 0, DOME_RADIUS - 0.005));
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(meridPts),
    new THREE.LineBasicMaterial({ color: 0x4a5a80, transparent: true, opacity: 0.25 })
  ));

  // Stars
  const starPos = [];
  for (let i = 0; i < 300; i++) {
    const θ = Math.random() * Math.PI * 2;
    const φ = Math.random() * Math.PI / 2;
    const r = DOME_RADIUS - 0.04;
    starPos.push(r * Math.cos(φ) * Math.sin(θ), r * Math.sin(φ), r * Math.cos(φ) * Math.cos(θ));
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.008, transparent: true, opacity: 0.3
  })));
}

// ── Build/rebuild the dynamic parts (arcs, tonight's path) ───
function buildDynamicScene(state) {
  if (dynamicGroup) scene.remove(dynamicGroup);
  dynamicGroup = new THREE.Group();

  const lat_rad = toRad(state.lat);
  const tropAmp = currentTropicalAmplitude(state.date);
  const tonightDec = getMoonDeclination(state.date);

  // ── Purple standstill band ──
  for (let dec = MINOR_STANDSTILL; dec <= MAJOR_STANDSTILL; dec += 0.8) {
    const a = createArc(dec,  lat_rad, 0xb882c8, 0.18);
    const b = createArc(-dec, lat_rad, 0xb882c8, 0.18);
    if (a) dynamicGroup.add(a);
    if (b) dynamicGroup.add(b);
  }
  // Inner faint fill
  for (let dec = -MINOR_STANDSTILL; dec <= MINOR_STANDSTILL; dec += 1.5) {
    const a = createArc(dec, lat_rad, 0xb882c8, 0.06);
    if (a) dynamicGroup.add(a);
  }
  // Boundary arcs (brighter)
  [
    [MAJOR_STANDSTILL,  0.6], [-MAJOR_STANDSTILL, 0.6],
    [MINOR_STANDSTILL,  0.4], [-MINOR_STANDSTILL, 0.4],
  ].forEach(([dec, op]) => {
    const a = createArc(dec, lat_rad, 0xb882c8, op);
    if (a) dynamicGroup.add(a);
  });

  // ── Blue tropical month band ──
  for (let dec = -tropAmp; dec <= tropAmp; dec += 1.2) {
    const a = createArc(dec, lat_rad, 0x6aaace, 0.15);
    if (a) dynamicGroup.add(a);
  }
  const tropN = createArc( tropAmp, lat_rad, 0x6aaace, 0.6);
  const tropS = createArc(-tropAmp, lat_rad, 0x6aaace, 0.6);
  if (tropN) dynamicGroup.add(tropN);
  if (tropS) dynamicGroup.add(tropS);

  // ── Gold tonight's path ──
  const tonightArc = createArc(tonightDec, lat_rad, 0xf0d890, 0.95);
  if (tonightArc) dynamicGroup.add(tonightArc);

  // Culmination dot + glow
  const culminAltDeg = 90 - Math.abs(state.lat - tonightDec);
  const culminAltRad = toRad(Math.max(0, culminAltDeg));
  const culminAz     = tonightDec < state.lat ? Math.PI : 0;
  const culminPos    = altAzTo3D(culminAltRad, culminAz, DOME_RADIUS - 0.01);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf0d890 })
  );
  dot.position.copy(culminPos);
  dynamicGroup.add(dot);

  // Glow sprite
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gCtx = gc.getContext('2d');
  const grd  = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0,   'rgba(240,216,144,0.6)');
  grd.addColorStop(0.5, 'rgba(240,216,144,0.15)');
  grd.addColorStop(1,   'rgba(240,216,144,0)');
  gCtx.fillStyle = grd;
  gCtx.fillRect(0, 0, 64, 64);
  const glowSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(gc), transparent: true
  }));
  glowSpr.scale.set(0.22, 0.22, 1);
  glowSpr.position.copy(culminPos);
  dynamicGroup.add(glowSpr);

  // Altitude label at culmination
  const culminLbl = makeTextSprite(`${culminAltDeg.toFixed(1)}°`, '#f0d890', 36);
  culminLbl.position.copy(culminPos);
  culminLbl.position.y += 0.13;
  culminLbl.scale.set(0.2, 0.2, 1);
  dynamicGroup.add(culminLbl);

  scene.add(dynamicGroup);
}

// ── Camera helpers ────────────────────────────────────────────
function updateCamera() {
  camera.position.set(
    spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
    spherical.radius * Math.cos(spherical.phi),
    spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta)
  );
  camera.lookAt(0, 0.15, 0);
}

// ── Interaction setup (once) ──────────────────────────────────
function attachControls(container) {
  container.addEventListener('mousedown', e => {
    isDragging = true;
    prevMouse  = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    spherical.theta -= (e.clientX - prevMouse.x) * 0.005;
    spherical.phi    = Math.max(0.2, Math.min(1.5, spherical.phi + (e.clientY - prevMouse.y) * 0.005));
    prevMouse = { x: e.clientX, y: e.clientY };
    updateCamera();
  });
  window.addEventListener('mouseup', () => { isDragging = false; });

  container.addEventListener('wheel', e => {
    e.preventDefault();
    spherical.radius = Math.max(1.2, Math.min(7, spherical.radius + e.deltaY * 0.004));
    updateCamera();
  }, { passive: false });

  // Touch
  container.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { isDragging = true; prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  });
  container.addEventListener('touchmove', e => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    spherical.theta -= (e.touches[0].clientX - prevMouse.x) * 0.005;
    spherical.phi    = Math.max(0.2, Math.min(1.5, spherical.phi + (e.touches[0].clientY - prevMouse.y) * 0.005));
    prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    updateCamera();
  }, { passive: false });
  container.addEventListener('touchend', () => { isDragging = false; });

  // Zoom buttons
  document.getElementById('dome-zoom-in')?.addEventListener('click', () => {
    spherical.radius = Math.max(1.2, spherical.radius - 0.4); updateCamera();
  });
  document.getElementById('dome-zoom-out')?.addEventListener('click', () => {
    spherical.radius = Math.min(7, spherical.radius + 0.4); updateCamera();
  });
  document.getElementById('dome-zoom-reset')?.addEventListener('click', () => {
    spherical = { theta: 0.3, phi: 1.1, radius: 2.8 }; updateCamera();
  });

  // Pause / play rotation button
  document.getElementById('dome-pause')?.addEventListener('click', () => {
    isRotating = !isRotating;
    const btn = document.getElementById('dome-pause');
    if (btn) btn.textContent = isRotating ? '⏸' : '▶';
    btn.title = isRotating ? 'Pause rotation' : 'Resume rotation';
  });

  // Cycle animation: speed selector changes daysPerSecond
  document.getElementById('dome-anim-speed')?.addEventListener('change', e => {
    if (cycleAnimState) cycleAnimState.daysPerSecond = parseFloat(e.target.value);
  });

  // Animate button: toggle cycle animation on/off
  document.getElementById('dome-anim-btn')?.addEventListener('click', () => {
    const btn     = document.getElementById('dome-anim-btn');
    const readout = document.getElementById('dome-anim-date');
    const controls = document.getElementById('dome-anim-controls');

    if (!cycleAnimating) {
      // Start — we need the current saved state; it gets set in renderDome each call
      // Pull it from the button's data attribute set by renderDome
      const savedStateJson = btn.dataset.savedState;
      if (!savedStateJson) return;
      const savedState = JSON.parse(savedStateJson);
      savedState.date  = new Date(savedState.date);

      const speedEl = document.getElementById('dome-anim-speed');
      const daysPerSecond = speedEl ? parseFloat(speedEl.value) : 27;

      cycleAnimState = {
        savedState,
        simDate:      new Date(savedState.date),
        daysPerSecond,
        lastFrameTime: performance.now(),
      };
      cycleAnimating = true;
      if (btn) { btn.textContent = '⏹ Stop'; btn.title = 'Stop animation'; }
      if (controls) controls.classList.add('active');
      // Pause rotation so dome is steady during animation
      isRotating = false;
      const pauseBtn = document.getElementById('dome-pause');
      if (pauseBtn) { pauseBtn.textContent = '▶'; pauseBtn.title = 'Resume rotation'; }
    } else {
      // Stop — restore the real date
      cycleAnimating = false;
      cycleAnimState = null;
      if (btn) { btn.textContent = '▶ Animate'; btn.title = 'Show cycle animation'; }
      if (controls) controls.classList.remove('active');
      if (readout) readout.textContent = '';
      // Restore real scene from saved state
      const savedStateJson = btn.dataset.savedState;
      if (savedStateJson) {
        const savedState = JSON.parse(savedStateJson);
        savedState.date  = new Date(savedState.date);
        buildDynamicScene(savedState);
      }
    }
  });

  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

// ── Public: one-time init ─────────────────────────────────────
export function initDome() {
  const container = document.getElementById('dome-container');
  if (!container) return;

  // Create renderer now but size it lazily on first render
  // (clientWidth may still be 0 at module-load time)
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100); // aspect fixed below
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  attachControls(container);
  updateCamera();

  // Animation loop — guard against scene being null on first frames
  function animate(timestamp) {
    animId = requestAnimationFrame(animate);

    // Auto-rotation
    if (!isDragging && isRotating) { spherical.theta += 0.0008; updateCamera(); }

    // Cycle animation: advance simulated date and rebuild arcs each frame
    if (cycleAnimating && cycleAnimState && scene) {
      const now     = timestamp || performance.now();
      const elapsed = (now - cycleAnimState.lastFrameTime) / 1000; // seconds
      cycleAnimState.lastFrameTime = now;

      // Advance simulated date
      const msAdvance = elapsed * cycleAnimState.daysPerSecond * 86400000;
      cycleAnimState.simDate = new Date(cycleAnimState.simDate.getTime() + msAdvance);

      // Update date readout
      const readout = document.getElementById('dome-anim-date');
      if (readout) readout.textContent = cycleAnimState.simDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

      // Rebuild dynamic arcs with the simulated date (keep lat/lon from saved state)
      buildDynamicScene({ ...cycleAnimState.savedState, date: cycleAnimState.simDate });
    }

    if (scene) renderer.render(scene, camera);
  }
  animate();
}

// ── Public: re-render on state change ─────────────────────────
export function renderDome(state) {
  const container = document.getElementById('dome-container');
  if (!container || !renderer) return;

  // First call: now that the DOM is painted, set the real size
  if (!scene) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    buildStaticScene(toRad(state.lat));
  }

  // Store current state on the animate button so animation can read it
  const animBtn = document.getElementById('dome-anim-btn');
  if (animBtn) animBtn.dataset.savedState = JSON.stringify(state);

  // If cycle animation is running, don't overwrite the scene — let animation drive it
  if (cycleAnimating) return;

  // Always rebuild arcs for new date/location
  buildDynamicScene(state);
}
