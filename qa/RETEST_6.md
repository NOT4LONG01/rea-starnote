# Retest 6 (Windows + web): fixes since bundle 5

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes you create, prefix `QA-`). Use the checks table in `RETEST_5.md` for
everything not listed here (R3-R10, R12-R14, R16-R18 are still to be done), and report in
`qa\reports\windows-retest6-<date>.md` with a summary to `playground-00`.

## 0. Setup
`npm ci`, then `node test/sync.test.mjs`, `node test/zotero.test.mjs`, `node test/pdf-export.test.mjs`, `node test/desktop-oauth.test.mjs`,
`node test/erase-saved.test.mjs`, `node test/pages.test.mjs`, `npm run build`, `npm run tauri build -- --no-bundle`.
Expected test counts, in that order: 32, 18, 10, 17, 8, 6. Notes:
- `test/pdf-export.test.mjs` is now portable (Windows `where`, `python`/`py`, Ghostscript optional). It still needs
  `pdfinfo`, `pdftoppm`, `pdftotext` and Python with Pillow; if Pillow is missing report BLOCKED for that file only.
- The three older scripts (`test-roundtrip`, `test-archive-roundtrip`, `test-interpolator`) were removed: they never
  imported the app code.
- `Cargo.lock` DID change this time (the unused Tauri dialog plugin was removed): expected, not a finding.

## 1. What changed, and what to check (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Fix | Check |
|---|---|---|
| F1 | **Black page after zoom/pan** (your repro). Panning no longer copies the canvas onto itself (a GPU backend can turn that black); the page canvas also lost its low-latency flag | Your exact repro: an A4 lined note with ~110 strokes + a highlighter stroke, Ctrl+wheel in to ~133%, then plain wheel down 6+ ticks, up past the top, down past the bottom, pinch-zoom if you can. The page must never go black or blank. Also drag-scroll with touch/pen. I could not reproduce the original failure on Linux (software or AMD GPU), so this fix is by analysis: please say clearly if it still happens |
| F2 | **Ink outside the page** | Draw fast strokes past the top and right edges of a page at 56% zoom: the ink must be cut at the page edge, also in the live stroke and after Back/reopen |
| F3 | **Drive "invalid_request" / empty Client ID after updating** | After this update the desktop app needs its Client ID typed once (there is deliberately no automatic move: it can't tell a Desktop ID from a Web ID). With the ID missing and a signed-in account, sync must say "The Google Client ID is missing. Open Settings in the Drive dialog and enter it again, then sign in." instead of `invalid_request`. After typing the Desktop ID, sync must work without signing in again, including after the ~1 h access-token renewal |
| F4 | **Colors: manual order** | Pen bar: drag a swatch sideways to a new place; the order stays (also after drawing and after restarting the app). A new custom color takes the last slot. "Auto order" returns to most-used-first. Highlighter has its own row, its own order and its own current color |
| F5 | **Pen bar: three icon-only pens** | Pen, Brush, Highlighter as icons with a name on hover (long-press on touch). A Pressure slider (steady <-> sensitive) replaces Ballpoint/Fountain/Marker: low = ballpoint-like, high = fountain-like, low + the biggest size = marker. Highlighter has an Opacity slider. Sizes now include extra thin and extra thick. Existing notes look the same as before. Tell me if "others as variations in between" was meant differently |
| F6 | **Toasts keep a 10 px top margin** | Decided by the app owner (the Windows person asked for none): toasts sit 10 px below the top edge, flush to the right. Not a finding unless broken |
| F7 | **Pen buttons (carried over, confirmed in retest 5)** | R1 eraser end and R2 side button already PASS; just re-confirm nothing regressed |
| F8 | **Carried-over small items to confirm** | Dark dropdown popup (Zotero collection list is light-on-dark), Escape closes the Zotero dialog, first-sign-in sync prompt ("Sync your N notes...?"; Cancel uploads nothing and leaves auto-sync off) |
| F9 | **Speed** | Repeat R15 on your 120 Hz display (note GPU, Hz, scaling): fps while drawing/scrolling/pinch-zooming a 1000+ stroke note, any lag behind the pen tip. Pan is now cheaper than in bundle 5 (strips instead of full repaint) |

## 2. Unchanged known limits
Math in the PDF export is LaTeX source; text boxes can't be moved with the lasso; pictures can't be pasted; PDF page
images are 2100 px wide (soften past ~200% zoom); free-form StarNote canvas notes have no page management; page order
changes are not reflected in real StarNote; whether real StarNote opens notes with deleted strokes, text boxes,
highlighter opacity or custom page sizes is still unverified (R18).

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what
could not be tested.
