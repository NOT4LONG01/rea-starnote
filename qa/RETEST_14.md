# Retest 14 (Windows): the page panel, the whole-notebook page rail, and bundle 13's open items

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes and notebooks you create, prefix `QA-`). Report in
`qa\reports\windows-retest14-<date>.md` with a summary to `playground-0a`.
**Use the desktop app window** (`npm run tauri build -- --no-bundle`; point the Desktop shortcut at C:\qa14). Where your tool can't
click inside it, ask the person to do that check by hand and say so. If this bundle comes back with no problems, the next build
becomes 1.0.0-beta.1 (the owner's rule).

## 0. Setup
`npm ci`, then `npm run check`. Expected test files: cli 9, desktop-oauth 17, erase-saved 8, folders 10, pages 8, pdf-export 10
(or BLOCKED without Pillow), sync 48, zotero 18. Optional `npm run test:e2e` (needs Chrome): 9 files incl. `page-panel.e2e`.

## 1. Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| W1 | **Page panel** (new) | In a Pages note, the page-with-gear button in the top bar (next to the pen settings) opens a panel docked on the right; × closes it and the choice is kept. It shows "Page N of M" and follows the page you scroll to |
| W2 | **Page format, live** | In the panel: Paper, Orientation, Page style, Line spacing change the page at once. *Apply to* This page / All pages works both ways. On a PDF page Paper/Orientation are disabled, style still works. The changes survive Back and reopening |
| W3 | **Page actions** | *+ Page after*, *+ Page at end*, *Move up*, *Move down*, *Delete page* (asks first; disabled for the last page) |
| W4 | **Infinite canvas** | In an Infinite note the panel says "Infinite canvas" and Page style / Line spacing change the whole sheet; survives reopening |
| W5 | **Page rail = whole notebook** (changed) | In a QA- notebook with its own notes and a section with notes: open a note, the *Pages* rail lists the notebook's own notes first, then each section as a heading with its notes; the open one is marked; clicking another switches; drag (mouse) reorders within a group; × hides it |
| W6 | **Bundle 13 open items** | Drag a page above another in the library's Sections page list; a loose note shows under *Quick Notes*; *Colour...* on a notebook card tints the card |

## 2. Known limits (not findings)
Undo works until the note is saved (autosave about 4 s after you stop). Reordering a page changes its date. Page format changes are not undoable.

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
