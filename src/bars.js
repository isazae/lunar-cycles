// src/bars.js — Progress bar visualization

import SunCalc from 'suncalc';
import {
  MS_PER_DAY, TROPICAL, NODAL_DAYS, MAJOR_STANDSTILL,
  getMoonDeclinationDeg, moonDeclinationAmplitude,
} from './astronomy.js';

// ── Calculate progress fractions (0–1) for each cycle ────────
function calcProgress(date) {
  // Synodic: SunCalc phase (0 = new moon, 0.5 = full moon, 1 = new moon)
  const synodic = SunCalc.getMoonIllumination(date).phase;

  // Tropical: derive from real SunCalc declination.
  // Declination follows a cosine curve, so we invert with acos (not a linear
  // map — that would be ~90° out of phase with the wave graph).
  const decNow      = getMoonDeclinationDeg(date);
  const decTomorrow = getMoonDeclinationDeg(new Date(date.getTime() + MS_PER_DAY));
  const movingSouth = decTomorrow < decNow;

  const maxDec       = moonDeclinationAmplitude(date);
  const clampedDec   = Math.max(-maxDec, Math.min(maxDec, decNow));
  const halfCyclePos = (TROPICAL / (2 * Math.PI)) * Math.acos(clampedDec / maxDec); // 0..TROPICAL/2
  const tropicalRaw  = movingSouth ? halfCyclePos / TROPICAL : 1 - halfCyclePos / TROPICAL;
  // tropicalRaw: 0 = maxNorth, 0.5 = maxSouth — shift +0.5 so maxNorth lands at centre
  const tropical = (tropicalRaw + 0.5) % 1;

  // Nodal: progress through the ~18.6-year nodal cycle.
  // Shift +0.5 so major standstill → centre (0.5), minor standstills → edges.
  const daysSinceMajor = (date - MAJOR_STANDSTILL) / MS_PER_DAY;
  const nodalRaw = ((daysSinceMajor % NODAL_DAYS) + NODAL_DAYS) % NODAL_DAYS / NODAL_DAYS;
  const nodal    = (nodalRaw + 0.5) % 1;

  return { synodic, tropical, nodal };
}

// ── Human-readable phase name for synodic progress ───────────
// Boundaries centred ±2% around each quarter (0.25, 0.50, 0.75).
function phaseName(p) {
  if (p < 0.02 || p > 0.98) return 'New Moon';
  if (p < 0.23) return 'Waxing Crescent';
  if (p < 0.27) return 'First Quarter';
  if (p < 0.48) return 'Waxing Gibbous';
  if (p < 0.52) return 'Full Moon';
  if (p < 0.73) return 'Waning Gibbous';
  if (p < 0.77) return 'Last Quarter';
  return 'Waning Crescent';
}

// ── Build one bar row ──────────────────────────────────────────
// Brief delay lets the browser complete layout before the CSS transition fires.
const ANIM_DELAY_MS = 60;

function buildBar(containerId, progress, label) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  // Track + fill
  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  fill.style.width = '0%';
  track.appendChild(fill);
  container.appendChild(track);

  // Tick marks at 25%, 50%, 75%
  [25, 50, 75].forEach(pct => {
    const tick = document.createElement('div');
    tick.className = 'bar-tick';
    tick.style.left = pct + '%';
    container.appendChild(tick);
  });

  // Marker dot
  const marker = document.createElement('div');
  marker.className = 'bar-marker';
  marker.style.left = '0%';
  container.appendChild(marker);

  // Floating label above the marker
  const markerLabel = document.createElement('div');
  markerLabel.className = 'bar-marker-label';
  markerLabel.style.left = '0%';
  markerLabel.textContent = label;
  container.appendChild(markerLabel);

  // Animate into position after initial paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      const pos = (progress * 100).toFixed(2) + '%';
      fill.style.width       = pos;
      marker.style.left      = pos;
      markerLabel.style.left = pos;
    }, ANIM_DELAY_MS);
  });
}

// ── Main render function — called by main.js ──────────────────
export function renderBars(state) {
  const p = calcProgress(state.date);

  buildBar('bar-synodic', p.synodic, phaseName(p.synodic));

  const decNow    = getMoonDeclinationDeg(state.date);
  const decDir    = p.tropical < 0.5 ? '↑ N' : '↓ S';
  const tropLabel = `${decNow >= 0 ? '+' : ''}${decNow.toFixed(1)}° ${decDir}`;
  buildBar('bar-tropical', p.tropical, tropLabel);

  const nodalPct = (p.nodal * 100).toFixed(0);
  buildBar('bar-nodal', p.nodal, `${nodalPct}% of cycle`);
}
