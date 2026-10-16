# Retest 18 (Windows): the Grid / Sections switch on the top-level library

One change since bundle 17 (plus the version label). Handwriting search is not in this bundle: it comes with 1.1.0 (branch
`feat/handwriting-recognition`). Same rules as `WINDOWS_QA.md`; touch only `QA-` items. Report in `qa\reports\windows-retest18-<date>.md`
with a summary to `playground-0a`. Use the desktop app window (shortcut at C:\qa18).

## 0. Setup
`npm ci`, then `npm run check` (cli 9, desktop-oauth 18, erase-saved 8, folders 10, pages 8, pdf-export 10 or 1 blocked, sync 48, zotero 18).
`--version` prints `1.1.0-dev` (main is the 1.1 line; the 1.0 betas come from `release/1.0`).

## 1. Checks
| # | Check |
|---|---|
| G1 | On the top-level library (All notes), the Grid / Sections switch is in the header. Choosing one shows a short message and every notebook then opens that way |
| G2 | A notebook you switched yourself inside keeps its own choice; switching it back to the same as the default makes it follow the default again |
| G3 | The switch is not shown in Quick Notes, the Trash or while searching; inside a notebook it works as before |
| G4 | The Sort menu's "Notebooks open in" shows the same choice |
| G5 | Bundle 17 items still open: S4/S5 (selecting in the Sections page list, Esc/Done/changing notebook), Colour… on several notebooks, the .zip contents, the Start menu name, notes and sign-in kept |
