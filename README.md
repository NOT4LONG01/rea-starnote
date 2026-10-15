# rea-starnote

A viewer, editor and sync client for StarNote (`.note`) files, rebuilt from the real app's output with reverse-engineering
tools. Version 0.x: under active testing, not yet a 1.0 release.

## The products
| | Where it runs | Notes |
|---|---|---|
| **Android app** | phones and tablets (wide-phone layout for e.g. the Galaxy Note 8) | Tauri Android, signed APK. [docs/android.md](docs/android.md) |
| **Windows app** | Windows 10/11 | Tauri v2 desktop |
| **Linux app** | Linux desktops | Tauri v2 desktop |
| **Command line** | any machine with Node 20+ | inspect, validate, convert and create notes without a window. [docs/cli.md](docs/cli.md) |

All three apps share one TypeScript code base (HTML canvas) and the same connectors:
**Google Drive** (two-way sync of your notes) and **Zotero** (open a library PDF, annotate it, upload the annotated PDF back).
Sign-in secrets (Google client ID/secret, Zotero API key) are typed into the app and stored on the device, never in this repo.

The app also runs in a browser at `http://localhost:1420`. **That web version exists only for development** (fast reload,
e2e tests); it is not a product, and some features (system-browser sign-in, native HTTP, save-as) behave differently there.

What the apps do: pens (pen, brush, highlighter), eraser, lasso (move, recolor, copy, paste), shapes, text and LaTeX math,
finite pages with formats (A4, A5, lined, grid, dots...), PDF import and annotated-PDF export, `.note` and SVG export.
Using them: [docs/user-guide.md](docs/user-guide.md).

## Quick start (developers)
```
npm ci
npm run check        # typecheck + all tests + production build
npm run dev          # dev server on http://localhost:1420 (development only)
npm run tauri dev    # the desktop app, hot reload
npm run cli -- info public/samples/test.note
```
Node 22 (see `.nvmrc`). Full guide: [docs/development.md](docs/development.md).

## Repository layout
```
src/             the app (TypeScript): model/ render/ data/ integrations/, main.ts (the UI), cli/ (the command line)
src-tauri/       desktop + Android shell (Rust, Tauri v2); gen/android is the Android project
public/          static files: sample .note and PDF, web manifest
test/            tests that run the real modules (npm test); test/e2e needs Chrome
docs/            documentation index: docs/README.md
qa/              retest runbooks for the Windows and Android testers
scripts/         build and emulator helper scripts
.github/         CI
```

## Documentation
Start at [docs/README.md](docs/README.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). History: [CHANGELOG.md](CHANGELOG.md).

## Not in the repo
The original StarNote APK (proprietary, far over GitHub's file limit), signing keystores, and any API keys or client secrets.
