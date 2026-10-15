# Retest 5 (Windows + web): new features since bundle 4

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes you create, prefix `QA-`). Report in `qa\reports\windows-retest5-<date>.md`
and send a summary to `playground-00`.

## 0. Setup
`npm ci` (the new MathJax dependency needs it), then run all of:
`node test-sync.mjs`,
`node test-zotero.mjs`, `node test-pdf-export.mjs`, `node test-desktop-oauth.mjs`, `node test-erase-saved.mjs`,
`node test-pages.mjs`, then `npm run build`. Expected: every test passes (counts: 32, 18, 10, 16, 8, 6, in this order).
`test-pdf-export.mjs` needs `pdfinfo`, `pdftoppm`, `pdftotext` and Python with PIL (Ghostscript is optional): if they are
missing, report BLOCKED for that file only. Then `npm run tauri build` for the exe if the Rust toolchain is there.

## 1. Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence each)
| # | Check | Expected |
|---|---|---|
| R1 | **Pen eraser end** (real pen with an eraser tip): draw, flip the pen, drag over strokes | The eraser end erases whole strokes while it touches; the selected tool stays Pen. If it does nothing, DevTools: note `e.buttons` / `e.button` of the pointerdown (run `addEventListener('pointerdown', e => console.log(e.buttons, e.button), true)`) |
| R2 | **Pen side button** | Hold the side button and draw a loop around strokes: they are selected (blue dashed box, Copy/Delete buttons appear). It does not draw or erase |
| R3 | **Tool bar**: tap Pen, Eraser, Shape, Text, Lasso, Hand | The bar under the toolbar shows only that tool's choices (Pen: pen types + colors + sizes; Eraser: sizes + Clear page; Shape: shape types + colors + sizes; Text: colors). Lasso/Hand show nothing. Tapping the active tool again hides/shows its bar |
| R4 | **Most-used colors**: draw 3 strokes in one color, 1 in another | The color row re-sorts: most used first. Highlighter has its own palette and remembers its own color. Reload the app: order is kept |
| R5 | **Pen types**: draw with each (Ballpoint, Fountain, Brush, Marker, Highlighter) with the real pen at different pressures | Fountain/Brush vary with pressure, Ballpoint barely, Marker/Highlighter not at all. Highlighter is translucent (text under it stays readable) |
| R6 | **Eraser double-tap**: tap the eraser button twice quickly | The page's drawings are erased (text stays), toast says how many strokes; one Undo brings them all back. Two slow taps only hide/show the eraser options |
| R7 | **Lasso**: select strokes (also strokes from a loaded `.note`), drag to move, tap a color, tap a size, Copy, open another note, Paste (also Ctrl+C/X/V, Delete key) | Each works; Undo reverses each step; a move that would leave the page is refused with a message; pasted drawings land in the middle of the view |
| R8 | **Shapes**: line, arrow, rectangle, ellipse, triangle, diamond | Dragging shows a live preview; the result is a clean outline; undo removes it; it can be lassoed/moved/recolored |
| R9 | **Text**: Text tool, tap the page, type two lines, Done; tap the text again; change size/bold; Delete | Text appears where tapped; tapping it reopens the editor; undo/redo work; the note shows unsaved, then saved |
| R10 | **LaTeX**: tick "LaTeX math", type `x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}` (also try the snippet buttons) | Live preview typesets it; Done places the typeset formula; tapping it reopens the source; a broken formula (`\frac{a}{`) shows an error and Done is refused. (First use loads MathJax: note how long) |
| R11 | **New note format**: Create card (or the "+" tab) | The "+" tab makes a note in the last format; the Create card shows a dialog: paper (A4, A5, A6, B5, Letter, Slide, Square), orientation, style (Blank, Lined, Grid, Dotted) with a live preview |
| R12 | **Pages**: scroll to the end of the note | An "Add page" button appears; it adds a page after the last. Page label "n / m" > menu: add after this/at end, Page format (this page or all pages), move up/down, delete (confirm; the last page can't be deleted) |
| R13 | **Pages persist**: draw on pages 1-3, reorder, delete one, Back, close the app completely, reopen | Order, sizes, styles and drawings are as left. PDF notes: pages keep their size, only the style can change; "Add page" after a PDF page works |
| R14 | **Export**: menu > Export PDF on a note with several pages, a highlighter stroke, text, and a formula | One PDF page per note page in order (blank pages included), correct size/orientation, grid/dots/lines as chosen, highlighter transparent. The formula appears as its LaTeX source (known limit) |
| R15 | **Speed** (the main ask: high resolution, fast reaction, 144 Hz): on a 144 Hz display set Windows to 144 Hz; draw fast scribbles and long strokes with the pen; scroll a long note; pinch-zoom; open DevTools > Rendering > "Frame Rendering Stats" | Pen ink follows the pen tightly (note any visible lag behind the tip), scrolling and drawing hold the display's refresh rate (report the fps shown), zoom is smooth and sharpens when you stop. Note GPU, display Hz, scaling %, and a note with 1000+ strokes if you can make one |
| R16 | **Sharpness**: zoom in 300% on handwriting, text and a formula; PDF page text | Ink, text and formula edges stay crisp (vector). PDF page text is a bitmap (known limit: it softens past ~200%) |
| R17 | **Old notes**: open notes made with earlier bundles, and `samples\test.note` (a free-form StarNote canvas) | They open as before. `test.note` stays free-form (no page menu; infinite tiles), everything else works on it (pens, lasso, text editing incl. its HELLO_INTEROP_TEST box, erase saved strokes) |
| R18 | **Real StarNote interop** (only if the person has the real app and a copy of a note): save a note here with a deleted stroke, a text box, a highlighter stroke and a page of another size, then open it in real StarNote | Report whether it opens and what it shows. This is the biggest unknown: our output for these was verified only by our own loader |

## 2. Known limits (do not report as bugs)
- Math in the PDF export is LaTeX source, not typeset. Text boxes can't be moved with the lasso.
- Pictures can't be pasted (a message says so). PDF page images are 2100 px wide.
- Free-form StarNote canvas notes don't get page management.
- Reordering/deleting pages is reflected in this app; real StarNote positions pages by their internal names, so the order there may differ.

## 3. Report
Environment (Windows build, browser/exe, GPU, display Hz and scaling, pen model), the table above, for each FAIL: steps,
expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
