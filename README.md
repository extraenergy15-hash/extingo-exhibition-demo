# Extingo — Exhibition Demo

A fully offline-safe, static build of the Extingo control dashboard for exhibition/judging use.
No backend, no live sensor feed, no CDN dependencies — everything a judge's browser needs is
in this repo.

## What's here

| Page | Purpose |
|---|---|
| `index.html` | Manual control dashboard. Judges enter heat/smoke/flame/motion/position values by hand; the page recomputes system status, appends both trend charts, updates the early-warning gauge, and writes to the bounded action log — all client-side. |
| `documents.html` | Write-up, synopsis, system documentation, logbook, presentation, and demo video, each with an inline preview and a direct download link. |

## Folder structure

```
extingo-exhibition-demo/
├── index.html
├── documents.html
├── css/
│   └── style.css              shared dark theme
├── js/
│   ├── manual-dashboard.js    dashboard logic (inputs, charts, prediction, log)
│   └── chart.umd.js           vendored Chart.js 4.4.4 (no CDN — see below)
├── assets/
│   ├── fonts/                 vendored Rajdhani / IBM Plex Sans / IBM Plex Mono (woff2)
│   ├── docs/
│   │   ├── Extingo_Writeup_national_2026.pdf
│   │   ├── Extingo_Synopsis_2026.pdf
│   │   ├── Extingo_System_Documentation.pdf
│   │   └── Extingo_Logbook_2026.pdf
│   ├── presentation.pdf       export your slides as PDF and drop here
│   └── demo-video.mp4         local file — plays with no internet
├── netlify.toml
└── README.md
```

## Why everything is vendored locally

This repo is meant to run at an exhibition table where Wi-Fi may be flaky, blocked, or absent
entirely. Two things that are easy to accidentally leave on a CDN — and therefore able to break
the whole page if the network drops — are bundled locally instead:

- **Chart.js** → `js/chart.umd.js`, pulled from the official npm package, not a CDN `<script>` tag.
- **Fonts** (Rajdhani, IBM Plex Sans, IBM Plex Mono) → `assets/fonts/*.woff2` + `assets/fonts/fonts.css`,
  instead of a Google Fonts `<link>`.

Open `index.html` directly in a browser (no server required) and the whole thing works with
Wi-Fi off.

## Before you build / deploy

1. **Add your remaining assets.** `presentation.pdf` and `demo-video.mp4` aren't in this repo yet —
   drop them into `assets/` with those exact filenames (case-sensitive) and the preview/download
   links on `documents.html` start working immediately, no code changes needed.
2. **Filenames are case-sensitive.** Netlify serves from Linux, so `Extingo_Writeup_national_2026.pdf`
   must match exactly, including capitalization — a common source of a broken preview that works
   fine on Windows locally but 404s once deployed.
3. **`<iframe>` PDF preview depends on the browser's built-in PDF viewer.** Chrome/Edge/Firefox
   desktop render it fine; some mobile browsers and in-app webviews (e.g. Instagram's browser)
   don't and will show a blank pane. The download link next to each preview always works
   regardless, so nothing is ever fully broken — but worth testing on whatever device judges will
   actually use.
4. **Reset Demo** on the dashboard clears both charts, the action log, and all inputs back to
   baseline — use it between judges so each walkthrough starts clean.
5. **Deploying to Netlify:** point a new Netlify site at this repo/folder. `netlify.toml` sets
   `publish = "."` with no build command since this is plain static HTML/CSS/JS — no build step
   to configure on Netlify's side.

## Local development

No build tooling required. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally to avoid any `file://` quirks with the video/PDF embeds:
  ```
  npx serve .
  ```
