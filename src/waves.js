// src/waves.js — Overlapping sine wave visualization

import SunCalc from 'suncalc';
import {
  MS_PER_DAY, SYNODIC, TROPICAL, NODAL_DAYS, MAJOR_STANDSTILL,
  getMoonDeclinationDeg, moonDeclinationAmplitude, MONTHS,
} from './astronomy.js';

const MARGIN = { top: 36, right: 20, bottom: 48, left: 20 };
const DPR    = window.devicePixelRatio || 1;

let totalDays    = 91;  // matches the active range button default
let currentState = null;
let dims         = null;

// ── Build wave descriptors for the current state ──────────────
function buildWaves(state) {
  // Synodic: use SunCalc phase directly so the sine is anchored correctly.
  // SunCalc.phase goes 0→1 (new→full→new). We convert to a -1→+1 sine:
  //   new moon  = 0   → sin = -1 (trough)
  //   full moon = 0.5 → sin = +1 (peak)
  // That means phase 0 corresponds to angle π (sin(π) = 0 going negative).
  // So: sin_value = sin(phase * 2π - π/2) ... or more simply:
  //   synodicOffset = days into cycle = phase * SYNODIC
  const synodicPhase  = SunCalc.getMoonIllumination(state.date).phase;
  const synodicOffset = synodicPhase * SYNODIC; // days past last new moon

  // Tropical: derive offset from real SunCalc declination.
  // The declination follows a cosine curve: dec(t) = maxDec * cos(2π * t / TROPICAL)
  // where t=0 is max-north peak. So:
  //   t = (TROPICAL / 2π) * acos(dec / maxDec)
  // We also need to determine if moon is in the first or second half of the cycle
  // (heading south vs heading north) to resolve the acos ambiguity.
  const decNow      = getMoonDeclinationDeg(state.date);
  const decNext     = getMoonDeclinationDeg(new Date(state.date.getTime() + MS_PER_DAY));
  const movingSouth = decNext < decNow;

  const maxDec = moonDeclinationAmplitude(state.date);

  // Clamp and derive position within tropical cycle.
  // The wave uses sin(offset/T * 2π). We want sin = dec/maxDec at today.
  // acos(dec/maxDec) gives an angle in [0, π] corresponding to the first half of the cosine.
  // Shifting by +T/4 converts from cosine-based to sine-based:
  //   sin((halfCyclePos + T/4) / T * 2π) = cos(halfCyclePos / T * 2π) = dec/maxDec ✓
  // Moving south (first half, 0→T/2):  offset = halfCyclePos + T/4
  // Moving north (second half, T/2→T): offset = T*1.25 - halfCyclePos
  //   (mirrors: at MaxSouth halfCyclePos=T/2 → T*1.25-T/2=T*0.75, at MaxNorth→T*1.25)
  const clampedDec   = Math.max(-maxDec, Math.min(maxDec, decNow));
  const halfCyclePos = (TROPICAL / (2 * Math.PI)) * Math.acos(clampedDec / maxDec); // 0..TROPICAL/2
  const tropicalOffset = movingSouth
    ? halfCyclePos + TROPICAL / 4
    : TROPICAL * 1.25 - halfCyclePos;

  // Nodal: offset so sin=+1 at the major standstill peak
  const daysSinceMajor = (state.date - MAJOR_STANDSTILL) / MS_PER_DAY;
  const nodalOffset    = daysSinceMajor + NODAL_DAYS * 0.25;

  return [
    {
      name: 'Synodic', period: SYNODIC, offset: synodicOffset,
      // phaseShift: New Moon (phase=0) must map to the trough (sin=-1).
      // sin(0 * 2π) = 0, but we need sin = -1. Fix: subtract π/2.
      // sin(0 * 2π - π/2) = sin(-π/2) = -1 ✓  (New Moon = trough)
      // sin(0.5 * 2π - π/2) = sin(π/2) = +1 ✓  (Full Moon = peak)
      phaseShift: -Math.PI / 2,
      color: 'rgba(240,216,144,0.75)', fillColor: 'rgba(240,216,144,0.04)',
      dotColor: '#f0d890', glowColor: 'rgba(240,216,144,0.35)',
      peakLabel: 'Full', troughLabel: 'New',
    },
    {
      name: 'Tropical', period: TROPICAL, offset: tropicalOffset,
      phaseShift: 0, // already correct: Max North → peak (+1), Max South → trough (-1)
      color: 'rgba(106,172,224,0.75)', fillColor: 'rgba(106,172,224,0.04)',
      dotColor: '#6aaace', glowColor: 'rgba(106,172,224,0.35)',
      peakLabel: 'N', troughLabel: 'S',
    },
    {
      name: 'Nodal', period: NODAL_DAYS, offset: nodalOffset,
      phaseShift: 0,
      color: 'rgba(184,130,200,0.65)', fillColor: 'rgba(184,130,200,0.03)',
      dotColor: '#b882c8', glowColor: 'rgba(184,130,200,0.35)',
      peakLabel: 'Major', troughLabel: 'Minor',
    },
  ];
}

// ── Sine value: day=0 is left edge of chart, today is at centre ──
function sineValue(day, wave) {
  const daysFromToday = day - totalDays / 2;
  const cyclePos = (wave.offset + daysFromToday) / wave.period;
  return Math.sin(cyclePos * 2 * Math.PI + (wave.phaseShift || 0));
}

// ── Resize canvas to fit its container ───────────────────────
function resize(canvas) {
  const container = canvas.parentElement;
  const w = container.clientWidth - 32;
  const h = Math.min(420, Math.max(280, w * 0.42));
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width  = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { w, h };
}

// ── Main draw function ────────────────────────────────────────
function draw(canvas, state) {
  const ctx   = canvas.getContext('2d');
  const { w, h } = resize(canvas);
  const waves = buildWaves(state);

  const plotW  = w - MARGIN.left - MARGIN.right;
  const plotH  = h - MARGIN.top  - MARGIN.bottom;
  const midY   = MARGIN.top + plotH / 2;
  const amp    = plotH / 2 - 8;

  const xScale   = d => MARGIN.left + (d / totalDays) * plotW;
  const yScale   = v => midY - v * amp;
  const todayDay = totalDays / 2;
  const todayX   = xScale(todayDay);

  ctx.clearRect(0, 0, w, h);

  // ── Grid ──
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 0.5;
  [-1, -0.5, 0.5, 1].forEach(v => {
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, yScale(v));
    ctx.lineTo(w - MARGIN.right, yScale(v));
    ctx.stroke();
  });

  // Zero line (dashed)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(MARGIN.left, midY);
  ctx.lineTo(w - MARGIN.right, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── X-axis date labels ──
  const startDate    = new Date(state.date.getTime() - (totalDays / 2) * MS_PER_DAY);
  const tickInterval = totalDays <= 91 ? 7 : totalDays <= 181 ? 14 : 30;

  ctx.font      = '11px "JetBrains Mono"';
  ctx.textAlign = 'center';

  for (let d = 0; d <= totalDays; d += tickInterval) {
    const date  = new Date(startDate.getTime() + d * MS_PER_DAY);
    const label = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
    const x     = xScale(d);

    ctx.fillStyle   = '#2a3050';
    ctx.fillText(label, x, h - MARGIN.bottom + 16);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, MARGIN.top);
    ctx.lineTo(x, h - MARGIN.bottom);
    ctx.stroke();
  }

  // ── Today vertical line ──
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(todayX, MARGIN.top);
  ctx.lineTo(todayX, h - MARGIN.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font      = '12px "Cormorant Garamond"';
  ctx.textAlign = 'center';
  ctx.fillText('Today', todayX, MARGIN.top - 12);

  // ── Draw each wave ──
  waves.forEach((wave, wi) => {
    // Filled area under the wave
    ctx.beginPath();
    ctx.moveTo(xScale(0), midY);
    for (let d = 0; d <= totalDays; d += 0.3) {
      ctx.lineTo(xScale(d), yScale(sineValue(d, wave)));
    }
    ctx.lineTo(xScale(totalDays), midY);
    ctx.closePath();
    ctx.fillStyle = wave.fillColor;
    ctx.fill();

    // Wave line
    ctx.beginPath();
    for (let d = 0; d <= totalDays; d += 0.3) {
      const x = xScale(d);
      const y = yScale(sineValue(d, wave));
      d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = wave.color;
    ctx.lineWidth   = wi === 2 ? 2.5 : 1.8;
    ctx.stroke();

    // Peak / trough labels (synodic & tropical only)
    if (wi < 2) {
      ctx.font = '10px "JetBrains Mono"';
      for (let d = 0; d <= totalDays; d += 0.5) {
        const v  = sineValue(d, wave);
        const vN = sineValue(d + 0.5, wave);
        if (v > 0.998 && vN < v) {
          ctx.fillStyle = wave.color.replace('0.75', '0.35').replace('0.65', '0.35');
          ctx.textAlign = 'center';
          ctx.fillText(wave.peakLabel,   xScale(d), yScale(v)  - 8);
        }
        if (v < -0.998 && vN > v) {
          ctx.fillStyle = wave.color.replace('0.75', '0.35').replace('0.65', '0.35');
          ctx.textAlign = 'center';
          ctx.fillText(wave.troughLabel, xScale(d), yScale(v) + 14);
        }
      }
    }

    // Today dot: glow + outer ring + coloured centre
    const todayVal = sineValue(todayDay, wave);
    const dy       = yScale(todayVal);

    const grd = ctx.createRadialGradient(todayX, dy, 0, todayX, dy, 16);
    grd.addColorStop(0, wave.glowColor);
    grd.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(todayX, dy, 16, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(todayX, dy, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(todayX, dy, 4, 0, Math.PI * 2);
    ctx.fillStyle = wave.dotColor;
    ctx.fill();
  });

  return { w, h, xScale, yScale, midY, amp, waves, todayDay };
}

// ── Tooltip logic ─────────────────────────────────────────────
function attachTooltip(canvas, tooltip) {
  canvas.addEventListener('mousemove', e => {
    if (!dims || !currentState) return;

    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const plotW = dims.w - MARGIN.left - MARGIN.right;
    const day   = ((mx - MARGIN.left) / plotW) * totalDays;

    if (day < 0 || day > totalDays) { tooltip.style.display = 'none'; return; }

    const daysFromToday = day - totalDays / 2;
    const dateLabel = daysFromToday === 0 ? 'Today'
      : daysFromToday > 0 ? `+${Math.round(daysFromToday)}d`
      : `${Math.round(daysFromToday)}d`;

    const hoverDate = new Date(currentState.date.getTime() + daysFromToday * MS_PER_DAY);
    const dateStr   = `${MONTHS[hoverDate.getMonth()]} ${hoverDate.getDate()}`;

    const sv = sineValue(day, dims.waves[0]);
    const tv = sineValue(day, dims.waves[1]);
    const nv = sineValue(day, dims.waves[2]);

    const phaseStr = sv > 0.9 ? 'Full Moon'
      : sv < -0.9  ? 'New Moon'
      : sv > 0     ? (sv > sineValue(day - 1, dims.waves[0]) ? 'Waxing' : 'Waning')
      : (sv < sineValue(day - 1, dims.waves[0]) ? 'Waning' : 'Waxing');

    tooltip.innerHTML =
      `<strong>${dateStr}</strong> (${dateLabel})<br>` +
      `<span style="color:#f0d890">Synodic:</span> ${sv.toFixed(2)} (${phaseStr})<br>` +
      `<span style="color:#6aaace">Tropical:</span> ${tv.toFixed(2)}<br>` +
      `<span style="color:#b882c8">Nodal:</span> ${nv.toFixed(2)}`;

    tooltip.style.display = 'block';
    let tx = mx + 16;
    if (tx + 200 > canvas.clientWidth) tx = mx - 210;
    tooltip.style.left = tx + 'px';
    tooltip.style.top  = (my - 10) + 'px';
  });

  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ── Range toggle buttons ──────────────────────────────────────
// Use a specific selector so timeline/daychart buttons (which also carry the
// wave-range-btn class for shared styling) don't accidentally trigger this handler.
const WAVES_BTN_SEL = '.wave-range-btn:not(.timeline-range-btn):not(.daychart-range-btn)';

function attachRangeButtons(canvas) {
  document.querySelectorAll(WAVES_BTN_SEL).forEach(btn => {
    btn.addEventListener('click', () => {
      totalDays = parseInt(btn.dataset.days, 10);
      document.querySelectorAll(WAVES_BTN_SEL).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentState) dims = draw(canvas, currentState);
    });
  });
}

// ── Public render function called by main.js ──────────────────
export function renderWaves(state) {
  currentState = state;
  const canvas = document.getElementById('waves-canvas');
  if (!canvas) return;
  dims = draw(canvas, state);
}

// ── One-time setup (called once on page load) ─────────────────
export function initWaves() {
  const canvas  = document.getElementById('waves-canvas');
  const tooltip = document.getElementById('waves-tooltip');
  if (!canvas) return;

  attachTooltip(canvas, tooltip);
  attachRangeButtons(canvas);
  window.addEventListener('resize', () => {
    if (currentState) dims = draw(canvas, currentState);
  });
}
