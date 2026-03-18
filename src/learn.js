// src/learn.js — educational tab: three mini-dome animations
//
// Each mini-dome isolates one component of the full sky dome to
// illustrate the synodic, tropical, and nodal cycles independently.

import * as THREE from 'three';
import { MiniDome } from './minidome.js';
import {
  DOME_RADIUS, toRad, altAzTo3D, lunarArcPoints, createArc,
} from './dome.js';
import {
  MAJOR_STANDSTILL_DEG, MINOR_STANDSTILL_DEG,
} from './astronomy.js';

let miniDomes = [];

// ── Synodic: moon dot orbiting along a fixed gold arc ───────────
// The dot changes size and brightness to represent phase.
function buildSynodic(group, lat_rad, t) {
  // Fixed declination midway through the tropical range for a nice visible arc
  const dec = 10;
  const arc = createArc(dec, lat_rad, 0xf0d890, 0.4);
  if (arc) group.add(arc);

  // Get arc points and place dot along them
  const points = lunarArcPoints(dec, lat_rad, DOME_RADIUS - 0.01);
  if (points.length < 2) return;

  // Position along the arc
  const idx = Math.floor(t * (points.length - 1));
  const pos = points[idx];

  // Phase: 0 = new moon (dim, small), 0.5 = full moon (bright, large)
  // Use cosine so t=0 and t=1 are new moon, t=0.5 is full
  const phase = (1 - Math.cos(t * 2 * Math.PI)) / 2; // 0→1→0

  // Moon dot
  const dotSize = 0.015 + 0.02 * phase;
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(dotSize, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf0d890, transparent: true, opacity: 0.4 + 0.6 * phase })
  );
  dot.position.copy(pos);
  group.add(dot);

  // Glow sprite behind dot
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gCtx = gc.getContext('2d');
  const grd = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(240,216,144,${(0.5 * phase).toFixed(2)})`);
  grd.addColorStop(0.5, `rgba(240,216,144,${(0.12 * phase).toFixed(2)})`);
  grd.addColorStop(1, 'rgba(240,216,144,0)');
  gCtx.fillStyle = grd;
  gCtx.fillRect(0, 0, 64, 64);
  const glowSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(gc), transparent: true
  }));
  const glowScale = 0.15 + 0.15 * phase;
  glowSpr.scale.set(glowScale, glowScale, 1);
  glowSpr.position.copy(pos);
  group.add(glowSpr);
}

// ── Tropical: gold arc oscillating up and down ──────────────────
// Two faint blue boundary arcs mark the amplitude limits.
function buildTropical(group, lat_rad, t) {
  // Current amplitude (use a representative value, e.g. 24°)
  const amplitude = 24;

  // Fixed blue boundary arcs at +amplitude and -amplitude
  const bN = createArc(amplitude, lat_rad, 0x6aaace, 0.4);
  const bS = createArc(-amplitude, lat_rad, 0x6aaace, 0.4);
  if (bN) group.add(bN);
  if (bS) group.add(bS);

  // Faint fill between boundaries
  for (let dec = -amplitude; dec <= amplitude; dec += 3) {
    const a = createArc(dec, lat_rad, 0x6aaace, 0.06);
    if (a) group.add(a);
  }

  // Oscillating gold arc: cosine from +amplitude to -amplitude
  const dec = amplitude * Math.cos(t * 2 * Math.PI);
  const arc = createArc(dec, lat_rad, 0xf0d890, 0.95);
  if (arc) group.add(arc);

  // Culmination dot on the gold arc
  const culminAltDeg = 90 - Math.abs(lat_rad * 180 / Math.PI - dec);
  const culminAltRad = toRad(Math.max(0, culminAltDeg));
  const culminAz = dec < (lat_rad * 180 / Math.PI) ? Math.PI : 0;
  const culminPos = altAzTo3D(culminAltRad, culminAz, DOME_RADIUS - 0.01);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf0d890 })
  );
  dot.position.copy(culminPos);
  group.add(dot);
}

// ── Nodal: blue boundaries expanding and contracting ────────────
// Purple standstill lines stay fixed; blue boundaries breathe.
function buildNodal(group, lat_rad, t) {
  // Fixed purple standstill boundary arcs
  [
    [MAJOR_STANDSTILL_DEG, 0.5], [-MAJOR_STANDSTILL_DEG, 0.5],
    [MINOR_STANDSTILL_DEG, 0.35], [-MINOR_STANDSTILL_DEG, 0.35],
  ].forEach(([dec, op]) => {
    const a = createArc(dec, lat_rad, 0xb882c8, op);
    if (a) group.add(a);
  });

  // Faint purple fill between standstill limits
  for (let dec = MINOR_STANDSTILL_DEG; dec <= MAJOR_STANDSTILL_DEG; dec += 1.5) {
    const a = createArc(dec, lat_rad, 0xb882c8, 0.08);
    const b = createArc(-dec, lat_rad, 0xb882c8, 0.08);
    if (a) group.add(a);
    if (b) group.add(b);
  }

  // Breathing blue boundaries: oscillate between minor and major amplitude
  // cosine: t=0 → major, t=0.5 → minor, t=1 → major
  const tropAmp = MINOR_STANDSTILL_DEG +
    (MAJOR_STANDSTILL_DEG - MINOR_STANDSTILL_DEG) * (1 + Math.cos(t * 2 * Math.PI)) / 2;

  // Blue boundary arcs
  const bN = createArc(tropAmp, lat_rad, 0x6aaace, 0.7);
  const bS = createArc(-tropAmp, lat_rad, 0x6aaace, 0.7);
  if (bN) group.add(bN);
  if (bS) group.add(bS);

  // Faint blue fill between boundaries
  for (let dec = -tropAmp; dec <= tropAmp; dec += 2) {
    const a = createArc(dec, lat_rad, 0x6aaace, 0.08);
    if (a) group.add(a);
  }
}

// ── Public API ──────────────────────────────────────────────────

export function initLearn() {
  miniDomes = [
    new MiniDome('mini-dome-synodic', {
      buildDynamic: buildSynodic,
      cycleDuration: 5000,
    }),
    new MiniDome('mini-dome-tropical', {
      buildDynamic: buildTropical,
      cycleDuration: 5000,
    }),
    new MiniDome('mini-dome-nodal', {
      buildDynamic: buildNodal,
      cycleDuration: 8000,
    }),
  ];

  miniDomes.forEach(md => md.init());
}

export function pauseLearn() {
  miniDomes.forEach(md => md.pause());
}

export function resumeLearn() {
  miniDomes.forEach(md => md.resume());
}
