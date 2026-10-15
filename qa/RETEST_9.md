# Retest 9 (Windows): note types, line spacing, black default; plus everything from retest 8 still open

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes you create, prefix `QA-`). Use the desktop app
(`npm run tauri build -- --no-bundle`); the localhost web version is development-only. Report in
`qa\reports\windows-retest9-<date>.md` with a summary to `playground-00`. Items U1-U7 of `RETEST_8.md` that you have not
done yet are still open (typing on the page, Math panel, one Fit button, close-flush).

## 0. Setup
`npm ci`, then `npm run check` (7 test files: cli 8, desktop-oauth 17, erase-saved 8, pages 9, pdf-export 10, sync 32, zotero 18;
pdf-export BLOCKED is fine without Pillow). Optional `npm run test:e2e` (needs Chrome): 5 files incl. `kinds.e2e`.

## 1. What changed, and what to check (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Change | Check |
|---|---|---|
| V1 | **New note dialog: Type** | New note offers Pages / Notebook / Infinite, a Line spacing row (Narrow / Medium / Wide, Medium preselected) and Tablet 4:3 paper. Notebook and Infinite hide Paper and Orientation. Cancel and Create work; the "+" tab creates a note of the last type |
| V2 | **Finer lines** | A new Lined A4 note has lines about 7 mm apart (40 per page), not 12 mm. Narrow/Wide change the pitch; Grid and Dotted follow it. An older note (made before this build) keeps its old, wider lines |
| V3 | **Notebook** | One seamless sheet at full page width: no gap, border or shadow between pages and the ruling continues across the seam. Scrolling down adds a page by itself (page label grows, no "Add page" button). Draw a long stroke across the seam: it stays one line. Back, reopen, close and reopen the app: the same notebook, still joined. Export PDF: no empty tail |
| V4 | **Infinite canvas** | No page edges, no scrollbars, no page navigation. Draw, then pan far (wheel, hand tool, touch) in all four directions and write there: ink works everywhere, the ruling/grid/dots continue. Close and reopen: everything is where you left it. Try text and a formula far from the origin, lasso, eraser, undo |
| V5 | **Default pen colour** | On a fresh profile (or after "Clear site data") the pen is black, the first swatch. A colour you picked before is kept |
| V6 | **Typing + Math on the new types** | Type text and a formula in a notebook and in an infinite canvas (RETEST_8 U2-U4 behaviour) |
| V7 | **CLI** | `node dist-cli\rea-starnote.mjs new -o nb.note --kind notebook --pages 3`, `... new -o inf.note --kind infinite --template grid`, then `info` (layout "notebook" / "infinite canvas"), `validate`, and open both in the app |
| V8 | **Retest 8 items** | U1 close-flush, U2/U3 typing on the page, U4 Math panel, U5 Fit button, U6 leftovers (small window, Shapes, Brush/Highlighter popovers, Hand drag, lasso, export, Zotero upload) |

## 2. Known limits (not findings)
Undo works until the note is saved (autosave about 4 s after you stop). PDF export of an infinite canvas makes one page per tile
that has content. A stroke over a tile edge is stored as two strokes (one per tile). Whether real StarNote opens our notebook /
infinite notes is unverified (R18).

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
