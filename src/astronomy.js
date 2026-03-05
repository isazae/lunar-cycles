// src/astronomy.js — shared astronomical constants and helpers
//
// Single source of truth for moon cycle constants and calculations used
// across bars.js, waves.js, dome.js, daychart.js, and timeline.js.

import SunCalc from 'suncalc';

// ── Cycle periods ──────────────────────────────────────────────
export const MS_PER_DAY = 86400000;
export const SYNODIC    = 29.53059;         // days  — new moon to new moon
export const TROPICAL   = 27.3216;          // days  — max-north to max-north
export const NODAL_DAYS = 18.613 * 365.25;  // days  — major to major standstill

// Nodal reference: major standstill peaked ~Jan 2025
export const MAJOR_STANDSTILL = new Date(Date.UTC(2025, 0, 15));

// ── Moon declination ───────────────────────────────────────────
// At lat=90°N the altitude equation reduces to sin(alt) = sin(dec),
// so altitude = declination exactly, at any time or hour angle.
export function getMoonDeclinationDeg(date) {
  const pos = SunCalc.getMoonPosition(date, 90, 0);
  return pos.altitude * (180 / Math.PI);
}

// ── Nodal cycle amplitude ──────────────────────────────────────
// Returns the moon's current max declination (18.5°–28.5°) based on
// position within the 18.6-year nodal cycle.
//
// Uses cosine interpolation so amplitude peaks exactly once per cycle:
//   f = 0.0  (major standstill, Jan 2025) → 28.5°
//   f = 0.5  (minor standstill, ~2034)   → 18.5°
//   f = 1.0  (major standstill again)    → 28.5°
//
// Note: the simpler Math.abs(cos(f·2π)) formula is INCORRECT — it reaches
// its maximum twice per nodal cycle (at f=0 and f=0.5), making the minor
// standstill appear as a second major standstill.
export function moonDeclinationAmplitude(date) {
  const daysSinceMajor = (date - MAJOR_STANDSTILL) / MS_PER_DAY;
  const f = ((daysSinceMajor % NODAL_DAYS) + NODAL_DAYS) % NODAL_DAYS / NODAL_DAYS;
  return 18.5 + (28.5 - 18.5) * (1 + Math.cos(f * 2 * Math.PI)) / 2;
}

// ── Display helpers ────────────────────────────────────────────
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Standard-time midnight helpers ────────────────────────────
// The day charts always use the local timezone's STANDARD (non-DST) offset.
// Math.max picks the larger (positive = west) offset, which is always the
// standard offset because DST reduces it by 1 h (e.g. EST=300, EDT=240).
// This keeps every calendar column exactly 24 h wide with no DST jump.
const _STD_OFFSET_MIN = Math.max(
  new Date(2000, 0, 1).getTimezoneOffset(),  // January — standard in N. Hemisphere
  new Date(2000, 6, 1).getTimezoneOffset()   // July    — standard in S. Hemisphere
);
export const STD_OFFSET_MS = _STD_OFFSET_MIN * 60000;

// Standard-time midnight (00:00 std) for a local calendar date given as y/m/d.
export function stdMidnight(y, m, d) {
  return new Date(Date.UTC(y, m, d) + STD_OFFSET_MS);
}
