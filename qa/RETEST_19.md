# Retest 19 (Windows, Linux app, web): All notes as a root notebook, Linux QA fixes

From `main` (1.1.0-dev). Handwriting search is **not** in this bundle (it comes with 1.1.0). Test only; never type or store
credentials; Drive/Zotero only with the owner's approval; touch only `QA-` items. Report in `qa/reports/<platform>-retest19-<date>.md`
with a summary to `playground-0a`. Expected tests: cli 9, desktop-oauth 18, erase-saved 8, folders 10, pages 8, pdf-export 10
(or 1 blocked), sync 48, zotero 18; `npm run test:e2e` 10/10.

- **Windows** (Starnote local application QA): the desktop app window (shortcut at C:\qa19); clicks your tool can't make go to the owner.
- **Linux app + web** (playground-df): build in `artifacts/linux-qa19/rea-starnote`, drive the app in a nested display as last time.

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| R1 | **All notes: own switch** | All notes has a Grid / Sections switch; its choice is kept for All notes only (a notebook you never switched opens in Grid); the Sort menu no longer has "Notebooks open in" |
| R2 | **All notes in Sections** | Top-level notebooks are coloured tabs; notes in no notebook are a *Quick Notes* tab (shown when there are any, or no notebooks); tapping a tab switches tabs without leaving All notes (the path stays "All notes") |
| R3 | **Adding** | *+ Notebook* (tab row) makes a notebook and opens its tab; on a notebook's tab *+ Page* makes a note in it and Back returns to that tab; on Quick Notes *+ Quick note* makes a loose note |
| R4 | **Same tools** | Drag reorder (mouse) / Move up-down, the open tab's menu (Open notebook, Rename, Colour…, Move to…, Move to trash), multi-select of the rows, dropping a row onto another tab moves it there |
| R5 | **Linux QA 17 fixes** | Press-and-hold (touch) selects and stays selected after lifting; Rename updates the editor tab at once; Esc in *Move to…* closes only the chooser (selection kept); Linux launcher: Productivity category and the new description |
| R6 | **Earlier items still open** | Windows: S4/S5 (Sections rows selecting, changing notebook clears the selection), the .zip contents, Start menu name, notes and sign-in kept. Linux: L2 drag from the file manager, L3 pen tablet, L4 Korean IME, L5 motion (owner) |
