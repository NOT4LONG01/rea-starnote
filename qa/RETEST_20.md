# Retest 20 (Windows): handwriting search (Find in note), Convert to LaTeX, main's fixes since 19

From `feat/handwriting-recognition` with `main` merged in (1.1.0-dev; the version stays 1.1.0 on purpose: 1.1.0 is handwriting
search + Convert to LaTeX, 1.1.1 is the AI assistant, which is not started). Test only; never type or store credentials or API
keys; Drive/Zotero only with the owner's approval; touch only `QA-` items; the OneNote samples stay on the Windows PC (never in
the repo, a report or Drive). Report in `qa/reports/windows-retest20-<date>.md` with a summary to `playground-0a`.
Expected tests: ai 5, cli 9, desktop-oauth 18, erase-saved 8, folders 10, handwriting 8, pages 8, pdf-export 10 (or 1 blocked),
sync 48, zotero 18; `npm run test:e2e` 12/12 (new: find, latex). Build the desktop app as usual (the Windows ink recognizer is
compiled in only on Windows: `src-tauri/src/ink.rs`).

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| H1 | **Find, typed text** | In a `QA-` note with typed text and formulas: the search button (or Ctrl+F) opens the Find bar at the top; typing shows "n of m", Enter / Shift+Enter / the arrows jump between matches (to other pages too) with a highlight; Esc closes it |
| H2 | **Find, English handwriting** | Language *English*; in a `QA-` note the owner wrote in English (make a QA- copy if needed): the status shows "Reading handwriting… page x of y", then "Handwriting read (English): N lines"; searching a handwritten word finds it and highlights roughly that part of the line. Note 3 words tried and how many were found |
| H3 | **Find, Korean handwriting** | Same with language *한국어* on Korean ink |
| H4 | **Read once** | Close and reopen Find in the same note: no "Reading handwriting…" again (kept); write a new word, Find again: only that page is read again and the new word is found |
| H5 | **Missing language** | Not testable now that both are installed: NOT RUN unless the owner removes one (then the status names the recognizer used and how to add the missing one) |
| H6 | **OneNote script rerun** | `scripts\onenote-ink-test.ps1 -Lang en` on the same pages as last time (output stays in artifacts\ink): lines read / failed per page, and whether the stray one-character lines ("2", "+") are fewer. Superscripts and subscripts now join their line |
| L1 | **Convert to LaTeX, no key** | Lasso some handwriting: a Σ button appears beside Delete. Pressing it opens *AI settings* (More > AI settings (OpenRouter)… opens the same dialog); the model list loads (free models first, "Free ·"); Cancel sends nothing. Do NOT type a key |
| L2 | **Convert to LaTeX, owner** | Owner only, with their own OpenRouter key typed into the dialog by them: lasso a handwritten formula in a `QA-` note, Σ, accept the one-time question; the Math panel opens with LaTeX; Done replaces the ink with the formula; Undo once brings the ink back; Cancel keeps the ink. Report the model used and how close the LaTeX was, never the key |
| R1 | **Main's fixes since 19** | Rename is the app's own dialog (no "tauri://localhost" prompt); the Quick Notes tab is always there in All notes > Sections (empty: "+ Quick note"); selecting a Sections row keeps its height; notebook/section tabs each get their own default colour |
