# Retest 13 (Windows): 1.0.0-beta.1, sections view, narrow window, and what bundle 12 left open

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes and notebooks you create, prefix `QA-`). Report in
`qa\reports\windows-retest13-<date>.md` with a summary to `playground-0a`.
**Use the desktop app window** (`npm run tauri build -- --no-bundle`), not `vite preview`: where your tool can't click inside it,
ask the person to do that check by hand and say so in the report.

## 0. Setup
`npm ci`, then `npm run check`. Expected test files: cli 9, desktop-oauth 17, erase-saved 8, folders 10, pages 8, pdf-export 10
(or BLOCKED without Pillow), sync 48, zotero 18. Optional `npm run test:e2e` (needs Chrome): 8 files. The app's version is
1.0.0-beta.1 (window title / About, `rea-starnote --version`).

## 1. Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| Z1 | **Sections view** | Inside a QA- notebook: the header has a Grid / Sections switch (Grid by default, choice kept per notebook). Sections: the sub-notebooks are coloured tabs; *+ Section* adds one; the open section lists its pages oldest first; drag a page above another (mouse) and *Move up / Move down* in its menu reorder it, and the order survives a restart; *+ Page* opens a new page at once; the section tab's menu has Rename, Colour..., Move to..., Move to trash |
| Z2 | **Page rail in the editor** | Open a page of a section: the *Pages* button (top bar) shows the section's pages beside the page, the open one marked; click another to switch; *+ Page* adds one; drag to reorder; the close button hides the rail and the choice is kept |
| Z3 | **Quick Notes and colours** | Sidebar *Quick Notes* lists notes that are in no notebook (count); *Colour...* on a notebook card tints it, on a section its tab |
| Z4 | **Narrow window** | The window can now be made ~400 px wide. Library, Create dialog and editor have no sideways scroll; Text > Math, tap the page: the panel is a full-width bottom sheet with the page visible above it |
| Z5 | **Back saves other tabs** | Write on a page in tab A, switch to tab B, write, Back: both pages show in the library with their ink |
| Z6 | **Bundle 12 leftovers** | The "+" tab makes a note of the last type; the Create button (not only Enter) for a notebook; an Infinite note; the fresh-profile pen colour is black (only if the person agrees to a fresh profile); Dotted pitch Narrow/Medium/Wide |
| Z7 | **Drive sub-folders** (the person, by eye, QA- items only, after agreeing) | Sync: the Drive *StarNote* folder has one sub-folder per QA- notebook, nested the same way, notes inside; move a note / rename a notebook / reorder pages, sync, and look again |

## 2. Known limits (not findings)
Undo works until the note is saved (autosave about 4 s after you stop). Reordering a page changes its date (that is how sync sees it).

## 3. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
