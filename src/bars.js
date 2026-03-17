// src/bars.js — Progress bar visualization

import SunCalc from 'suncalc';
import {
  MS_PER_DAY, TROPICAL, NODAL_DAYS, MAJOR_STANDSTILL,
  MAJOR_STANDSTILL_DEG, MINOR_STANDSTILL_DEG,
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
  let clampedDec = decNow;
  if (Math.abs(decNow) > maxDec) {
    console.warn(`[bars] Moon declination ${decNow.toFixed(2)}° exceeds expected amplitude ±${maxDec.toFixed(2)}° — clamping`);
    clampedDec = Math.max(-maxDec, Math.min(maxDec, decNow));
  }
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

// ── Transit altitude at culmination (ha = 0) ──────────────────
// Returns degrees; negative means below horizon at transit.
function transitAlt(decDeg, latDeg) {
  const dec = decDeg * Math.PI / 180;
  const lat = latDeg * Math.PI / 180;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec)) * 180 / Math.PI;
}

// ── Build one bar row ──────────────────────────────────────────
// Uses the same grid layout as the moon grade sub-score bars.
const ANIM_DELAY_MS = 60;

function buildBar(containerId, progress, label) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  // Value label on top
  const value = document.createElement('span');
  value.className = 'bar-value';
  value.textContent = label;
  container.appendChild(value);

  // Track + fill
  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  fill.style.width = '0%';
  track.appendChild(fill);
  container.appendChild(track);

  // Animate into position after initial paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      fill.style.width = (progress * 100).toFixed(2) + '%';
    }, ANIM_DELAY_MS);
  });
}

// ── Main render function — called by main.js ──────────────────
export function renderBars(state) {
  const p = calcProgress(state.date);

  // ── Synodic: phase name above the marker ──
  buildBar('bar-synodic', p.synodic, phaseName(p.synodic));

  // ── Tropical: transit altitude of today's moon above; local transit altitudes below ──
  const decNow = getMoonDeclinationDeg(state.date);
  const todayTransitAlt = transitAlt(decNow, state.lat);
  const tropLabel = todayTransitAlt > 0.5 ? `${Math.round(todayTransitAlt)}°` : 'below horizon';
  buildBar('bar-tropical', p.tropical, tropLabel);

  const tropAmp     = moonDeclinationAmplitude(state.date);
  const tropSouthAlt = transitAlt(-tropAmp, state.lat);
  const tropNorthAlt = transitAlt( tropAmp, state.lat);
  const tropEndLabels = document.getElementById('bar-tropical')?.nextElementSibling;
  if (tropEndLabels) {
    const southStr = tropSouthAlt > 0.5
      ? `▼ S transit ${Math.round(tropSouthAlt)}°`
      : '▼ below horizon';
    const northStr = tropNorthAlt > 0.5
      ? `▲ N transit ${Math.round(tropNorthAlt)}°`
      : '▲ below horizon';
    tropEndLabels.children[0].textContent = southStr;
    tropEndLabels.children[1].textContent = northStr;
    tropEndLabels.children[2].textContent = southStr;
  }

  // ── Nodal: % through cycle above; local transit range at each standstill below ──
  buildBar('bar-nodal', p.nodal, `${Math.round(p.nodal * 100)}% of cycle`);

  const nodalEndLabels = document.getElementById('bar-nodal')?.nextElementSibling;
  if (nodalEndLabels) {
    const lo = alt => Math.max(0, Math.round(alt));
    const minorStr = `⬦ Minor ${lo(transitAlt(-MINOR_STANDSTILL_DEG, state.lat))}°–${lo(transitAlt(MINOR_STANDSTILL_DEG, state.lat))}°`;
    const majorStr = `⬥ Major ${lo(transitAlt(-MAJOR_STANDSTILL_DEG, state.lat))}°–${lo(transitAlt(MAJOR_STANDSTILL_DEG, state.lat))}°`;
    nodalEndLabels.children[0].textContent = minorStr;
    nodalEndLabels.children[1].textContent = majorStr;
    nodalEndLabels.children[2].textContent = minorStr;
  }
}
