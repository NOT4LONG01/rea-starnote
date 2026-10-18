# Retest 22 (Windows + owner's phone): Find in both languages, "What was read", palm rejection, the Hand tool

From `feat/handwriting-recognition` (1.1.0-dev, `main` included). Same rules as 21: test only; never type or store credentials or
API keys; Drive/Zotero only with the owner's approval; touch only `QA-` items; the OneNote samples stay on the Windows PC.
Report in `qa/reports/windows-retest22-<date>.md` with a summary to `playground-0a`. Expected tests: ai 5, cli 9,
desktop-oauth 22, erase-saved 8, folders 10, handwriting 9, pages 8, pdf-export 10 (or 1 blocked), sync 48, zotero 18;
`npm run test:e2e` 13/13 (new: palm).

New since 21: Find reads Korean and English together by default, *What was read* under the bar, ink written while Find is open
is read about 1.5 s later; palm rejection turns on with the first pen stroke; the editor opens with the Hand tool;
Android signs in to Drive with the phone's Google account (owner confirmed it works).

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| F1 | **Both languages** | In the owner's `QA-` note with handwritten "Claim" and "명제": the language box shows *한국어 + English* (first time); the status says "Handwriting read (한국어 + English): N lines"; "claim" and "명제" are each found (or see F2) |
| F2 | **What was read** | Open *What was read* under the bar: each line is listed with `en` / `ko` and its text. Copy what the `ko` line for 명제 says into the report (that settles qa-21's H3: misread or not read) |
| F3 | **One hit, not two** | A word both recognizers read the same (e.g. digits) counts once ("1 of 1") |
| F4 | **New ink while open** | With Find open, write a new word, wait 2 s: searching it finds it without closing Find |
| F5 | **Single language** | Choosing 한국어 or English reads again in that language only; the choice is kept next time |
| T1 | **Hand at start** | Opening the app: the Hand tool is selected; the pen moves the page until a pen tool is chosen |
| T2 | **Palm rejection** | On the pen PC: after the first pen stroke, a finger or palm does not draw (pans / zooms); *Touch & pen > Stylus only* turns it off and it stays off after restarting the app |
| R1 | **Still open from 20/21** | L1/L2 (Convert to LaTeX; L2 owner with their own key) and R1 (fixes since 19), if not reported |

## Owner's phone (`rea-starnote-1.1.0-dev.apk`, install over the previous one)
| # | Check |
|---|---|
| P1 | Opens; starts with the Hand tool; Drive still signed in (or signs in with the phone's account) |
| P2 | Find on handwriting in both languages; *What was read* shows the lines (the first time the recognizers are downloaded, which needs internet) |
| P3 | Palm rejection after the first S Pen stroke; Convert to LaTeX with your own key |
