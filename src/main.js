// src/main.js — app entry point

import { renderBars } from './bars.js';
import { renderWaves, initWaves } from './waves.js';
import { renderDome, initDome } from './dome.js';
import { renderDayChart, initDayChart } from './daychart.js';
import { renderTimeline, initTimeline } from './timeline.js';
import { renderMoonGrade, initMoonGrade } from './moongrade.js';
import { initLearn, pauseLearn, resumeLearn } from './learn.js';

// ── Debounce helper ─────────────────────────────────────────
function debounce(fn, ms) {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}

// ── App state ─────────────────────────────────────────────────
// This object is the single source of truth for the whole app.
// Every visualization reads from here; inputs write to here.
const state = {
  date: new Date(),
  lat: 40.7128,   // default: New York City
  lon: -74.0060,
  locationName: 'New York, NY',
};

// ── DOM references ────────────────────────────────────────────
const dateInput     = document.getElementById('date-input');
const locationInput = document.getElementById('location-input');
const gpsBtn        = document.getElementById('gps-btn');
const locationStatus = document.getElementById('location-status');

// ── Initialise inputs with default values ─────────────────────
function toDateInputValue(date) {
  // date inputs expect "YYYY-MM-DD" in local time
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

dateInput.value = toDateInputValue(state.date);
locationInput.value = state.locationName;

// ── State change handler ──────────────────────────────────────
// Called whenever date or location changes.
function onStateChange() {
  renderBars(state);
  renderMoonGrade(state);
  renderTimeline(state);
  renderDayChart(state);
  renderWaves(state);
  renderDome(state);
}

// ── Date input ────────────────────────────────────────────────
dateInput.addEventListener('change', () => {
  // Parse the date string as local midnight (avoid timezone shift)
  const [y, m, d] = dateInput.value.split('-').map(Number);
  state.date = new Date(y, m - 1, d);
  onStateChange();
});

// ── Location: manual text entry ───────────────────────────────
// Uses the browser's free Nominatim geocoding (OpenStreetMap) to
// convert a city name into latitude/longitude.
locationInput.addEventListener('change', async () => {
  const query = locationInput.value.trim();
  if (!query) return;

  locationStatus.textContent = 'Searching…';

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    if (!data.length) {
      locationStatus.textContent = 'Location not found. Try a city name or "lat, lon".';
      return;
    }

    state.lat = parseFloat(data[0].lat);
    state.lon = parseFloat(data[0].lon);
    state.locationName = data[0].display_name.split(',').slice(0, 2).join(',').trim();
    locationInput.value = state.locationName;
    locationStatus.textContent = `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
    onStateChange();
  } catch {
    locationStatus.textContent = 'Could not reach geocoding service.';
  }
});

// ── Location: GPS button ──────────────────────────────────────
gpsBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    locationStatus.textContent = 'Geolocation not supported by this browser.';
    return;
  }

  locationStatus.textContent = 'Detecting…';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
      state.locationName = `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
      locationInput.value = state.locationName;
      locationStatus.textContent = 'Location set from GPS.';
      onStateChange();
    },
    () => {
      locationStatus.textContent = 'GPS access denied or unavailable.';
    }
  );
});

// ── Tab switching ─────────────────────────────────────────────
let activeTab = 'observe';
let learnInitialized = false;

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === activeTab) return;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
    activeTab = tab;

    if (tab === 'learn') {
      if (!learnInitialized) {
        initLearn();
        learnInitialized = true;
      } else {
        resumeLearn();
      }
    } else {
      pauseLearn();
      // Re-render observe tab (canvas sizes may have been 0 while hidden)
      onStateChange();
    }
  });
});

// ── Initial render ────────────────────────────────────────────
// initWaves/initDome wire up events immediately, but we defer the
// first render until after the browser has laid out the page so
// all containers have non-zero clientWidth/clientHeight.
initWaves();
initDome();
initDayChart();
initTimeline();
initMoonGrade();
requestAnimationFrame(() => onStateChange());

// ── Service Worker registration (PWA offline support) ─────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration is best-effort — app works fine without it
    });
  });
}
