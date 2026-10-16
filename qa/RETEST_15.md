# Retest 15 (Windows): page browser, motion, manual sort, sign-in errors, bundle 14 fixes

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes and notebooks you create, prefix `QA-`). Report in
`qa\reports\windows-retest15-<date>.md` with a summary to `playground-0a`.
**Use the desktop app window** (point the Desktop shortcut at C:\qa15); where your tool can't click inside it, ask the person and
say so. If this bundle comes back with no problems, the next build becomes 1.0.0-beta.1 (the owner's rule).

## 0. Setup
`npm ci`, then `npm run check`. Expected test files: cli 9, desktop-oauth 18, erase-saved 8, folders 10, pages 8, pdf-export 10
(or BLOCKED without Pillow: shown as "1 blocked", not a failure), sync 48, zotero 18. Optional `npm run test:e2e` (needs Chrome): 9 files.
The desktop exe is now built stripped and size-optimised: note its size and its memory in Task Manager.

## 1. Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| V1 | **Page browser** (new) | In a Pages note with 3+ pages, tap the page number ("2 / 3", right of the page): a grid of page thumbnails, the current one marked. Tap one: it goes there and closes. Drag a page before another (mouse): the note's order changes. The ⋯ on a page: Move up/down, Add page after, Delete page. *+ Page at end*. × and Esc/Back close it |
| V2 | **Motion** (new) | Panels (page rail, page panel, Math), menus, dialogs, messages and the narrow-window sidebar slide or fade in and out; jumping to another page glides; opening a notebook makes its cards rise in. Nothing should feel slow, jumpy or flicker. E-Ink mode (pen & touch settings): no motion |
| V3 | **Manual sort in Grid** (new) | In a QA- notebook, Sort > *Manual (drag to reorder)*: drag a card onto the left/right half of another (mouse); ⋯ > *Move earlier / later*; the Sections page list shows the same order; other sorts still work |
| V4 | **Sections: Notebook > Section > Pages** | On a notebook's own tab (only shown if it has notes of its own) the add button says *+ Section* and makes a section; in a section it is *+ Page* |
| V5 | **Bundle 14 fixes** | *+ Page at end* / *after* keeps the line spacing of the page before it; *+ Page* in a section or the rail always makes a Pages note, even right after making an Infinite one |
| V6 | **Sign-in errors** (the person, only if they agree to try a wrong secret) | With the secret field emptied: sign in -> the browser tab says "Done here" (not "Signed in"), the app shows "Google rejected the sign-in: the client secret is missing or wrong..." for several seconds and in the Drive dialog, which opens on Settings. Put the right secret back and sign in: works |
| V7 | **Bundle 14 open items** | *+ Page after* in the page panel; the page panel on a PDF page (Paper and Orientation greyed, Style works) |

## 2. Known limits (not findings)
Undo works until the note is saved (autosave about 4 s after you stop). Reordering a note changes its date. Page format changes are not undoable.
Notebook cards are not reordered by dragging in Manual sort (dropping on a notebook moves the card into it).

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
