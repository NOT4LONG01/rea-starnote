# REA-StarNote

A note-taking app for handwriting, typed text, math and PDFs that reads and writes StarNote (`.note`) files, with Google Drive
sync, Zotero and optional AI help. It runs on **Android, Windows and Linux**, plus a **command line** for working with notes
without a window.

**Version 1.0.0**, the first stable release. Only `x.x.0` versions are stable; versions in between (1.0.1, 1.0.2, ...) are
QA builds. What changed: [CHANGELOG.md](CHANGELOG.md). Next: **1.1.0**, an AI tutor and agent for students and researchers
([docs/roadmap.md](docs/roadmap.md)).

> REA-StarNote is an independent project. It is not made by, affiliated with or endorsed by the makers of StarNote or Onyx.
> It opens StarNote's `.note` files; whether StarNote itself opens files saved by REA-StarNote has not been verified.

## What it does
- **Write**: pen, brush and highlighter with pressure; eraser (and the pen's eraser end); shapes; text boxes and LaTeX math;
  palm rejection once a pen has been used; the pen's side button selects (lasso) with any tool.
- **Notes and notebooks**: pages in many formats (A4, A5, Letter, ruled, grid, dots, ...) or an infinite canvas; notebooks and
  sections, Quick Notes, colours, multi-select, a page browser and a page panel.
- **Select and edit**: lasso to move, recolour, resize, copy and paste ink; **Convert to LaTeX** turns handwritten math into
  a typeset formula (AI).
- **Pictures**: paste or drop a picture onto a page; move, resize, delete.
- **PDFs**: import and annotate; Find searches the PDF's text; highlighted passages are listed; export as an annotated PDF.
- **Find in note**: typed text and PDF text at once; handwriting once the AI has read it (only when you ask).
- **Split view**: two notes or PDFs side by side, resizable, saved as named groups to reopen in one tap.
- **Sync and research**: two-way **Google Drive** sync; **Zotero** (open a library PDF, annotate it, upload it back).
- **Export**: `.note`, SVG, annotated PDF, a `.zip` of several notes.

How to use it: [docs/user-guide.md](docs/user-guide.md).

## Install
| Platform | File | Notes |
|---|---|---|
| Android | `rea-starnote-<version>.apk` | Allow "install unknown apps" once for your file manager; later versions install over it |
| Windows 10/11 | the installer from `npm run tauri build` (`.msi` / setup `.exe`) | |
| Linux | `.deb`, `.rpm` or AppImage from `npm run tauri build` | |
| Command line | `npm run build:cli`, then `npm run cli -- <command>` | Node 22. [docs/cli.md](docs/cli.md) |

Building the apps yourself: [docs/development.md](docs/development.md) and [docs/android.md](docs/android.md).

## Connect your accounts
Everything is set up inside the app; keys and secrets are typed there and stay on your device, never in this repository.
- **Google Drive** (Windows, Linux): your own Google Cloud OAuth client of type *Desktop app*, client ID and secret in the
  Drive dialog's Settings. **Android**: no ID or secret; *Sign in with Google* uses the phone's account, once your Cloud
  project has an OAuth client of type *Android* for `com.starnote.interop` with the app's signing SHA-1 (user guide).
- **Zotero**: an API key from zotero.org/settings/keys, pasted into the Zotero panel.
- **AI** (Convert to LaTeX, reading handwriting): an [OpenRouter](https://openrouter.ai) key and a model that reads images,
  in More > AI settings. Free models often fail on handwriting or run out of their daily limit; a stronger vision model
  (for example Gemini 3 Pro Image) reads it well, at the model's price per request.

## Privacy
Notes are stored on your device and, if you connect it, in your own Google Drive. Nothing is sent to an AI unless you press
*Convert to LaTeX* or *Read handwriting (AI)*: then a picture of the selection or of each page's handwriting goes to OpenRouter
and the model you chose, under your key. Read text is kept on the device, never written into the `.note`.

## For developers
```
npm ci
npm run check        # typecheck + unit tests + production build (must pass before a merge)
npm run test:e2e     # browser tests (needs Chrome)
npm run dev          # dev server on http://localhost:1420 (development only, not a product)
npm run tauri dev    # the desktop app with hot reload
npm run cli -- info public/samples/test.note
```
Branches: `main` holds stable releases only; work happens on `dev` ([docs/branching.md](docs/branching.md)).

```
src/             the app (TypeScript): model/ render/ data/ integrations/, main.ts (the UI), cli/ (the command line)
src-tauri/       desktop and Android shell (Rust, Tauri v2); gen/android is the Android project
public/          static files: sample .note and PDF, web manifest, icons
test/            tests that run the real modules (npm test); test/e2e needs Chrome
docs/            documentation, starting at docs/README.md
qa/              retest runbooks for the testers
scripts/         build and emulator helpers
```
More: [docs/README.md](docs/README.md), [CONTRIBUTING.md](CONTRIBUTING.md). Not in the repository: the original StarNote APK,
signing keys, and any API keys or client secrets.

## License
[MIT](LICENSE). Bundled libraries keep their own licenses: pdf.js and MathJax (Apache-2.0), JSZip (MIT or GPL-3.0), Tauri
(MIT or Apache-2.0).
