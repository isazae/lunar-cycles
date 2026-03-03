# Lunar Cycles App — Project Brief for Claude Code

## Overview

I'm building a Progressive Web App (PWA) called **Lunar Cycles** that visualizes the three fundamental cycles governing the Moon's appearance and position in the sky. I'm a beginner programmer learning through building — please guide me one step at a time.

The app should let any user, anywhere in the world, select a date and location and see three interactive visualizations update in real time.

## The Three Cycles

1. **Synodic Month** (29.53 days) — governs the Moon's **shape** (phase: new moon → full moon → new moon)
2. **Tropical Month** (27.32 days) — governs the Moon's **position** (declination: how far north or south it appears, which determines how high or low it arcs across the sky)
3. **Nodal Cycle / Lunar Standstill** (18.61 years) — governs the **amplitude** of the tropical month's swing (major standstill = widest swing ±28.5°, minor standstill = narrowest ±18.5°)

## The Three Visualizations

### 1. Progress Bars
Three horizontal bars showing where we are in each cycle today, with an animated dot marking the current position. Each bar goes from the start of the cycle to the end (e.g., New Moon → Full Moon → New Moon for synodic).

- Gold bar = Synodic (phase)
- Blue bar = Tropical (declination)
- Purple bar = Nodal (standstill amplitude)

### 2. Overlapping Sinusoidal Waves
All three cycles displayed as sine waves on the same time axis, with today's position marked on each wave. The user should be able to toggle between 90-day, 180-day, and 1-year views. Interactive tooltip on hover showing values at any point.

- Gold wave = Synodic
- Blue wave = Tropical
- Purple wave = Nodal (appears nearly flat at short timescales due to its 18.6-year period)

### 3. 3D Sky Dome
A rotatable 3D hemisphere representing the sky over the user's location, showing three sets of lunar arcs:

- **Purple band**: The full range of possible lunar paths over the 18.6-year standstill cycle (from minor standstill ±18.5° to major standstill ±28.5° declination)
- **Blue band**: The range of lunar paths during the current tropical month
- **Gold line**: Tonight's specific lunar path, with a glowing dot at the culmination point (highest altitude)

Features: cardinal direction labels (N/S/E/W), altitude markers on the meridian, click-and-drag rotation, zoom in/out buttons, stars in background.

## User Inputs

- **Date picker**: Select any date (defaults to today)
- **Location**: Either GPS auto-detect or manual entry (city name or lat/lon)
- The visualizations should update whenever date or location changes

## Astronomy Notes

The prototypes use simplified sine-wave approximations. For a production app, use a proper astronomy library for accurate Moon positions. Good options:
- **suncalc** (npm package) — lightweight, gives moon position, phase, illumination
- **astronomia** (npm package) — more comprehensive ephemeris calculations

Key formulas used in the prototypes:

**Moon altitude at a given hour angle (HA) and declination (δ) from latitude (φ):**
```
altitude = asin(sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(HA))
```

**Culmination altitude (max height when crossing meridian):**
```
max_altitude = 90° - |φ - δ|
```

**Reference dates for cycle calculations:**
- Known new moon: Jan 29, 2026 ~12:36 UTC
- Major standstill peak: ~January 2025
- Next minor standstill: ~2034

## Tech Stack Suggestion

- **Framework**: Plain HTML/CSS/JS or lightweight React — keep it simple
- **3D**: Three.js (r128) for the sky dome
- **Astronomy**: suncalc or astronomia npm package
- **Deployment**: Vercel or Netlify (free tier)
- **PWA**: Add a manifest.json and service worker so it can be installed on phone home screens

## Design Direction

Dark astronomical theme with:
- Background: dark navy (#0a0e1a to #1a2038 range)
- Gold (#f0d890) for synodic/phase elements
- Blue (#6aaCe0) for tropical/declination elements
- Purple (#b882c8) for nodal/standstill elements
- Typography: Cormorant Garamond for headings, JetBrains Mono for data
- Subtle glowing effects on interactive elements
- Clean, minimal UI — let the visualizations be the focus

## Working Prototypes

I have four working HTML prototypes that contain all the core visualization code. They are standalone HTML files with embedded CSS and JavaScript:

1. **lunar-cycles.html** — First chart showing Moon's declination over a year with full moon positions marked (demonstrates the synodic/tropical drift)
2. **lunar-cycles-bars.html** — Three progress bars showing current position in each cycle
3. **lunar-sine-waves.html** — Three separate sine wave panels, one per cycle
4. **lunar-overlapping.html** — All three sine waves overlaid on single chart with 90/180/365 day toggle
5. **lunar-dome.html** — 3D sky dome over NYC with standstill band, tropical month band, and tonight's path

These prototypes should be used as reference for the visualization code, astronomy calculations, color scheme, and overall aesthetic. The main work is:
1. Setting up a proper project structure
2. Making date and location dynamic (instead of hardcoded)
3. Replacing simplified sine approximations with a real astronomy library
4. Adding PWA support (manifest, service worker)
5. Deploying

## Suggested Build Order

Please guide me through these steps one at a time:

1. **Project setup** — Initialize the project, install dependencies
2. **Date/location inputs** — Add a date picker and location input that store state
3. **Progress bars** — Port the bar visualization, wire it to dynamic date/location
4. **Overlapping waves** — Port the wave chart, wire to inputs
5. **Sky dome** — Port the 3D dome, wire to inputs
6. **Astronomy accuracy** — Replace sine approximations with suncalc/astronomia
7. **PWA setup** — Add manifest.json, service worker, icons
8. **Deploy** — Push to Vercel/Netlify and get a shareable URL

## Notes for Claude Code

- I am a complete beginner at programming — please explain what each step does and why
- Give me one step at a time, and wait for me to confirm before moving on
- If something breaks, help me understand what went wrong before fixing it
- The prototype HTML files will be in my project directory for reference
