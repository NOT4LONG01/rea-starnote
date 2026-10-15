# Retest 12 (Windows): one Create for notes and notebooks, fixes from retest 10

(Bundle 11 was never delivered; this replaces it.)

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes and notebooks you create, prefix `QA-`). Use the desktop app
(`npm run tauri build -- --no-bundle`); the localhost web version is development-only. Report in
`qa\reports\windows-retest12-<date>.md` with a summary to the owner's session (now named `playground-0a`).

## 0. Setup
`npm ci`, then `npm run check`. Expected test files: cli 9, desktop-oauth 17, erase-saved 8, folders 8, pages 8, pdf-export 10, sync 47,
zotero 18 (8 files). Without poppler or Pillow, pdf-export now prints BLOCKED and `npm run check` goes on to the build ("7/8 test files passed, 1 blocked"). Optional `npm run test:e2e` (needs Chrome): 6 files.

## 1. What changed, and what to check (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Change | Check |
|---|---|---|
| Y1 | **One Create** (your person's request) | The library has ONE dashed *Create* card ("A note or a notebook"). Its dialog's Type row is Pages / Infinite / Notebook. Notebook hides paper, orientation, style and spacing and shows only a Name field; Enter or Create makes the notebook and opens it (path shows it). Inside a notebook, Create makes a note or a sub-notebook there. The top-bar folder button opens the same dialog with Notebook preselected. Cancel creates nothing. The "+" tab still makes a note of the last note type |
| Y2 | **Trashed notebook count** | Trash a QA- notebook holding 1 note: its card in the Trash reads "1 note" (was "0 notes") |
| Y3 | **Old card pictures redrawn** | On the first start of this build, old notes whose cards showed raw `$$latex$$` now show the formula as a soft block, and older lined notes keep their own line spacing in the picture. No note's date changes and no sync upload happens because of it |
| Y5 | **Your retest 10 findings** | `npm run check` completes (build runs) without Pillow, pdf-export shown as BLOCKED (your Windows patch is no longer needed: use the bundle's file). `rea-starnote --help` lists `--template blank\|lined\|grid\|dotted`; `ruled` and `dots` still work. Y2 covers the Trash count |
| Y4 | **Retest 10 leftovers** | X7 Drive sub-folders (the person checks the app's sync Drive by eye, QA- items only, after agreeing): one sub-folder per notebook in "StarNote", nested the same way, notes inside; a move/rename shows up after the next sync. X9: narrow-window Math bottom sheet, fresh-profile pen colour, dotted pitch |

## 2. Known limits (not findings)
Undo works until the note is saved. Dragging cards works with a mouse or pen; on touch use *Move to...*. A notebook is a library folder, not a file.

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
