# Retest 1.0.1 (Windows, Linux app + web, owner's phone)

QA build from tag `v1.0.1` (`feat/handwriting-recognition` with `main`). Only x.x.0 versions are stable; 1.0.1 is a QA build
(it follows 1.1.0-alpha.1). Rules as always: test only; never type or store credentials or API keys (the owner types their
own); Drive/Zotero only with the owner's approval; touch only `QA-` items. Reports: `qa/reports/<platform>-retest-1.0.1-<date>.md`
with a summary to "Linux main". `--version` prints `1.0.1`. Expected tests: ai 6, cli 9, desktop-oauth 22, erase-saved 8,
folders 10, handwriting 12, pages 8, pdf-export 10 (or 1 blocked), sync 48, zotero 18; `npm run test:e2e` 16/16 (new since
alpha.1: split, newer-data; find rewritten).

New since 1.1.0-alpha.1: handwriting is read **only by the AI, when asked** (the on-device recognizers are gone); split view;
the new app icon; a library upgraded by a newer build opens; strokes no longer show twice after leaving and reopening a note.

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check | Who |
|---|---|---|---|
| A1 | **Find without AI** | Find (Ctrl+F) in a `QA-` note with typed text and handwriting: typed text is found at once; the status says how many pages of handwriting are not read yet; a *Read handwriting (AI)* button shows; nothing is sent | QA |
| A2 | **Read handwriting (AI)** | The owner, with their own OpenRouter key in More > AI settings: press the button, accept; the status counts pages; then "Handwriting read by the AI: N lines"; "Claim" and "명제" are found; *What was read* lists the lines (`ai`). Note the model used and how well it read, never the key | owner |
| A3 | **Read once** | Close and reopen Find: nothing is sent again. Write a new word: the button comes back (1 page), nothing is sent until pressed | QA / owner |
| D1-D4 | **PDF text, highlights** | As in RETEST_1.1.0-alpha.1 (a text PDF is searched; highlighter passages under *What was read* as `hl`; an old PDF says to re-import; a scan finds nothing, no error) | QA |
| S1 | **Split view** | Split button (top bar) > pick another note: two halves; write in each (goes to that note); Undo acts on the half last touched (blue frame); Back ends it; both notes kept their ink | QA |
| S2 | **Split, tall screen** | A portrait window (or the phone upright): the halves are one above the other | QA / owner |
| R1 | **Reopen fix** | Write a stroke, go Back at once, reopen the note: the stroke is there once; write again, save: still once (no doubled strokes) | QA |
| R2 | **Newer data** | Nothing to do by hand: covered by e2e `newer-data`. Do not run builds older than 1.0.1 on the owner's profile | — |
| I1 | **App icon** | The new icon (a note page with a gold star and blue handwriting) on the window, taskbar, Start menu / launcher, installer; the browser tab in the web build | QA |
| N1, T1, T2, L1/L2 | **Still open** | Page navigation in the top bar; Hand at start; palm rejection after the first pen stroke; Convert to LaTeX (L2 owner only) | QA / owner |
| Linux | **Since bundle 19** | Also N1 (row height when selected), N2 (tab colours), F3 (the app's own Rename dialog), Quick Notes tab always shown | Linux QA |

## Owner's phone (`rea-starnote-1.0.1.apk`, installs over 1.1.0-alpha.1)
| # | Check |
|---|---|
| P1 | Installs and opens; the new icon on the home screen and in the app list (a full page on any launcher shape); the APK is about 11 MB, not 23 |
| P2 | Drive still signed in (or Sign in with Google works); a sync |
| P3 | Find: typed and PDF text at once; *Read handwriting (AI)* with your key reads a handwritten page |
| P4 | Split view on the Fold (open and folded); S Pen palm rejection; Hand at start |
