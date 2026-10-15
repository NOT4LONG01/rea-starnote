# rea-starnote

A viewer, editor and sync client for StarNote (`.note`) files, rebuilt from the real app's output with reverse-engineering
tools. One TypeScript code base (HTML canvas) that runs in a browser, as a desktop app (Tauri v2: Windows, Linux) and as an
Android app (Tauri Android, with a wide-phone layout for e.g. the Galaxy Note 8).

What it does: pens (pen, brush, highlighter), eraser, lasso (move, recolor, copy, paste), shapes, text and LaTeX math,
finite pages with formats (A4, A5, lined, grid...), PDF import and annotated-PDF export, Google Drive sync and Zotero.

## Quick start
```
npm ci
npm run dev          # http://localhost:1420
npm run check        # typecheck + all tests + production build
```
Node 22 (see `.nvmrc`). Desktop and Android builds: [docs/development.md](docs/development.md) and [docs/android.md](docs/android.md).

## Layout
```
src/             the app (TypeScript): model/ render/ data/ integrations/ and main.ts (the UI)
src-tauri/       desktop + Android shell (Rust, Tauri v2); gen/android is the Android project
public/          static files: service worker, web manifest, sample .note and PDF
test/           tests that run the real modules (npm test)
docs/            architecture, development guide, .note format spec, Android build
qa/              retest runbooks for the Windows and Android testers
scripts/         helper scripts (Waydroid emulator, Linux build dependencies)
.github/         CI
```
Start with [docs/README.md](docs/README.md).

## Not in the repo
The original StarNote APK (proprietary, far over GitHub's file limit) and any API keys or client secrets: those are typed
into the app by the user and never stored in the source.
