// src/minidome.js — reusable mini-dome for educational animations
//
// Each MiniDome is a self-contained Three.js instance showing one
// aspect of lunar motion on a small hemispherical dome.

import * as THREE from 'three';
import {
  DOME_RADIUS, toRad, altAzTo3D, lunarArcPoints,
  makeTextSprite, createArc,
} from './dome.js';

// ── MiniDome class ──────────────────────────────────────────────
export class MiniDome {
  /**
   * @param {string} containerId  DOM element ID to mount into
   * @param {object} options
   * @param {function} options.buildDynamic  fn(group, lat_rad, t) — adds dynamic objects to group
   * @param {number}   [options.cycleDuration=5000]  ms per animation cycle
   * @param {number}   [options.lat=40.7128]  latitude for the demo
   */
  constructor(containerId, options) {
    this.containerId = containerId;
    this.buildDynamic = options.buildDynamic;
    this.cycleDuration = options.cycleDuration || 5000;
    this.lat_rad = toRad(options.lat || 40.7128);

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.dynamicGroup = null;
    this.animId = null;
    this.paused = false;
    this.theta = 0.3;
    this.startTime = 0;
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    // Camera — positioned for a nice outside view
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(
      4.5 * Math.sin(1.1) * Math.sin(0.3),
      4.5 * Math.cos(1.1),
      4.5 * Math.sin(1.1) * Math.cos(0.3)
    );
    this.camera.lookAt(0, 0.15, 0);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1225);

    this._buildStatic();
    this.startTime = performance.now();
    this._animate();

    // Resize handler
    this._resizeHandler = () => {
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      if (w2 === 0 || h2 === 0) return;
      this.camera.aspect = w2 / h2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w2, h2);
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  _buildStatic() {
    // Hemisphere wireframe
    const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    this.scene.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
      color: 0x3a4870, wireframe: true, transparent: true, opacity: 0.1
    })));

    // Horizon ring
    const horizonGeo = new THREE.RingGeometry(DOME_RADIUS - 0.005, DOME_RADIUS + 0.005, 128);
    const horizonMesh = new THREE.Mesh(horizonGeo, new THREE.MeshBasicMaterial({
      color: 0x4a5a90, transparent: true, opacity: 0.55, side: THREE.DoubleSide
    }));
    horizonMesh.rotation.x = -Math.PI / 2;
    this.scene.add(horizonMesh);

    // Ground disc
    const groundMesh = new THREE.Mesh(
      new THREE.CircleGeometry(DOME_RADIUS, 64),
      new THREE.MeshBasicMaterial({ color: 0x0a0e1a, transparent: true, opacity: 0.98, side: THREE.DoubleSide })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.002;
    this.scene.add(groundMesh);

    // Cardinal labels
    [{ l: 'N', az: 0 }, { l: 'E', az: Math.PI / 2 }, { l: 'S', az: Math.PI }, { l: 'W', az: 3 * Math.PI / 2 }]
      .forEach(({ l, az }) => {
        const r   = DOME_RADIUS + 0.15;
        const spr = makeTextSprite(l, '#8a9ab8');
        spr.position.set(r * Math.sin(az), 0.02, -r * Math.cos(az));
        this.scene.add(spr);
      });

    // N-S meridian line
    const meridPts = [];
    for (let a = 0; a <= 90; a++) meridPts.push(altAzTo3D(toRad(a), Math.PI, DOME_RADIUS - 0.005));
    for (let a = 90; a >= 0; a--) meridPts.push(altAzTo3D(toRad(a), 0, DOME_RADIUS - 0.005));
    this.scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(meridPts),
      new THREE.LineBasicMaterial({ color: 0x4a5a80, transparent: true, opacity: 0.25 })
    ));

    // Stars (fewer than the full dome)
    const starPos = [];
    for (let i = 0; i < 150; i++) {
      const θ = Math.random() * Math.PI * 2;
      const φ = Math.random() * Math.PI / 2;
      const r = DOME_RADIUS - 0.04;
      starPos.push(r * Math.cos(φ) * Math.sin(θ), r * Math.sin(φ), r * Math.cos(φ) * Math.cos(θ));
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.008, transparent: true, opacity: 0.3
    })));
  }

  _animate() {
    if (this.paused) return;

    this.animId = requestAnimationFrame(() => this._animate());

    // Slow auto-rotation
    this.theta += 0.0004;
    const phi = 1.1;
    const radius = 4.5;
    this.camera.position.set(
      radius * Math.sin(phi) * Math.sin(this.theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(this.theta)
    );
    this.camera.lookAt(0, 0.15, 0);

    // Normalized cycle time 0→1
    const elapsed = performance.now() - this.startTime;
    const t = (elapsed % this.cycleDuration) / this.cycleDuration;

    // Rebuild dynamic scene
    if (this.dynamicGroup) this.scene.remove(this.dynamicGroup);
    this.dynamicGroup = new THREE.Group();
    this.buildDynamic(this.dynamicGroup, this.lat_rad, t);
    this.scene.add(this.dynamicGroup);

    this.renderer.render(this.scene, this.camera);
  }

  pause() {
    this.paused = true;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;

    // Resize in case container changed while hidden
    if (this._resizeHandler) this._resizeHandler();

    this._animate();
  }

  dispose() {
    this.pause();
    window.removeEventListener('resize', this._resizeHandler);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}
