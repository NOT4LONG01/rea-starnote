# Retest 1.1.0-alpha.1 (Windows + owner's phone): PDF text and highlights, page navigation in the top bar, Android Find

From tag `v1.1.0-alpha.1` (`feat/handwriting-recognition` with `main`). From now on builds are named by their version, not a
number (this follows qa-22). Same rules: test only; never type or store credentials or API keys; Drive/Zotero only with the owner's
approval; touch only `QA-` items; the OneNote samples stay on the Windows PC. Report in
`qa/reports/windows-retest-1.1.0-alpha.1-<date>.md` with a summary to `playground-0a`. `--version` prints `1.1.0-alpha.1`.
Expected tests: ai 5, cli 9, desktop-oauth 22, erase-saved 8, folders 10, handwriting 12, pages 8, pdf-export 10 (or 1 blocked),
sync 48, zotero 18; `npm run test:e2e` 14/14 (new: pdf).

New since qa-22: imported PDFs keep their text (Find searches it; highlighter strokes over PDF words are listed as highlighted
passages, `hl`, under *What was read*); the page navigation moved from a floating pill into the top bar beside Fit page;
Android: handwriting Find works in the release build (it failed with "Java exception" in qa-22).

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| D1 | **PDF text** | Import a text PDF as a `QA-` note (any lecture PDF the owner allows, or one made for QA). Find a word and a phrase from it: "n of m", the mark sits on the words; the status says "PDF text is searched too" |
| D2 | **Highlights** | With the highlighter, mark a few words of that PDF; open Find > *What was read*: an `hl` row with exactly those words. Mark a second passage: a second row |
| D3 | **Older PDFs** | Open a PDF imported before this build: Find says its text was not kept and to import it again (typed and handwritten text still found) |
| D4 | **Scans** | A scanned PDF (no text layer): imports as before; Find finds nothing in it, no error |
| N1 | **Page navigation** | In a note with 2+ pages: `|< 1 / 2 >|` is in the top bar right of Fit page, nothing floats over the page; the arrows and the number (page browser) work |
| F  | **Still open from qa-22** | F1-F5 (both languages, What was read for 명제, one hit, new ink while open, single language), T1 (Hand at start), T2 (palm rejection) |

## Owner's phone (`rea-starnote-1.1.0-alpha.1.apk`, installs over 1.1.0-dev)
| # | Check |
|---|---|
| P1 | Handwriting Find: "Claim" and "명제" in a `QA-` note (the first search downloads the recognizers, needs internet); *What was read* shows what was read |
| P2 | PDF: import a PDF, find a word, highlight a passage and see it under *What was read* |
| P3 | The page number in the top bar; Drive still signed in |
