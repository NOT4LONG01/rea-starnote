# Retest 10 (Windows): notebooks as folders, Drive sub-folders, fixes since bundle 9

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes and notebooks you create, prefix `QA-`). Use the desktop app
(`npm run tauri build -- --no-bundle`); the localhost web version is development-only. Report in
`qa\reports\windows-retest10-<date>.md` with a summary to `playground-00`.

**Before the first Drive sync, ask the person**: sync creates real Drive folders. Only `QA-` notebooks and notes should be in the
library when it runs (move or trash anything else first, or do the Drive checks with auto-sync off and "Sync now" once).

## 0. Setup
`npm ci`, then `npm run check`. Expected test files: cli 9, desktop-oauth 17, erase-saved 8, folders 8, pages 8, pdf-export 10, sync 47,
zotero 18 (8 files); pdf-export BLOCKED is fine without Pillow. Optional `npm run test:e2e` (needs Chrome): 6 files incl. `folders.e2e`.

## 1. What changed, and what to check (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Change | Check |
|---|---|---|
| X1 | **The Notebook note type is gone** | The New note dialog offers only Pages and Infinite. An old note made as a Notebook in bundle 8/9 still opens (as ordinary pages with gaps) |
| X2 | **Notebooks in the library** | Folder button (top right) and the dashed *Notebook* card create a notebook (name prompt). The card shows a folder and the number of notes in it (all depths). Click opens it; the title becomes a path `All notes > QA-a > QA-b`, each name clickable. Notebooks nest. Notebooks come before notes |
| X3 | **Notes belong to the open notebook** | With a notebook open, *Create* makes the note inside it; Back from the editor returns to that notebook; Import (.note/.pdf) lands inside it too |
| X4 | **Move** | A note's / notebook's menu > *Move to...* lists the top level and every notebook (indented); the current place is greyed; a notebook can't be moved into itself or its own sub-notebook. Drag a card onto a notebook card, and onto a name in the path (moves up). The note counts follow |
| X5 | **Rename, search, counts** | Rename a notebook (menu). The search box finds a note inside any notebook from anywhere. Sidebar "All notes" counts notes only |
| X6 | **Trash** | Menu > Move to trash on a notebook asks first and trashes what is inside; the Trash shows it as ONE card. Restore brings the notebook and its notes back. Delete forever removes it and its contents. Restoring a single note whose notebook is still in the Trash puts the note at the top level |
| X7 | **Drive sub-folders** (after the person agrees; QA- items only) | Sync: each notebook is a sub-folder of the Drive "StarNote" folder, nested the same way, notes inside the right one. Then in Drive (or the app): move a note, rename a notebook, trash a notebook, make a notebook on a second device: each shows up on the other side after a sync, moved notes keep their file (no duplicate), a Drive-trashed notebook lands in the app's Trash |
| X8 | **Fixes from bundle 9** | The Text popover (A-/A+/B/I) stays open when you tap text to edit; a tap just outside a text box or formula edits it (bigger tap area); library thumbnails show a formula as a soft block (not raw LaTeX) and a new lined note's thumbnail has the finer lines; `rea-starnote new --template lined|dotted` work |
| X9 | **Bundle 9 leftovers** | Narrow-window bottom sheet for the Math panel (real narrow window), fresh-profile pen colour (black), Dotted pitch with Narrow/Wide |

## 2. Known limits (not findings)
Undo works until the note is saved. Dragging works with a mouse or pen only; on touch use *Move to...*. The name of a notebook is typed in the
browser's own prompt. A notebook is a library folder, not a file: it is not part of a `.note` and "Download .note" is only for notes.

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
