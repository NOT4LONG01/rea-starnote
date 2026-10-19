# Retest 21 (Windows + owner's phone): handwriting line grouping fix, qa-20 items still open

From `feat/handwriting-recognition` with `main` merged in (1.1.0-dev). Same rules as 20: test only; never type or store credentials
or API keys; Drive/Zotero only with the owner's approval; touch only `QA-` items; the OneNote samples stay on the Windows PC.
Report in `qa/reports/windows-retest21-<date>.md` with a summary to `playground-0a`. Expected tests: ai 5, cli 9, desktop-oauth 18,
erase-saved 8, folders 10, handwriting 9, pages 8, pdf-export 10 (or 1 blocked), sync 48, zotero 18; `npm run test:e2e` 12/12.

The one change since 20: the line grouping is back to qa-19's, plus one pass that merges a short row (a superscript or subscript)
into the nearest normal line it touches. It only merges, so no page can have more lines than with qa-19's grouping.

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| H6 | **OneNote script rerun** | `scripts\onenote-ink-test.ps1 -Lang en` from this bundle on the same pages: lines read / failed per page, total lines and stray lines (2 characters or fewer) per notebook, against qa-20 (quantum-info 139 lines / 39 stray; ZX 70 / 18) and the run before it (ZX 47 lines). Pass: 0 failed, ZX total at or under 47, stray lines fewer than qa-20 |
| H1-H4 | **Find in note (desktop app)** | As in RETEST_20: typed text, English and Korean handwriting on `QA-` notes, read once per page. Owner, if not reported for 20 |
| L1-L2 | **Convert to LaTeX** | As in RETEST_20 (L2 by the owner with their own key only) |
| R1 | **Fixes since 19** | As in RETEST_20 |

## Owner's phone (Android APK `rea-starnote-1.1.0-dev.apk`, signed with the usual key)
| # | Check |
|---|---|
| P1 | Installs and opens; the name is REA-StarNote; notes and Drive sign-in work as in beta.1 (qa/PHONE_BETA_1.md) |
| P2 | Find in note on handwriting: the first time, the status may say the recognizer is being downloaded (ML Kit, needs internet once); then Korean and English words are found |
| P3 | Convert to LaTeX: lasso, Σ, your own OpenRouter key in AI settings, the Math panel opens with LaTeX, Done replaces the ink, Undo brings it back |
