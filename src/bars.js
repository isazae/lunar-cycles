// src/bars.js — Progress bar visualization

import SunCalc from 'suncalc';

const MS_PER_DAY = 86400000;
const NODAL_DAYS = 18.613 * 365.25; // ~6798 days

// Nodal: major standstill peaked ~Jan 2025
const MAJOR_STANDSTILL = new Date(Date.UTC(2025, 0, 15));

// ── Get moon's current declination via SunCalc ────────────────
// SunCalc.getMoonPosition returns altitude/azimuth for a specific lat/lon.
// To get true declination (independent of observer location), we sample the
// moon's altitude at the equator (lat=0, lon=0) across 24 hours and find the
// peak — that peak altitude equals the declination at the equator.
// We use a faster approach: sample the moon position at a reference meridian
// crossing. The declination is the altitude when the hour angle = 0 (upper transit).
// Even simpler: SunCalc's altitude at lat=0 when moon transits = declination.
//
// Most accurate approach that works without external ephemeris:
// Sample the moon's "altitude" at the equator across the day to find peak.
// peak_altitude_at_equator ≈ declination (because sin(alt) = sin(dec)*sin(lat) + cos(dec)*cos(lat)*cos(HA)
// at lat=0: sin(alt) = cos(dec)*cos(HA), max when HA=0: sin(alt_max) = cos(dec)...
// Actually at lat=0: alt_max = 90° - |dec|. So dec = 90° - alt_max (signed).
// Simpler: just use the moon's declination derived from its ecliptic coordinates.
// SunCalc exposes getMoonPosition which gives altitude + azimuth. We can recover
// declination by sampling at lat=0, sweeping HA to find transit altitude, then
// declination = transit_altitude (since at equator, transit alt = 90°-|dec| is wrong).
//
// The cleanest method: sample the moon altitude at lat=90° (north pole).
// At the pole, altitude = declination directly (no HA effect).
// sin(alt) = sin(lat)sin(dec) + cos(lat)cos(dec)cos(HA) → at lat=90: sin(alt)=sin(dec).
// So altitude at north pole = declination (regardless of time!).
function getMoonDeclinationDeg(date) {
  // At latitude 90° N, altitude = declination (exactly, at any time).
  const pos = SunCalc.getMoonPosition(date, 90, 0);
  return pos.altitude * (180 / Math.PI);
}

// ── Calculate progress fractions (0–1) for each cycle ────────
function calcProgress(date, lat, lon) {
  // Synodic: use suncalc directly — always accurate, no reference date needed.
  // SunCalc.phase: 0 = new moon, 0.5 = full moon, 1 = back to new moon
  const synodic = SunCalc.getMoonIllumination(date).phase;

  // Tropical: use real declination from SunCalc.
  // Declination ranges from roughly +28.5° (max north) to -28.5° (max south)
  // depending on where we are in the nodal cycle.
  // We map it to 0→1 where:
  //   0 = Max North (positive peak)  — left edge of bar
  //   0.5 = Max South (negative peak) — middle of bar
  //   1 = Max North again            — right edge
  // To get a 0→1 progress, we need to know which direction the moon is heading.
  // We check the declination one day later to determine direction.
  const decNow   = getMoonDeclinationDeg(date);
  const decTomorrow = getMoonDeclinationDeg(new Date(date.getTime() + MS_PER_DAY));
  const movingSouth = decTomorrow < decNow; // heading toward more negative declination

  // The tropical month bar shows position within one cycle (27.32 days).
  // We map declination to bar position:
  //   First half (0→0.5):  moving from Max North → Max South (decreasing dec)
  //   Second half (0.5→1): moving from Max South → Max North (increasing dec)
  //
  // We need the current max declination amplitude (varies with nodal cycle: 18.5°–28.5°)
  const daysSinceMajor   = (date - MAJOR_STANDSTILL) / MS_PER_DAY;
  const nodalFraction    = ((daysSinceMajor % NODAL_DAYS) + NODAL_DAYS) % NODAL_DAYS / NODAL_DAYS;
  const maxDec           = 18.5 + (28.5 - 18.5) * Math.abs(Math.cos(nodalFraction * 2 * Math.PI));

  // Clamp declination to expected range
  const clampedDec = Math.max(-maxDec, Math.min(maxDec, decNow));
  // posInHalf maps declination linearly: +maxDec→0,  0→0.5,  -maxDec→1.0
  // It represents position on the 0→50% half of the cycle (N→S).
  // Moving south (first half):  tropical = posInHalf           → 0% at N, 50% at S
  // Moving north (second half): tropical = 0.5 + (1-posInHalf)*0.5 → 50% at S, 75% at eq, 100% at N
  const posInHalf = (maxDec - clampedDec) / (2 * maxDec);
  const tropical  = movingSouth ? posInHalf : 0.5 + (1 - posInHalf) * 0.5;

  const nodal = ((daysSinceMajor % NODAL_DAYS) + NODAL_DAYS) % NODAL_DAYS / NODAL_DAYS;

  return { synodic, tropical, nodal };
}

// ── Human-readable phase name for synodic progress ───────────
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

// ── Build one bar row (called once per cycle) ─────────────────
function buildBar(containerId, progress, label) {
  const container = document.getElementById(containerId);
  container.innerHTML = ''; // clear for re-renders

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

  // Glow halo behind the marker
  const glow = document.createElement('div');
  glow.className = 'bar-glow';
  glow.style.left = '0%';
  container.appendChild(glow);

  // Marker dot
  const marker = document.createElement('div');
  marker.className = 'bar-marker';
  marker.style.left = '0%';
  container.appendChild(marker);

  // Label above the marker
  const markerLabel = document.createElement('div');
  markerLabel.className = 'bar-marker-label';
  markerLabel.style.left = '0%';
  markerLabel.textContent = label;
  container.appendChild(markerLabel);

  // Animate into position
  requestAnimationFrame(() => {
    setTimeout(() => {
      const pos = (progress * 100).toFixed(2) + '%';
      fill.style.width        = pos;
      marker.style.left       = pos;
      glow.style.left         = pos;
      markerLabel.style.left  = pos;
    }, 60);
  });
}

// ── Main render function — called by main.js ──────────────────
export function renderBars(state) {
  const p = calcProgress(state.date, state.lat, state.lon);

  // Synodic label: phase name + % of cycle
  buildBar('bar-synodic',  p.synodic,  phaseName(p.synodic));

  // Tropical label: actual declination in degrees + direction
  const decNow = getMoonDeclinationDeg(state.date);
  const decDir = p.tropical < 0.5 ? '↓ S' : '↑ N';
  const tropLabel = `${decNow >= 0 ? '+' : ''}${decNow.toFixed(1)}° ${decDir}`;
  buildBar('bar-tropical', p.tropical, tropLabel);

  // Nodal label: proximity to major standstill
  const nodalPct = (p.nodal * 100).toFixed(0);
  buildBar('bar-nodal',    p.nodal,    `${nodalPct}% of cycle`);
}
