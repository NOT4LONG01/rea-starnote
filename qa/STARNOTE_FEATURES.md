# StarNote feature inventory vs. rea-starnote

**Evidence and limits.** Source: `artifacts/starnote.apk` (package `com.onyx.galaxy.global.note`, v1.5.3 / code 5703, minSdk 29,
targetSdk 36), decoded statically with apktool (manifest + the first 2,000 string resources, REA coverage "partial"), plus
the user's screenshots of the running app (library and editor). Strings show a feature *exists*; they do not show how it
behaves, and the app was NOT run (Waydroid would not boot). Anything marked "inferred" is a reading of names/strings.
Purpose: interoperability and feature parity for the user's own use; no code is copied.

## What the manifest says
- Editor = `NoteScribbleActivity`; library = `NoteListActivity`; also file picker, settings, user center (account/Pro), QR scan, image picker.
- **Opens `.note` files via Android VIEW/SEND intents** (content/file URIs, path patterns `*.note`) through `ThirdPartyImportActivity`.
  This is the hook for our real-StarNote interop test: `adb shell am start -a android.intent.action.VIEW -d file:///sdcard/Download/x.note`.
- Cloud connectors in code: Google Drive, OneDrive, Dropbox, Evernote, Baidu, Alibaba (import/backup); Firebase auth, Play Billing (Pro), ML Kit, an on-device handwriting recognizer (`com.sunia.commonv2.provider.HWRProvider2`).
- Foreground services for screen capture and audio recording; biometric/fingerprint lock; camera; mic.
- 16 UI locales (ar de en es fr it ja ko pt ru tr zh ...).

## Feature comparison
Legend: HAVE = we have it, PART = partly, NO = missing. "Format risk" = needs `.note` structures we have not fully decoded (see FORMAT_SPEC.md).

| Area | StarNote (evidence) | Ours today | Port effort / format risk |
|---|---|---|---|
| **Pens** | Ballpoint, fountain, brush, calligraphy 1-5, highlighter, laser pointer, "excerpt" pen; custom "pen box"; stroke thickness + color; adaptive stroke width; fill color + opacity | PART: one pen (pressure width), 5 colors + picker, 3 widths | Pen presets: low (rendering only) but saved brush params must match field 11 JSON: medium risk |
| **Highlighter** | "Highlighter Pen", highlight color, "erase highlighter only" | NO | Needs alpha in saved stroke color/brush type: medium risk |
| **Eraser** | Stroke eraser modes: all / highlighter only / "tape" only; auto-switch back to last tool | PART: erases only strokes drawn since the last save | Deleting saved strokes means editing shape zips + point files: medium effort, medium risk |
| **Lasso** | Accurate lasso and free lasso; select, move, copy | NO | High: rewrites points/shapes |
| **Shapes / lines** | Straight line, circle, arrow, curvy/bidirectional arrow, shape fill, favorite shapes | NO | New shape types (undocumented): high risk |
| **Text** | Text boxes (rich text; our loader reads type 16), text select, "press and hold stylus to select text" | PART: renders text boxes, cannot create/edit | High: type 16 write path |
| **Images / stickers** | Insert photos (batch), camera, scan document, stickers, crop | NO | Medium: image shape + resource files |
| **Layers** | Add/lock/delete layers, per-layer visibility | NO (layer list ignored) | Medium: note_info layer JSON |
| **Pages** | Add/duplicate/copy/delete page, "auto add page", reorder, page links, bookmarks, page ratio lock | PART: fixed tiles, page buttons, fit | Medium: `virtual/page` + note_info updates |
| **Templates / covers** | Paper templates (ruled/grid/dot... + color), custom notebook covers, change template per note | PART: one hard-coded ruled page | Low for rendering; medium to write `template_json` |
| **Canvas modes** | "boundless" infinite canvas; fixed-ratio pages | PART: boundless tiles, view clamped to the note | Matches the format already |
| **Touch behavior** | "Write with one finger, slide with two" setting; stylus-only; palm handling | HAVE: stylus-only, pinch/pan | Done (verify on hardware) |
| **Undo / redo** | Yes | PART: undo/redo for unsaved strokes only | Same limit as eraser |
| **Library** | Notebook grid, covers, All/Notes/PDF tabs, folders + subfolders, multi-level tags (`Notes/Class Notes`), pinned notes (with a max), trash, smart search, sort | PART: grid, tabs, trash, search, sort | Folders/tags/pin: low (local metadata); not part of the `.note` file |
| **PDF** | Import PDFs for annotation, "non-editable PDF" export | PART: import + annotate | Export annotated PDF: medium (render pages to PDF) |
| **Export** | Export pages as image (with/without background), specified pages, PDF, audio | PART: SVG, `.note` | PNG/PDF export: low-medium, no format risk |
| **Backup / sync** | Local backup + auto-backup reminders, auto cloud sync (Wi-Fi only option), Drive/OneDrive/Dropbox/Evernote import | HAVE (better in places): two-way Drive sync, conflict copies, Drive-trash mirroring | Local backup/restore of the whole library: low |
| **Security** | Per-note password (4-12 digits), biometric unlock, layer lock | NO | Low-medium; our storage is plain IndexedDB, so a password would only be a UI lock unless data is encrypted |
| **Recognition** | Handwriting recognition (on-device), handwriting "adjustment/beautification", OCR text recognition, formula handling | NO | High; needs an ML model |
| **AI / audio** | Audio recording synced to ink ("Audio-Ink Sync"), transcription, translation, AI summary (metered "AI points", Pro) | NO | High; paid cloud service on their side |
| **Limits / paywall** | Standard users capped at a number of notebooks; Pro unlocks more + AI | n/a: no limits in ours (a selling point) | n/a |
| **Localization** | 16 languages | English only | Low-medium: string table |
| **Other** | Stopwatch/timer history, laser pointer, screen capture/recording, QR scan | NO | Out of scope |

## Where our app already exceeds StarNote (from this evidence)
Runs on Windows/Linux/Web/Android browsers; no notebook cap; two-way Drive sync with explicit conflict copies; opens/edits PDFs for free; byte-faithful import of `.note` files.

## Suggested port order (value for effort, lowest format risk first)
1. **Page export to PNG and annotated PDF** (no format risk).
2. **Pens: presets incl. highlighter** (render in-app first; verify saved strokes open in real StarNote before shipping the saved form).
3. **Library: folders, tags, pin** + local full backup/restore (all local metadata).
4. **Page templates** (blank/ruled/grid/dot) for new notes.
5. **Real eraser for saved strokes + undo across saves** (edit the archive).
6. Pages add/duplicate/delete; layers; images; text boxes (each needs format work and a real-StarNote check).
Anything format-touching should be gated on one result we do not have yet: **does real StarNote open files our app writes?** (see qa/ANDROID_QA.md Phase 3; blocked until Android runs on this PC or on the user's tablet.)
