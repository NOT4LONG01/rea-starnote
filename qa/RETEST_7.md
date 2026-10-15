# Retest 7 (Windows): toolbar redesign, pen lag, small fixes, new repo layout

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes you create, prefix `QA-`). The Windows app is the product here; use the
desktop app (`npm run tauri build -- --no-bundle`), not the localhost web version (development only). Items R3-R10,
R12-R14, R16-R18 of `RETEST_5.md` that you have not done yet are still open. Report in
`qa\reports\windows-retest7-<date>.md` with a summary to `playground-00`.

## 0. Setup (the repo layout changed: `tests/` is now `test/`, scripts are in `scripts/`)
`npm ci`, then `npm run check` (typecheck + every test + build) and `npm run tauri build -- --no-bundle`.
Expected tests per file: cli 8, desktop-oauth 17, erase-saved 8, pages 6, pdf-export 10, sync 32, zotero 18 (7 files).
`pdf-export` needs poppler (`pdfinfo`, `pdftoppm`, `pdftotext`) and Python with Pillow; report BLOCKED for that file
only if missing. Optional: `npm run test:e2e` (needs Chrome). Version is 0.2.0; `Cargo.lock` and `package-lock.json` changed only by that.

## 1. What changed, and what to check (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Change | Check |
|---|---|---|
| T1 | **One toolbar row, popover for the active tool** | Pen, Eraser, Select, Shapes, Text, Hand in one row. Tapping the active tool opens/closes a popover under it (pen: types as icons, 4 quick colors, 5 sizes; eraser: sizes + Clear page; shapes: kinds). Tapping another tool switches and closes the popover. It must not overlap the toolbar or run off screen at a small window width |
| T2 | **4 quick colors, drag to reorder, no "Auto order"** | Drag a swatch to a new place: order persists after drawing and after restarting the app. Custom color is reachable from the pen settings button |
| T3 | **Pen settings popover** (button next to the pen) | Pen/Brush: Pressure slider. Highlighter: Opacity slider. Custom color picker. Values persist |
| T4 | **Pen button icon follows the pen type** | Choose Brush, then Highlighter: the pen button shows that icon |
| T5 | **Pen lag** | New ink samples are drawn on `pointerrawupdate`. With your real pen on the 120 Hz display: is the ink tip closer to the nib than in retest 6? Say better / same / worse, note GPU, Hz, scaling. I could not measure real latency here |
| T6 | **Hand tool** | Real hand icon, tooltip "Hand"; a finger/pen drag pans the page, no ink |
| T7 | **Autosave** | Draw, stop: after ~4 s the toast/indicator says it saved; reopen from the library shows the ink. It never saves while a selection or a stroke is in progress |
| T8 | **Stale tab and closing** | A new note left untouched disappears from the library when you go Back. Closing the app (X) with unsaved strokes: no browser-style "leave site?" prompt on desktop, and the ink is there on reopen |
| T9 | **Retest 6 items** | F1-F5 of `RETEST_6.md` still PASS (black page after zoom/pan, ink clipped to the page, Client ID message, colors, pens) |
| T10 | **Command line** | In the repo: `npm run build:cli`, then `node dist-cli\rea-starnote.mjs info samples\test.note` shows 12 pages, 4 strokes, 1 text box; `... validate`, `... export samples\test.note -f pdf -o t.pdf`, `... new -o n.note --pages 3 --paper a5 --landscape --template grid` then open `n.note` in the app: 3 landscape A5 grid pages |

## 2. Known limits
Math in PDF export is LaTeX source; text boxes can't be moved with the lasso; pictures can't be pasted; CLI exports leave
out PDF page backgrounds; whether real StarNote opens our saved files is unverified (R18). The toast keeps its 10 px top
margin (owner's decision).

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what
could not be tested.
