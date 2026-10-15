# Architecture

## The idea
A `.note` file is a ZIP of protobuf shape records and binary point streams on 2100-unit **tiles** (see
[format-spec.md](format-spec.md)). The app loads it into an in-memory document, shows and edits that, and writes it back
**non-destructively**: the original archive is kept and only what changed is added or removed, so anything the app does not
understand survives a save.

```
 .note / .pdf --> model/note-loader --> StarNoteDocument --> render/canvas-renderer (view, tools, undo)
                                              ^                       |
                                              |                       v
 Drive / Zotero <--> integrations/*     data/library (IndexedDB) <-- model/note-serializer --> .note, .svg, .pdf
```

## src/
| Folder / file | Responsibility |
|---|---|
| `cli/main.ts` | the command line; bundled by `scripts/build-cli.mjs`, uses `model/` and `render/pdf-export.ts` only |
| `main.ts` | the UI shell: library, editor tabs, toolbar and options, dialogs, text/LaTeX editor, sync runner, exports |
| `model/note-loader.ts` | `.note` ZIP to `StarNoteDocument` (tiles, strokes, text boxes); detects page stacks vs free-form canvas |
| `model/note-serializer.ts` | document to `.note`: appends new strokes and text boxes, deletes erased ones and removed pages; SVG export |
| `model/stroke-interpolator.ts` | `#points` binary parsing, Catmull-Rom smoothing, variable-width ribbon geometry |
| `model/pages.ts` | page formats and templates, stacking pages (`relayout`), the sidecar `interop/pages.json` |
| `model/pens.ts`, `shapes.ts`, `math.ts` | pen kinds, shape outlines, LaTeX to SVG (MathJax, loaded on first use) |
| `render/canvas-renderer.ts` | the canvas: pan/zoom, pen, eraser, lasso, shapes, text, undo/redo, page operations; two layers (page canvas + overlay) |
| `render/pdf-loader.ts`, `pdf-export.ts` | PDF pages to bitmaps (pdf.js); annotated-PDF writer |
| `data/library.ts`, `sync.ts` | the local note library (IndexedDB); the two-way Drive sync engine |
| `integrations/google-drive.ts`, `zotero.ts`, `net.ts` | Google sign-in (web and desktop PKCE) and Drive REST; Zotero Web API; native-vs-browser `fetch` |

Dependencies point one way: `main.ts` -> `render`, `data`, `integrations` -> `model`; `cli/` -> `model`. `model/` has no UI code, which is why the CLI can reuse it.

## Ideas worth knowing before changing things
- **Strokes are tile-local.** A saved stroke's points are relative to its tile (`stroke.src` says where it lives in the
  archive). A stroke drawn this session is in world coordinates until the next save (`userDrawnStrokes`).
- **Edits are queued, then applied on save.** Erased saved strokes, deleted text boxes and removed pages sit in
  `doc.removedStrokes` / `removedTextBoxes` / `removedPages` until `exportStarNoteArchive` deletes them from the archive.
  Moving, recoloring or resizing a selection is "erase the old strokes + add new ones", so one undo step reverses it.
- **Pages.** A note made here (and every PDF) is a *stack*: finite pages in a column, ordered by `doc.tiles` (Map order),
  laid out by `relayout`. A real StarNote note is a free-form *canvas* of tiles and is left as it is.
- **Rendering speed.** The page canvas is painted only when the page changes and *slid* when panning; the pen's live stroke,
  the selection and the lasso live on a transparent overlay canvas. Stroke outlines are cached as `Path2D`; off-screen pages
  and strokes are skipped.
- **Platforms.** `net.ts` decides between browser `fetch` and Tauri's native HTTP (no CORS). The Android app adds
  `window.StarNoteAndroid.saveFile` (Kotlin, `src-tauri/gen/android/.../MainActivity.kt`) because the WebView ignores
  in-page downloads.
- **Layouts.** The editor switches to the wide-phone layout (left tool rail) for landscape screens under 520 px tall
  (`@media` block at the end of `src/styles.css`, `compact` in `main.ts`).

## Tests
`test/*.test.mjs` bundle the real source modules with esbuild and run them against fakes (a fake Drive and Zotero server,
the real sample `.note`, poppler/Pillow for PDF output). There are no mocks of the format code.
