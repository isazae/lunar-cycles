// src/timeline.js — horizontal timeline strip
//
// Three view modes (selectable via buttons):
//   3 days  — 3-day window with today at centre
//  15 days  — 15-day window with today at centre
//  29 days  — 29-day window with today at centre (≈ synodic month)

import SunCalc from 'suncalc';
import { MS_PER_DAY, stdMidnight, MONTHS } from './astronomy.js';

const DPR = window.devicePixelRatio || 1;

// ── Layout constants ──────────────────────────────────────────
const STRIP_TOP    = 18;  // px above strip (day labels)
const STRIP_H      = 140; // strip height
const STRIP_BOTTOM = 16;  // px below strip (date labels)
const CANVAS_H     = STRIP_TOP + STRIP_H + STRIP_BOTTOM;

// Sun declination extremes (degrees)
const SUN_DEC_MAX =  23.44;
const SUN_DEC_MIN = -23.44;
// Moon declination extremes at major standstill (degrees)
const MOON_DEC_MAX =  28.5;
const MOON_DEC_MIN = -28.5;

// Fraction of strip height a body's upper transit reaches from the baseline.
function culminationAltFrac(decDeg, latDeg) {
  const dec    = decDeg * Math.PI / 180;
  const lat    = latDeg * Math.PI / 180;
  const altRad = Math.asin(
    Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec)))
  );
  return Math.max(0, altRad) / (Math.PI / 2);
}

let currentState = null;
let currentDays  = 3;   // active range: 3 | 15 | 29

// ── Compute time window from a reference date + days setting ──
// Today's date column is always centred in the window.
function getWindow(ref, days) {
  const y         = ref.getFullYear(), mo = ref.getMonth(), d = ref.getDate();
  const half      = Math.floor(days / 2);
  const t0        = stdMidnight(y, mo, d - half);
  const tToday    = stdMidnight(y, mo, d);
  const tTomorrow = stdMidnight(y, mo, d + 1);
  const t2        = stdMidnight(y, mo, d - half + days);
  return { t0, tToday, tTomorrow, t2 };
}

// ── Moon rise/set intervals over any window ───────────────────
// Searches ±1 day outside the window so cross-midnight domes draw correctly.
function getMoonIntervals(t0, t2, lat, lon) {
  const windowDays = Math.ceil((t2 - t0) / MS_PER_DAY);
  const allMt = [];
  for (let off = -1; off <= windowDays + 1; off++) {
    const d  = new Date(t0.getTime() + off * MS_PER_DAY);
    const d0 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    allMt.push(SunCalc.getMoonTimes(d0, lat, lon));
    allMt.push(SunCalc.getMoonTimes(new Date(d0.getTime() + MS_PER_DAY), lat, lon));
  }

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

  const altAtT0 = SunCalc.getMoonPosition(new Date(t0.getTime() + 60000), lat, lon).altitude;
  let isUp = altAtT0 > 0;

  let currentRise = null;
  if (isUp) {
    const risesBeforeT0 = events.filter(e => e.type === 'rise' && e.t <= t0);
    currentRise = risesBeforeT0.length > 0
      ? risesBeforeT0[risesBeforeT0.length - 1].t
      : t0;
  }

  const intervals = [];
  for (const ev of events) {
    if (ev.t <= t0) continue;
    if (ev.type === 'rise' && !isUp) { currentRise = ev.t; isUp = true; }
    else if (ev.type === 'set' && isUp) {
      if (currentRise !== null) intervals.push({ rise: currentRise, set: ev.t });
      currentRise = null; isUp = false;
    }
  }
  if (isUp && currentRise !== null) {
    const setsAfterT2 = events.filter(e => e.type === 'set' && e.t > t2);
    intervals.push({
      rise: currentRise,
      set: setsAfterT2.length > 0 ? setsAfterT2[0].t : new Date(t2.getTime() + MS_PER_DAY),
    });
  }
  return intervals;
}

// ── Draw a dome (upper half-ellipse) ──────────────────────────
function drawDome(ctx, x1, x2, sy, stripH, altFrac, fillStyle) {
  if (x2 <= x1) return;
  const cx       = (x1 + x2) / 2;
  const rx       = (x2 - x1) / 2;
  const ry       = stripH * Math.max(0, altFrac);
  const baseline = sy + stripH;
  if (ry < 1) return;
  ctx.beginPath();
  ctx.ellipse(cx, baseline, rx, ry, 0, Math.PI, 0, false);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

// ── Draw ──────────────────────────────────────────────────────
function draw(canvas, state, days) {
  const container = canvas.parentElement;
  const w = container.clientWidth;
  canvas.style.width  = w + 'px';
  canvas.style.height = CANVAS_H + 'px';
  canvas.width  = Math.round(w * DPR);
  canvas.height = Math.round(CANVAS_H * DPR);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, w, CANVAS_H);

  const { t0, tToday, tTomorrow, t2 } = getWindow(state.date, days);
  const numDays = Math.round((t2 - t0) / MS_PER_DAY);
  const sy      = STRIP_TOP;
  const toX     = t => ((t - t0) / (t2 - t0)) * w;

  // ── Strip background ──
  ctx.fillStyle = 'rgba(16, 22, 44, 0.95)';
  ctx.fillRect(0, sy, w, STRIP_H);

  // ── Gradients ──
  const sunGrad = ctx.createLinearGradient(0, sy, 0, sy + STRIP_H);
  sunGrad.addColorStop(0,    'rgba(255,215,105,0.58)');
  sunGrad.addColorStop(0.65, 'rgba(255,195,75,0.42)');
  sunGrad.addColorStop(1,    'rgba(255,130,30,0.08)');

  const illum    = SunCalc.getMoonIllumination(state.date).fraction;
  const mr       = Math.round(80  + illum * 175);
  const mg       = Math.round(110 + illum * 145);
  const mb       = Math.round(185 + illum * 70);
  const maTop    = (0.08 + illum * 0.67).toFixed(2);
  const moonGrad = ctx.createLinearGradient(0, sy, 0, sy + STRIP_H);
  moonGrad.addColorStop(0, `rgba(${mr},${mg},${mb},${maTop})`);
  moonGrad.addColorStop(1, `rgba(${mr},${mg},${mb},0.03)`);

  // ── Clip all dome drawing to the strip ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, sy, w, STRIP_H);
  ctx.clip();

  // ── Today column highlight + day separators ──
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(toX(tToday), sy, toX(tTomorrow) - toX(tToday), STRIP_H);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([]);
  for (let i = 1; i < numDays; i++) {
    const x = toX(new Date(t0.getTime() + i * MS_PER_DAY));
    ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, sy + STRIP_H); ctx.stroke();
  }

  // ── Reference altitude lines ──
  const baseline = sy + STRIP_H;
  const refLines = [
    { frac: culminationAltFrac(MOON_DEC_MAX, state.lat), stroke: 'rgba(160,200,255,0.85)', label: '☽ max', col: 0 },
    { frac: culminationAltFrac(MOON_DEC_MIN, state.lat), stroke: 'rgba(160,200,255,0.60)', label: '☽ min', col: 0 },
    { frac: culminationAltFrac(SUN_DEC_MAX,  state.lat), stroke: 'rgba(255,220,100,0.85)', label: '☀ max', col: 1 },
    { frac: culminationAltFrac(SUN_DEC_MIN,  state.lat), stroke: 'rgba(255,220,100,0.60)', label: '☀ min', col: 1 },
  ];
  const LBL_PAD_X = 3, LBL_PAD_Y = 2, LBL_H = 9;
  ctx.font = '9px "JetBrains Mono"';
  ctx.textBaseline = 'middle';
  refLines.forEach(({ frac, stroke, label, col }) => {
    if (frac < 0.01) return;
    const lineY = baseline - STRIP_H * frac;
    if (lineY <= sy || lineY >= sy + STRIP_H) return;

    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([2, 5]);
    ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(w, lineY); ctx.stroke();
    ctx.setLineDash([]);

    const altDeg    = Math.round(frac * 90);
    const leftLabel = `${altDeg}°`;
    const leftTextW = ctx.measureText(leftLabel).width;
    const leftStart = 3 + col * 30;
    ctx.fillStyle = 'rgba(8,12,28,0.82)';
    ctx.fillRect(leftStart, lineY - LBL_H / 2 - LBL_PAD_Y, leftTextW + LBL_PAD_X * 2, LBL_H + LBL_PAD_Y * 2);
    ctx.fillStyle = stroke;
    ctx.textAlign = 'left';
    ctx.fillText(leftLabel, leftStart + LBL_PAD_X, lineY);

    const labelRight = w - 4 - col * 52;
    const rightTextW = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(8,12,28,0.82)';
    ctx.fillRect(labelRight - rightTextW - LBL_PAD_X, lineY - LBL_H / 2 - LBL_PAD_Y, rightTextW + LBL_PAD_X * 2, LBL_H + LBL_PAD_Y * 2);
    ctx.fillStyle = stroke;
    ctx.textAlign = 'right';
    ctx.fillText(label, labelRight, lineY);
  });

  // ── Sun domes: one per day ──
  for (let i = 0; i < numDays; i++) {
    const noon = new Date(t0.getTime() + (i + 0.5) * MS_PER_DAY);
    const sunT = SunCalc.getTimes(noon, state.lat, state.lon);
    const sr = sunT.sunrise, ss = sunT.sunset;
    if (!sr || !ss) continue;
    const peakAlt  = SunCalc.getPosition(sunT.solarNoon, state.lat, state.lon).altitude;
    const altFrac  = Math.max(0, peakAlt) / (Math.PI / 2);
    drawDome(ctx, toX(sr), toX(ss), sy, STRIP_H, altFrac, sunGrad);
  }

  // ── Moon domes ──
  getMoonIntervals(t0, t2, state.lat, state.lon).forEach(({ rise, set }) => {
    const mid     = new Date((rise.getTime() + set.getTime()) / 2);
    const peakAlt = SunCalc.getMoonPosition(mid, state.lat, state.lon).altitude;
    const altFrac = Math.max(0, peakAlt) / (Math.PI / 2);
    drawDome(ctx, toX(rise), toX(set), sy, STRIP_H, altFrac, moonGrad);
  });

  ctx.restore(); // end clip

  // ── Strip border ──
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([]);
  ctx.strokeRect(0.25, sy + 0.25, w - 0.5, STRIP_H - 0.5);

  // ── Today reference line (left edge of today column) ──
  const refLineX = toX(tToday);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(refLineX, sy); ctx.lineTo(refLineX, sy + STRIP_H); ctx.stroke();
  ctx.setLineDash([]);

  // ── "Now" marker ──
  const realNow = new Date();
  const nowX    = toX(realNow);
  if (realNow >= t0 && realNow <= t2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(nowX, sy - 2); ctx.lineTo(nowX, sy + STRIP_H); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.moveTo(nowX,     sy - 2);
    ctx.lineTo(nowX - 4, sy - 10);
    ctx.lineTo(nowX + 4, sy - 10);
    ctx.closePath();
    ctx.fill();
  }

  // ── Labels ──
  ctx.font         = '10px "JetBrains Mono"';
  ctx.setLineDash([]);
  ctx.textBaseline = 'middle';

  // "Today" label above today's column; date labels below at regular intervals
  const todayCx = (toX(tToday) + toX(tTomorrow)) / 2;
  ctx.fillStyle = '#3a4060';
  ctx.textAlign = 'center';
  ctx.fillText('Today', todayCx, sy - 9);

  const lblY = sy + STRIP_H + 9;
  const step  = Math.max(1, Math.round(numDays / 7));
  ctx.fillStyle = '#2a3050';
  for (let i = 0; i <= numDays; i += step) {
    const t   = new Date(t0.getTime() + i * MS_PER_DAY + 60000);
    const lbl = `${MONTHS[t.getMonth()]} ${t.getDate()}`;
    const x   = toX(new Date(t0.getTime() + i * MS_PER_DAY));
    if (i === 0)                 { ctx.textAlign = 'left';   ctx.fillText(lbl, Math.max(2, x), lblY); }
    else if (i + step > numDays) { ctx.textAlign = 'right';  ctx.fillText(lbl, Math.min(w - 2, x), lblY); }
    else                         { ctx.textAlign = 'center'; ctx.fillText(lbl, x, lblY); }
  }
}

// ── Public API ────────────────────────────────────────────────

export function renderTimeline(state) {
  currentState = state;
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  draw(canvas, state, currentDays);
}

export function initTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;

  const container = canvas.parentElement;

  // ── Hover overlay: vertical crosshair + sun/moon altitude readout ──
  const hoverLine = document.createElement('div');
  hoverLine.className    = 'timeline-hover-line';
  hoverLine.style.top    = `${STRIP_TOP}px`;
  hoverLine.style.height = `${STRIP_H}px`;
  container.appendChild(hoverLine);

  const hoverTip = document.createElement('div');
  hoverTip.className = 'timeline-hover-tooltip';
  container.appendChild(hoverTip);

  canvas.addEventListener('mousemove', e => {
    if (!currentState) return;
    const rect   = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (mouseY < STRIP_TOP || mouseY > STRIP_TOP + STRIP_H) {
      hoverLine.style.display = 'none';
      hoverTip.style.display  = 'none';
      return;
    }

    const { t0, t2 } = getWindow(currentState.date, currentDays);
    const t = new Date(t0.getTime() + (mouseX / rect.width) * (t2 - t0));

    const sunAlt  = SunCalc.getPosition(t, currentState.lat, currentState.lon).altitude;
    const moonAlt = SunCalc.getMoonPosition(t, currentState.lat, currentState.lon).altitude;
    const sunDeg  = Math.round(sunAlt  * 180 / Math.PI);
    const moonDeg = Math.round(moonAlt * 180 / Math.PI);

    const hh = t.getHours().toString().padStart(2, '0');
    const mm = t.getMinutes().toString().padStart(2, '0');
    const timeLabel = `${MONTHS[t.getMonth()]} ${t.getDate()} ${hh}:${mm}`;

    hoverLine.style.display = 'block';
    hoverLine.style.left    = `${mouseX}px`;
    hoverTip.style.display  = 'block';
    hoverTip.style.top      = `${STRIP_TOP + STRIP_H / 2}px`;
    hoverTip.innerHTML      = `${timeLabel}<br>☀ ${sunDeg}°<br>☽ ${moonDeg}°`;

    const TIP_GAP = 10;
    if (mouseX < rect.width - 90) {
      hoverTip.style.left  = `${mouseX + TIP_GAP}px`;
      hoverTip.style.right = 'auto';
    } else {
      hoverTip.style.left  = 'auto';
      hoverTip.style.right = `${rect.width - mouseX + TIP_GAP}px`;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoverLine.style.display = 'none';
    hoverTip.style.display  = 'none';
  });

  // ── Range buttons ──
  document.querySelectorAll('.timeline-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.timeline-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDays = parseInt(btn.dataset.days, 10);
      if (currentState) draw(canvas, currentState, currentDays);
    });
  });

  window.addEventListener('resize', () => {
    if (currentState) draw(canvas, currentState, currentDays);
  });
}
