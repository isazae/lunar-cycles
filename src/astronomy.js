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

// Standstill declination extremes (degrees)
export const MAJOR_STANDSTILL_DEG = 28.5;
export const MINOR_STANDSTILL_DEG = 18.5;

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
  return MINOR_STANDSTILL_DEG + (MAJOR_STANDSTILL_DEG - MINOR_STANDSTILL_DEG) * (1 + Math.cos(f * 2 * Math.PI)) / 2;
}

// ── Display helpers ────────────────────────────────────────────
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Location-based midnight helpers ──────────────────────────
// The day charts use the viewed location's timezone (derived from longitude)
// so that midnight is always centred in the chart regardless of the browser's
// local timezone.  Each 15° of longitude = 1 hour; offset is rounded to the
// nearest whole hour for clean alignment.
export function stdOffsetMs(lon) {
  return Math.round(-lon / 15) * 3600000;
}

// Standard-time midnight (00:00 local) for a calendar date at a given longitude.
export function stdMidnight(y, m, d, lon) {
  return new Date(Date.UTC(y, m, d) + stdOffsetMs(lon));
}
