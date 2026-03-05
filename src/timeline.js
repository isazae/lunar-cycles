// src/timeline.js — 48-hour horizontal timeline strip
//
// Shows sun and moon as domes (upper half-ellipses) that begin at rise,
// peak at transit, and end at set — within a 48-hour window centred on
// tonight's midnight:
//   left edge  = yesterday midnight (= start of today)
//   centre     = tonight midnight   (= start of tomorrow)
//   right edge = tomorrow midnight  (= start of day after tomorrow)

import SunCalc from 'suncalc';
import { MS_PER_DAY, stdMidnight } from './astronomy.js';

const DPR    = window.devicePixelRatio || 1;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Layout constants ──────────────────────────────────────────
const STRIP_TOP    = 18; // px above strip (day name labels)
const STRIP_H      = 80; // strip height — taller gives better dome aspect ratio
const STRIP_BOTTOM = 16; // px below strip (date / midnight labels)
const CANVAS_H     = STRIP_TOP + STRIP_H + STRIP_BOTTOM;

// Sun declination extremes (degrees)
const SUN_DEC_MAX =  23.44;
const SUN_DEC_MIN = -23.44;
// Moon declination extremes at major standstill (degrees)
const MOON_DEC_MAX =  28.5;
const MOON_DEC_MIN = -28.5;

// Fraction of strip height that a body's upper transit reaches from the baseline.
// Uses the exact formula: sin(alt) = sin(lat)·sin(dec) + cos(lat)·cos(dec).
function culminationAltFrac(decDeg, latDeg) {
  const dec    = decDeg * Math.PI / 180;
  const lat    = latDeg * Math.PI / 180;
  const altRad = Math.asin(
    Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec)))
  );
  return Math.max(0, altRad) / (Math.PI / 2);
}

let currentState = null;

// ── Moon rise/set intervals with actual (unclamped) timestamps ─
// Searches ±24 h outside the strip window so that a dome which started
// yesterday still has its correct peak position when clipped to the strip.
function getMoonIntervals(t0, t2, lat, lon) {
  const allMt = [];
  for (let dayOffset = -1; dayOffset <= 3; dayOffset++) {
    const d = new Date(t0.getTime() + dayOffset * MS_PER_DAY);
    const d0 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    allMt.push(SunCalc.getMoonTimes(d0, lat, lon));
    allMt.push(SunCalc.getMoonTimes(new Date(d0.getTime() + MS_PER_DAY), lat, lon));
  }

  // Collect unique events in extended window [t0 − 24h, t2 + 24h].
  const extStart = new Date(t0.getTime() - MS_PER_DAY);
  const extEnd   = new Date(t2.getTime() + MS_PER_DAY);
  const seen = new Set(), events = [];
  for (const mt of allMt) {
    for (const [type, t] of [['rise', mt.rise], ['set', mt.set]]) {
      if (t && t > extStart && t < extEnd) {
        const key = t.getTime();
        if (!seen.has(key)) { seen.add(key); events.push({ type, t }); }
      }
    }
  }
  events.sort((a, b) => a.t - b.t);

  // Is moon above horizon at the start of the window?
  const altAtT0 = SunCalc.getMoonPosition(new Date(t0.getTime() + 60000), lat, lon).altitude;
  let isUp = altAtT0 > 0;

  // If up at t0, find the most recent rise before t0 (gives correct dome peak).
  let currentRise = null;
  if (isUp) {
    const risesBeforeT0 = events.filter(e => e.type === 'rise' && e.t <= t0);
    currentRise = risesBeforeT0.length > 0
      ? risesBeforeT0[risesBeforeT0.length - 1].t
      : t0; // fallback if rise predates our search window
  }

  const intervals = [];
  for (const ev of events) {
    if (ev.t <= t0) continue; // state already initialised above
    if (ev.type === 'rise' && !isUp) {
      currentRise = ev.t; isUp = true;
    } else if (ev.type === 'set' && isUp) {
      if (currentRise !== null) intervals.push({ rise: currentRise, set: ev.t });
      currentRise = null; isUp = false;
    }
  }

  // Moon still up at the end of the window — find the next set.
  if (isUp && currentRise !== null) {
    const setsAfterT2 = events.filter(e => e.type === 'set' && e.t > t2);
    const nextSet = setsAfterT2.length > 0
      ? setsAfterT2[0].t
      : new Date(t2.getTime() + MS_PER_DAY);
    intervals.push({ rise: currentRise, set: nextSet });
  }

  return intervals;
}

// ── Draw a dome (upper half-ellipse) ─────────────────────────
// x1/x2 are the rise/set x positions (may be outside the canvas — caller clips).
// altFrac (0–1) scales dome height: 1 = zenith passage, 0 = barely above horizon.
// The dome baseline is always at sy + stripH; the peak rises proportionally.
// Canvas ellipse angles (y-axis points down):
//   angle 0    → right point  (cx+rx, baseline)
//   angle π    → left point   (cx−rx, baseline)
//   angle 3π/2 → top point    (cx,    baseline−ry)
// Going clockwise (counterclockwise=false) from π to 2π traces the upper arc.
function drawDome(ctx, x1, x2, sy, stripH, altFrac, fillStyle) {
  if (x2 <= x1) return;
  const cx       = (x1 + x2) / 2;
  const rx       = (x2 - x1) / 2;
  const ry       = stripH * Math.max(0, altFrac);
  const baseline = sy + stripH;
  if (ry < 1) return; // too low to draw meaningfully

  ctx.beginPath();
  ctx.ellipse(cx, baseline, rx, ry, 0, Math.PI, 0, false); // upper arc, left → top → right
  ctx.closePath(); // straight line along the baseline closes the shape
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

// ── Draw ──────────────────────────────────────────────────────
function draw(canvas, state) {
  const container = canvas.parentElement;
  const w = container.clientWidth;
  canvas.style.width  = w + 'px';
  canvas.style.height = CANVAS_H + 'px';
  canvas.width  = Math.round(w * DPR);
  canvas.height = Math.round(CANVAS_H * DPR);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, w, CANVAS_H);

  const ref = state.date;
  const y = ref.getFullYear(), mo = ref.getMonth(), d = ref.getDate();

  // 48-hour window
  const t0 = stdMidnight(y, mo, d);      // yesterday midnight = left edge
  const t1 = stdMidnight(y, mo, d + 1); // tonight midnight   = centre
  const t2 = stdMidnight(y, mo, d + 2); // tomorrow midnight  = right edge

  const sy  = STRIP_TOP;
  const toX = t => ((t - t0) / (t2 - t0)) * w;

  // ── Strip background ──
  ctx.fillStyle = 'rgba(16, 22, 44, 0.95)';
  ctx.fillRect(0, sy, w, STRIP_H);

  // ── Build gradients (vertical: bright at dome peak/top, dim at baseline) ──
  const sunGrad = ctx.createLinearGradient(0, sy, 0, sy + STRIP_H);
  sunGrad.addColorStop(0,    'rgba(255,215,105,0.58)'); // peak (zenith)
  sunGrad.addColorStop(0.65, 'rgba(255,195,75,0.42)');
  sunGrad.addColorStop(1,    'rgba(255,130,30,0.08)');  // baseline (horizon)

  const illum  = SunCalc.getMoonIllumination(ref).fraction;
  const mr     = Math.round(80  + illum * 175);
  const mg     = Math.round(110 + illum * 145);
  const mb     = Math.round(185 + illum * 70);
  const maTop  = (0.08 + illum * 0.67).toFixed(2);
  const moonGrad = ctx.createLinearGradient(0, sy, 0, sy + STRIP_H);
  moonGrad.addColorStop(0, `rgba(${mr},${mg},${mb},${maTop})`); // peak (zenith)
  moonGrad.addColorStop(1, `rgba(${mr},${mg},${mb},0.03)`);     // baseline (horizon)

  // ── Clip all dome drawing to the strip area ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, sy, w, STRIP_H);
  ctx.clip();

  // ── Reference altitude lines ──
  // Horizontal dashed lines showing each body's extreme culmination altitudes
  // at this latitude, so domes can be read against a fixed scale.
  const baseline = sy + STRIP_H;
  const refLines = [
    { frac: culminationAltFrac(MOON_DEC_MAX, state.lat), stroke: 'rgba(160,200,255,0.55)', label: '☽ max' },
    { frac: culminationAltFrac(MOON_DEC_MIN, state.lat), stroke: 'rgba(160,200,255,0.35)', label: '☽ min' },
    { frac: culminationAltFrac(SUN_DEC_MAX,  state.lat), stroke: 'rgba(255,220,100,0.55)', label: '☀ max' },
    { frac: culminationAltFrac(SUN_DEC_MIN,  state.lat), stroke: 'rgba(255,220,100,0.35)', label: '☀ min' },
  ];
  ctx.font         = '8px "JetBrains Mono"';
  ctx.textBaseline = 'middle';
  refLines.forEach(({ frac, stroke, label }) => {
    if (frac < 0.01) return; // body never clears the horizon at this latitude
    const lineY = baseline - STRIP_H * frac;
    if (lineY <= sy || lineY >= sy + STRIP_H) return;

    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(w, lineY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = stroke;
    ctx.textAlign = 'right';
    ctx.fillText(label, w - 3, lineY - 4);
  });

  // ── Sun domes: one per day (today + tomorrow) ──
  // altFrac = peak altitude / 90° — scales dome height to the sun's culmination.
  const sunNoons = [
    new Date(t0.getTime() + 12 * 3600000), // today noon
    new Date(t1.getTime() + 12 * 3600000), // tomorrow noon
  ];
  sunNoons.forEach(noon => {
    const sunT = SunCalc.getTimes(noon, state.lat, state.lon);
    const sr = sunT.sunrise, ss = sunT.sunset;
    if (!sr || !ss) return;
    const peakAlt   = SunCalc.getPosition(sunT.solarNoon, state.lat, state.lon).altitude;
    const sunAltFrac = Math.max(0, peakAlt) / (Math.PI / 2);
    drawDome(ctx, toX(sr), toX(ss), sy, STRIP_H, sunAltFrac, sunGrad);
  });

  // ── Moon domes ──
  // Use actual (unclamped) rise/set times; partial domes are clipped by the strip.
  // altFrac sampled at the midpoint of each rise-set interval (≈ transit time).
  getMoonIntervals(t0, t2, state.lat, state.lon).forEach(({ rise, set }) => {
    const mid        = new Date((rise.getTime() + set.getTime()) / 2);
    const peakAlt    = SunCalc.getMoonPosition(mid, state.lat, state.lon).altitude;
    const moonAltFrac = Math.max(0, peakAlt) / (Math.PI / 2);
    drawDome(ctx, toX(rise), toX(set), sy, STRIP_H, moonAltFrac, moonGrad);
  });

  ctx.restore(); // end clip

  // ── Strip border ──
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([]);
  ctx.strokeRect(0.25, sy + 0.25, w - 0.5, STRIP_H - 0.5);

  // ── Tonight midnight line (centre) ──
  const midX = toX(t1);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(midX, sy);
  ctx.lineTo(midX, sy + STRIP_H);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── "Now" marker ──
  // Uses the real clock so it stays accurate even when the user navigates dates.
  const realNow = new Date();
  const nowX    = toX(realNow);
  if (realNow >= t0 && realNow <= t2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(nowX, sy - 2);
    ctx.lineTo(nowX, sy + STRIP_H);
    ctx.stroke();

    // Small downward-pointing triangle above the strip
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.moveTo(nowX,     sy - 2);
    ctx.lineTo(nowX - 4, sy - 10);
    ctx.lineTo(nowX + 4, sy - 10);
    ctx.closePath();
    ctx.fill();
  }

  // ── Labels ──
  ctx.font         = `10px "JetBrains Mono"`;
  ctx.setLineDash([]);

  // Above strip: "Today" / "Tomorrow"
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#2a3050';
  ctx.textAlign    = 'center';
  ctx.fillText('Today',    w * 0.25, sy - 9);
  ctx.fillText('Tomorrow', w * 0.75, sy - 9);

  // Below strip: date at left edge, "midnight" at centre, date at right edge
  const lblY = sy + STRIP_H + 9;

  const t0date = new Date(t0.getTime() + 60000);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#2a3050';
  ctx.fillText(`${MONTHS[t0date.getMonth()]} ${t0date.getDate()}`, 2, lblY);

  ctx.textAlign = 'center';
  ctx.fillText('midnight', midX, lblY);

  const t2date = new Date(t2.getTime() + 60000);
  ctx.textAlign = 'right';
  ctx.fillText(`${MONTHS[t2date.getMonth()]} ${t2date.getDate()}`, w - 2, lblY);
}

// ── Public API ────────────────────────────────────────────────

export function renderTimeline(state) {
  currentState = state;
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  draw(canvas, state);
}

export function initTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  window.addEventListener('resize', () => {
    if (currentState) draw(canvas, currentState);
  });
}
