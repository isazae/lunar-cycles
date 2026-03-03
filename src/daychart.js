// src/daychart.js — Sun & Moon Rise/Set chart

import SunCalc from 'suncalc';

const MS_PER_DAY = 86400000;

let totalDays = 91;   // current span — updated by range buttons

const MARGIN = { top: 44, right: 16, bottom: 52, left: 52 };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DPR    = window.devicePixelRatio || 1;

let currentState = null;

// ── Helpers ───────────────────────────────────────────────────

// Actual millisecond length of the local calendar day containing 'date'.
// Differs from MS_PER_DAY on DST transition days (23 h or 25 h).
function localDayMs(date) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nextMid  = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return nextMid - midnight;
}

// Fraction of the local calendar day that a Date falls on (0 = midnight, 1 = next midnight).
// Uses actual day length so DST transitions don't cause a jump.
function dayFrac(date) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return (date - midnight) / localDayMs(date);
}

// Moon visibility intervals for a given calendar day, as {s, e} fractions.
// Handles all edge cases: rises only, sets only, wraps past midnight.
function moonBands(dayStart, lat, lon) {
  const dayMs = localDayMs(dayStart); // use actual day length for DST correctness
  const mt = SunCalc.getMoonTimes(dayStart, lat, lon);

  if (mt.alwaysUp)   return [{ s: 0, e: 1 }];
  if (mt.alwaysDown) return [];

  const rise = mt.rise ? (mt.rise - dayStart) / dayMs : null;
  const set  = mt.set  ? (mt.set  - dayStart) / dayMs : null;

  if (rise !== null && set !== null) {
    if (rise < set) {
      // Normal: rises then sets within the day
      return [{ s: rise, e: set }];
    }
    // Moon was up at midnight, sets in the morning, then rises again in the evening
    return [{ s: 0, e: set }, { s: rise, e: 1 }];
  }

  if (rise !== null) return [{ s: rise, e: 1  }]; // rises today, sets tomorrow
  if (set  !== null) return [{ s: 0,    e: set }]; // was up at midnight, sets today
  return [];
}

// Format a Date as "h:mm am/pm"
function fmtTime(d) {
  const h  = d.getHours();
  const m  = d.getMinutes();
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hh}:${m.toString().padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// ── Resize ────────────────────────────────────────────────────

function resize(canvas) {
  const container  = canvas.parentElement;
  const containerW = container.clientWidth - 32; // subtract padding
  const h          = Math.min(520, Math.max(320, containerW * 0.56));

  // Base column width is set by the 91-day layout.
  // For wider ranges the canvas expands beyond the container (horizontal scroll).
  const basePlotW = containerW - MARGIN.left - MARGIN.right;
  const baseColW  = basePlotW / 91;
  const plotW     = Math.max(basePlotW, totalDays * baseColW);
  const w         = plotW + MARGIN.left + MARGIN.right;

  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width  = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { w, h };
}

// ── Main draw ─────────────────────────────────────────────────

function draw(canvas, state) {
  const ctx   = canvas.getContext('2d');
  const { w, h } = resize(canvas);

  const plotW = w - MARGIN.left - MARGIN.right;
  const plotH = h - MARGIN.top  - MARGIN.bottom;
  const half  = Math.floor(totalDays / 2); // index of today's column
  const colW  = plotW / totalDays;
  const gap   = Math.max(1, colW * 0.1); // gap between columns, scales with width
  const barW  = colW - gap;              // active width of each column's content

  const colX  = i => MARGIN.left + i * colW;
  const fracY = f => MARGIN.top  + f * plotH;

  // Reframe: shift y-axis so noon=0 (top), midnight=0.5 (centre), next noon=1 (bottom)
  // old coords: 0=midnight, 0.5=noon, 1=midnight
  // new coords: 0=noon,     0.5=midnight, 1=noon
  const reframe = f => (f + 0.5) % 1.0;

  ctx.clearRect(0, 0, w, h);

  // ── Chart background ──
  ctx.fillStyle = 'rgba(8, 12, 26, 0.95)';
  ctx.fillRect(MARGIN.left, MARGIN.top, plotW, plotH);

  // ── Y-axis gridlines & labels ──
  // New axis: top=noon, centre=midnight, bottom=noon (next day)
  const yTicks = [
    { frac: 0,    label: 'noon' },
    { frac: 0.25, label: '6pm'  },
    { frac: 0.5,  label: '12am' },
    { frac: 0.75, label: '6am'  },
    { frac: 1,    label: 'noon' },
  ];

  ctx.font         = `${10}px "JetBrains Mono"`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'right';

  yTicks.forEach(({ frac, label }) => {
    const y = fracY(frac);

    // Midnight (centre) gets the dashed emphasis line
    ctx.strokeStyle = frac === 0.5
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    if (frac === 0.5) ctx.setLineDash([4, 6]);
    else              ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(MARGIN.left, y);
    ctx.lineTo(MARGIN.left + plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Skip the bottom 'noon' label here; draw it below with bottom-alignment
    if (frac < 1) {
      ctx.fillStyle = '#2a3050';
      ctx.fillText(label, MARGIN.left - 8, y);
    }
  });

  // Bottom noon label — align it just above the bottom border
  ctx.textBaseline = 'bottom';
  ctx.fillStyle    = '#2a3050';
  ctx.fillText('noon', MARGIN.left - 8, fracY(1) + 1);
  ctx.textBaseline = 'middle';

  // ── Columns ──
  for (let i = 0; i < totalDays; i++) {
    const daysOff  = i - half;
    const dayDate  = new Date(state.date.getTime() + daysOff * MS_PER_DAY);
    const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
    const x        = colX(i);

    // Per-column background (slightly lighter than chart bg, contrasts with gap)
    ctx.fillStyle = i === half
      ? 'rgba(30, 38, 70, 0.6)'   // today: slightly highlighted
      : 'rgba(16, 22, 44, 0.55)'; // normal day
    ctx.fillRect(x, MARGIN.top, barW, plotH);

    // ── Sun band ──
    // In the new axis noon=0/1, the daylight period always straddles noon,
    // so it wraps: afternoon sits at the top, morning at the bottom.
    const sunT = SunCalc.getTimes(dayStart, state.lat, state.lon);
    const sr   = sunT.sunrise;
    const ss   = sunT.sunset;

    if (sr && ss) {
      const srF = reframe(dayFrac(sr)); // sunrise in new coords (~0.75)
      const ssF = reframe(dayFrac(ss)); // sunset  in new coords (~0.25)

      if (srF > ssF) {
        // Normal case — band wraps at noon boundary
        // Afternoon segment: top of column (noon → sunset)
        const aY1 = fracY(0), aY2 = fracY(ssF);
        if (aY2 > aY1) {
          const g = ctx.createLinearGradient(0, aY1, 0, aY2);
          g.addColorStop(0,   'rgba(255, 215, 105, 0.52)'); // noon, bright
          g.addColorStop(0.7, 'rgba(255, 195, 75, 0.48)');
          g.addColorStop(1,   'rgba(255, 130, 30, 0.22)');  // sunset, dim
          ctx.fillStyle = g;
          ctx.fillRect(x, aY1, barW, aY2 - aY1);
        }
        // Morning segment: bottom of column (sunrise → noon)
        const mY1 = fracY(srF), mY2 = fracY(1);
        if (mY2 > mY1) {
          const g = ctx.createLinearGradient(0, mY1, 0, mY2);
          g.addColorStop(0,   'rgba(255, 130, 30, 0.22)');  // sunrise, dim
          g.addColorStop(0.3, 'rgba(255, 195, 75, 0.48)');
          g.addColorStop(1,   'rgba(255, 215, 105, 0.52)'); // noon, bright
          ctx.fillStyle = g;
          ctx.fillRect(x, mY1, barW, mY2 - mY1);
        }
      } else {
        // Rare edge case (extreme latitude) — doesn't cross noon, single band
        const y1 = fracY(srF), y2 = fracY(ssF);
        if (y2 > y1) {
          ctx.fillStyle = 'rgba(255, 215, 105, 0.48)';
          ctx.fillRect(x, y1, barW, y2 - y1);
        }
      }
    }

    // ── Moon band(s) ──
    // Color encodes illumination (synodic cycle): full moon = bright white,
    // new moon = near-invisible dim blue. Band length encodes the tropical cycle.
    const illum = SunCalc.getMoonIllumination(dayStart).fraction;
    const mr = Math.round(80  + illum * 175); // 80  → 255
    const mg = Math.round(110 + illum * 145); // 110 → 255
    const mb = Math.round(185 + illum * 70);  // 185 → 255
    const ma = (0.07 + illum * 0.68).toFixed(2); // 0.07 → 0.75
    const moonColor = `rgba(${mr}, ${mg}, ${mb}, ${ma})`;

    moonBands(dayStart, state.lat, state.lon).forEach(({ s, e }) => {
      const ns = reframe(s);
      const ne = reframe(e);
      ctx.fillStyle = moonColor;
      if (ns <= ne) {
        const y1 = fracY(ns), y2 = fracY(ne);
        if (y2 > y1) ctx.fillRect(x, y1, barW, y2 - y1);
      } else {
        // Wraps at noon boundary — two segments
        const h1 = fracY(ne) - fracY(0);
        if (h1 > 0) ctx.fillRect(x, fracY(0),  barW, h1);
        const h2 = fracY(1)  - fracY(ns);
        if (h2 > 0) ctx.fillRect(x, fracY(ns), barW, h2);
      }
    });
  }

  // ── Chart border ──
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([]);
  ctx.strokeRect(MARGIN.left, MARGIN.top, plotW, plotH);

  // ── Today marker ──
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

  // ── Lunar solstice markers ──
  // Sample declination at noon each day (at lat=90, SunCalc altitude = declination).
  // Local maxima = north lunar solstice (gold ▼); local minima = south lunar solstice (blue ▼).
  {
    const decl = new Array(totalDays);
    for (let i = 0; i < totalDays; i++) {
      const dOff = i - half;
      const d    = new Date(state.date.getTime() + dOff * MS_PER_DAY);
      const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
      decl[i] = SunCalc.getMoonPosition(noon, 90, 0).altitude;
    }

    const tipY  = MARGIN.top - 5;   // tip of triangle (pointing at chart)
    const baseY = MARGIN.top - 11;  // base of triangle (in top margin)
    const hw    = 4;                 // half-width of triangle base

    ctx.save();
    ctx.setLineDash([]);
    for (let i = 1; i < totalDays - 1; i++) {
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

  // ── X-axis date labels ──
  ctx.font         = `${10}px "JetBrains Mono"`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'center';

  const tickEvery = totalDays <= 91 ? 7 : totalDays <= 181 ? 14 : 30;

  for (let i = 0; i < totalDays; i += tickEvery) {
    const daysOff = i - half;
    const d       = new Date(state.date.getTime() + daysOff * MS_PER_DAY);
    const label   = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    const x       = colX(i) + colW / 2;

    ctx.fillStyle   = '#2a3050';
    ctx.fillText(label, x, h - MARGIN.bottom + 8);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, MARGIN.top);
    ctx.lineTo(x, MARGIN.top + plotH);
    ctx.stroke();
  }

  // ── Scroll today into view ──
  // When the canvas is wider than the container, scroll so today's column
  // is horizontally centred in the viewport.
  const container = canvas.parentElement;
  if (w > container.clientWidth) {
    const todayCentreX = MARGIN.left + half * colW + colW / 2;
    container.scrollLeft = todayCentreX - container.clientWidth / 2;
  } else {
    container.scrollLeft = 0;
  }
}

// ── Tooltip ───────────────────────────────────────────────────

function attachTooltip(canvas, tooltip) {
  canvas.addEventListener('mousemove', e => {
    if (!currentState) return;

    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const cw    = canvas.clientWidth;
    const ch    = canvas.clientHeight;
    const plotW = cw - MARGIN.left - MARGIN.right;
    const plotH = ch - MARGIN.top  - MARGIN.bottom;

    if (mx < MARGIN.left || mx > cw - MARGIN.right ||
        my < MARGIN.top  || my > ch - MARGIN.bottom) {
      tooltip.style.display = 'none';
      return;
    }

    const colIdx  = Math.floor((mx - MARGIN.left) / (plotW / totalDays));
    if (colIdx < 0 || colIdx >= totalDays) { tooltip.style.display = 'none'; return; }

    const daysOff  = colIdx - Math.floor(totalDays / 2);
    const dayDate  = new Date(currentState.date.getTime() + daysOff * MS_PER_DAY);
    const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());

    const dateStr  = `${MONTHS[dayDate.getMonth()]} ${dayDate.getDate()}`;
    const dayLabel = daysOff === 0 ? 'Today'
      : daysOff > 0 ? `+${daysOff}d`
      : `${daysOff}d`;

    const sunT  = SunCalc.getTimes(dayStart, currentState.lat, currentState.lon);
    const moonT = SunCalc.getMoonTimes(dayStart, currentState.lat, currentState.lon);

    const sunriseStr  = sunT.sunrise   ? fmtTime(sunT.sunrise)  : '—';
    const sunsetStr   = sunT.sunset    ? fmtTime(sunT.sunset)   : '—';
    const moonriseStr = moonT.rise     ? fmtTime(moonT.rise)
      : moonT.alwaysUp   ? 'always up'   : '—';
    const moonsetStr  = moonT.set      ? fmtTime(moonT.set)
      : moonT.alwaysDown ? 'always down' : '—';

    tooltip.innerHTML =
      `<strong>${dateStr}</strong> (${dayLabel})<br>` +
      `<span style="color:#ffc840">☀ Rise:</span> ${sunriseStr}&nbsp;&nbsp;` +
      `<span style="color:#ffc840">Set:</span> ${sunsetStr}<br>` +
      `<span style="color:#94bce4">☽ Rise:</span> ${moonriseStr}&nbsp;&nbsp;` +
      `<span style="color:#94bce4">Set:</span> ${moonsetStr}`;

    tooltip.style.display = 'block';
    let tx = mx + 16;
    if (tx + 240 > cw) tx = mx - 250;
    tooltip.style.left = tx + 'px';
    tooltip.style.top  = (my - 10) + 'px';
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}

// ── Public API ────────────────────────────────────────────────

export function renderDayChart(state) {
  currentState = state;
  const canvas = document.getElementById('daychart-canvas');
  if (!canvas) return;
  draw(canvas, state);
}

export function initDayChart() {
  const canvas  = document.getElementById('daychart-canvas');
  const tooltip = document.getElementById('daychart-tooltip');
  if (!canvas) return;
  if (tooltip) attachTooltip(canvas, tooltip);

  document.querySelectorAll('.daychart-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      totalDays = parseInt(btn.dataset.days, 10);
      document.querySelectorAll('.daychart-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentState) draw(canvas, currentState);
    });
  });

  window.addEventListener('resize', () => {
    if (currentState) draw(canvas, currentState);
  });
}
