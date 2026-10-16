# Retest 16 (Windows): 1.0.0-beta.1

The first 1.0 beta, cut from `release/1.0` after bundle 15 passed. Test only; same rules as `WINDOWS_QA.md` (never type or store
credentials; Drive/Zotero writes only with the person's approval; touch only `QA-` items). Report in
`qa\reports\windows-retest16-<date>.md` with a summary to `playground-0a`. Use the desktop app window (shortcut at C:\qa16).

## 0. Setup
`npm ci`, then `npm run check`: cli 9, desktop-oauth 18, erase-saved 8, folders 10, pages 8, pdf-export 10 (or 1 blocked), sync 48,
zotero 18. `rea-starnote --version` (and `node dist-cli\rea-starnote.mjs --version`) prints `1.0.0-beta.1`.

## 1. Checks
| # | Check |
|---|---|
| B1 | **Esc closes the page browser** (the bundle 15 finding): open it from the page number, press Esc |
| B2 | **Update over 0.2.0**: run the new exe over the profile used for bundles 13-15: all QA- notes, notebooks, sections, colours and the manual order are still there |
| B3 | **A short pass of daily use** in the real window: create, write, text and math, notebooks and sections, page panel and page browser, export a PDF, Back, close and reopen. Anything that feels wrong for a 1.0 is a finding |
| B4 | **Drive** (the person, QA- items): one sync with the beta; notebooks stay sub-folders, page order and colours come through |
