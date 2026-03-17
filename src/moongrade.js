// src/moongrade.js — Moon grade scoring system + stacked bar chart
//
// Rates each night 0–100 on three equally-weighted factors:
//   1. Illumination  — how full the moon is
//   2. Dark duration — % of astronomical darkness the moon is above horizon
//   3. Peak altitude — highest moon altitude during dark hours
//
// Composite score = geometric mean of the three sub-scores.

import SunCalc from 'suncalc';
import { MS_PER_DAY, MONTHS, stdOffsetMs, stdMidnight } from './astronomy.js';

// ── Sampling resolution ─────────────────────────────────────
const SAMPLE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ── Chart constants ─────────────────────────────────────────
const MIN_DAYS = 91;
const MARGIN   = { top: 44, right: 16, bottom: 52, left: 42 };
const DPR      = window.devicePixelRatio || 1;

let chartDays    = 91;
let currentState = null;

function debounce(fn, ms) {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}

// ── Find astronomical darkness window for a given night ─────
function getDarkWindow(date, lat, lon) {
  const offset = stdOffsetMs(lon);
  const local  = new Date(date.getTime() - offset);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();

  const midnight      = stdMidnight(y, m, d, lon);
  const timesToday    = SunCalc.getTimes(midnight, lat, lon);
  const timesTomorrow = SunCalc.getTimes(new Date(midnight.getTime() + 86400000), lat, lon);

  let darkStart = timesToday.night;
  let darkEnd   = timesTomorrow.nightEnd;

  if (!darkStart || isNaN(darkStart.getTime())) {
    const noonAlt = SunCalc.getPosition(midnight, lat, lon).altitude;
    if (noonAlt < -18 * Math.PI / 180) {
      darkStart = new Date(midnight.getTime() - 12 * 3600000);
      darkEnd   = new Date(midnight.getTime() + 12 * 3600000);
    } else {
      return null;
    }
  }

  if (!darkEnd || isNaN(darkEnd.getTime())) {
    darkEnd = new Date(midnight.getTime() + 12 * 3600000);
  }

  return { start: darkStart, end: darkEnd };
}

// ── Compute the three sub-scores ────────────────────────────
export function computeGrade(date, lat, lon) {
  const illum = SunCalc.getMoonIllumination(date);
  const illumination = illum.fraction * 100;

  const dark = getDarkWindow(date, lat, lon);

  if (!dark) {
    return { illumination: Math.round(illumination), duration: 0, altitude: 0, composite: 0 };
  }

  const darkLengthMs = dark.end - dark.start;
  let moonAboveMs = 0;
  let peakAlt = 0;

  for (let t = dark.start.getTime(); t <= dark.end.getTime(); t += SAMPLE_INTERVAL_MS) {
    const pos = SunCalc.getMoonPosition(new Date(t), lat, lon);
    const altDeg = pos.altitude * (180 / Math.PI);
    if (altDeg > 0) {
      moonAboveMs += SAMPLE_INTERVAL_MS;
      if (altDeg > peakAlt) peakAlt = altDeg;
    }
  }

  if (moonAboveMs > darkLengthMs) moonAboveMs = darkLengthMs;

  const duration = darkLengthMs > 0 ? (moonAboveMs / darkLengthMs) * 100 : 0;
  const altitude = Math.min(peakAlt / 90 * 100, 100);

  const a = illumination, b = duration, c = altitude;
  const composite = (a > 0 && b > 0 && c > 0) ? Math.pow(a * b * c, 1 / 3) : 0;

  return {
    illumination: Math.round(illumination),
    duration:     Math.round(duration),
    altitude:     Math.round(altitude),
    composite:    Math.round(composite),
  };
}

// ── Today's grade display ───────────────────────────────────
export function renderMoonGrade(state) {
  currentState = state;
  const g = computeGrade(state.date, state.lat, state.lon);

  document.getElementById('grade-score').textContent = g.composite;

  setSubScore('grade-illum',    g.illumination);
  setSubScore('grade-duration', g.duration);
  setSubScore('grade-altitude', g.altitude);

  drawChart(document.getElementById('gradechart-canvas'), state);
}

function setSubScore(id, value) {
  const bar   = document.querySelector(`#${id} .grade-bar-fill`);
  const label = document.querySelector(`#${id} .grade-bar-value`);
  if (bar)   bar.style.width = value + '%';
  if (label) label.textContent = value;
}

// ── Stacked bar chart ───────────────────────────────────────

function resizeChart(canvas) {
  const container  = canvas.parentElement;
  const containerW = container.clientWidth - 32;
  const h          = Math.min(400, Math.max(240, containerW * 0.4));

  const basePlotW = containerW - MARGIN.left - MARGIN.right;
  const baseColW  = basePlotW / MIN_DAYS;
  const plotW     = Math.max(basePlotW, chartDays * baseColW);
  const w         = plotW + MARGIN.left + MARGIN.right;

  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width  = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { w, h };
}

function drawChart(canvas, state) {
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const { w, h } = resizeChart(canvas);

  const plotW = w - MARGIN.left - MARGIN.right;
  const plotH = h - MARGIN.top  - MARGIN.bottom;
  const half  = Math.floor(chartDays / 2);
  const colW  = plotW / chartDays;
  const gap   = Math.max(1, colW * 0.1);
  const barW  = colW - gap;

  const colX  = i => MARGIN.left + i * colW;
  // Y-axis: 0 at top, 300 at bottom (3 × 100 max)
  const maxY  = 300;
  const valY  = v => MARGIN.top + plotH - (v / maxY) * plotH;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(8, 12, 26, 0.95)';
  ctx.fillRect(MARGIN.left, MARGIN.top, plotW, plotH);

  // Y-axis gridlines
  ctx.font         = `${10}px "JetBrains Mono"`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'right';

  [0, 100, 200, 300].forEach(v => {
    const y = valY(v);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, y);
    ctx.lineTo(MARGIN.left + plotW, y);
    ctx.stroke();

    ctx.fillStyle = '#2a3050';
    ctx.fillText(String(v), MARGIN.left - 8, y);
  });

  // Columns
  const COLORS = {
    illum: { fill: 'rgba(240,216,144,0.55)', dim: 'rgba(240,216,144,0.25)' },
    dur:   { fill: 'rgba(106,172,224,0.55)', dim: 'rgba(106,172,224,0.25)' },
    alt:   { fill: 'rgba(184,130,200,0.55)', dim: 'rgba(184,130,200,0.25)' },
  };

  for (let i = 0; i < chartDays; i++) {
    const daysOff = i - half;
    const dayDate = new Date(state.date.getTime() + daysOff * MS_PER_DAY);
    const g       = computeGrade(dayDate, state.lat, state.lon);
    const x       = colX(i);
    const isToday = daysOff === 0;

    // Column background
    ctx.fillStyle = isToday ? 'rgba(30, 38, 70, 0.6)' : 'rgba(16, 22, 44, 0.55)';
    ctx.fillRect(x, MARGIN.top, barW, plotH);

    // Stack: illumination (bottom), duration (middle), altitude (top)
    let base = 0;

    // Illumination segment
    ctx.fillStyle = isToday ? COLORS.illum.fill : COLORS.illum.dim;
    const illumH = (g.illumination / maxY) * plotH;
    ctx.fillRect(x, valY(base + g.illumination), barW, illumH);
    base += g.illumination;

    // Duration segment
    ctx.fillStyle = isToday ? COLORS.dur.fill : COLORS.dur.dim;
    const durH = (g.duration / maxY) * plotH;
    ctx.fillRect(x, valY(base + g.duration), barW, durH);
    base += g.duration;

    // Altitude segment
    ctx.fillStyle = isToday ? COLORS.alt.fill : COLORS.alt.dim;
    const altH = (g.altitude / maxY) * plotH;
    ctx.fillRect(x, valY(base + g.altitude), barW, altH);
  }

  // ── Lunar solstice markers ──
  // Same as daychart: peak north declination (gold ▼), peak south (blue ▼).
  {
    const decl = new Array(chartDays);
    for (let i = 0; i < chartDays; i++) {
      const dOff = i - half;
      const d    = new Date(state.date.getTime() + dOff * MS_PER_DAY);
      const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
      decl[i] = SunCalc.getMoonPosition(noon, 90, 0).altitude;
    }

    const tipY  = MARGIN.top - 5;
    const baseY = MARGIN.top - 11;
    const hw    = 4;

    ctx.save();
    ctx.setLineDash([]);
    for (let i = 1; i < chartDays - 1; i++) {
      const isNorth = decl[i] > decl[i - 1] && decl[i] > decl[i + 1];
      const isSouth = decl[i] < decl[i - 1] && decl[i] < decl[i + 1];
      if (!isNorth && !isSouth) continue;

      const cx = colX(i) + colW / 2;
      ctx.fillStyle = isNorth ? 'rgba(240,216,144,0.85)' : 'rgba(106,172,224,0.85)';
      ctx.beginPath();
      ctx.moveTo(cx,      tipY);
      ctx.lineTo(cx - hw, baseY);
      ctx.lineTo(cx + hw, baseY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Chart border
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([]);
  ctx.strokeRect(MARGIN.left, MARGIN.top, plotW, plotH);

  // Today marker
  const todayX = colX(half) + colW / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(todayX, MARGIN.top);
  ctx.lineTo(todayX, MARGIN.top + plotH);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle    = 'rgba(255,255,255,0.35)';
  ctx.font         = `${12}px "Cormorant Garamond"`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Today', todayX, MARGIN.top - 12);

  // X-axis labels
  ctx.font         = `${10}px "JetBrains Mono"`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'center';

  const tickEvery = chartDays <= 91 ? 7 : chartDays <= 181 ? 14 : 30;

  for (let i = 0; i < chartDays; i += tickEvery) {
    const daysOff = i - half;
    const d       = new Date(state.date.getTime() + daysOff * MS_PER_DAY);
    const label   = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    const x       = colX(i) + colW / 2;

    ctx.fillStyle = '#2a3050';
    ctx.fillText(label, x, h - MARGIN.bottom + 8);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, MARGIN.top);
    ctx.lineTo(x, MARGIN.top + plotH);
    ctx.stroke();
  }

  // Scroll today into view
  const container = canvas.parentElement;
  if (w > container.clientWidth) {
    const todayCentreX = MARGIN.left + half * colW + colW / 2;
    container.scrollLeft = todayCentreX - container.clientWidth / 2;
  } else {
    container.scrollLeft = 0;
  }
}

// ── Tooltip ─────────────────────────────────────────────────

function attachTooltip(canvas, tooltip) {
  canvas.addEventListener('mousemove', e => {
    if (!currentState) return;

    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const cw    = canvas.clientWidth;
    const ch    = canvas.clientHeight;
    const plotW = cw - MARGIN.left - MARGIN.right;

    if (mx < MARGIN.left || mx > cw - MARGIN.right ||
        my < MARGIN.top  || my > ch - MARGIN.bottom) {
      tooltip.style.display = 'none';
      return;
    }

    const colIdx = Math.floor((mx - MARGIN.left) / (plotW / chartDays));
    if (colIdx < 0 || colIdx >= chartDays) { tooltip.style.display = 'none'; return; }

    const daysOff = colIdx - Math.floor(chartDays / 2);
    const dayDate = new Date(currentState.date.getTime() + daysOff * MS_PER_DAY);
    const g       = computeGrade(dayDate, currentState.lat, currentState.lon);

    const dateStr  = `${MONTHS[dayDate.getMonth()]} ${dayDate.getDate()}`;
    const dayLabel = daysOff === 0 ? 'Today' : daysOff > 0 ? `+${daysOff}d` : `${daysOff}d`;

    tooltip.innerHTML =
      `<strong>${dateStr}</strong> (${dayLabel})<br>` +
      `<span style="color:#f0d890">Illumination:</span> ${g.illumination}<br>` +
      `<span style="color:#6aaace">Dark-sky time:</span> ${g.duration}<br>` +
      `<span style="color:#b882c8">Peak altitude:</span> ${g.altitude}<br>` +
      `Composite: <strong>${g.composite}</strong>`;

    tooltip.style.display = 'block';
    let tx = mx + 16;
    if (tx + 200 > cw) tx = mx - 210;
    tooltip.style.left = tx + 'px';
    tooltip.style.top  = (my - 10) + 'px';
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}

// ── Init (wires up events) ──────────────────────────────────

export function initMoonGrade() {
  const canvas  = document.getElementById('gradechart-canvas');
  const tooltip = document.getElementById('gradechart-tooltip');
  if (!canvas) return;
  if (tooltip) attachTooltip(canvas, tooltip);

  document.querySelectorAll('.gradechart-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chartDays = parseInt(btn.dataset.days, 10);
      document.querySelectorAll('.gradechart-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentState) drawChart(canvas, currentState);
    });
  });

  window.addEventListener('resize', debounce(() => {
    if (currentState) drawChart(canvas, currentState);
  }, 150));
}
