# Retest 1.0.4 (Windows, Linux app + web, owner's phone): the candidate for 1.0.0

QA build from tag `v1.0.4` on `dev`. If it comes back clean, **the same code is released as 1.0.0**, the first stable version
(on `main`, with the README and the MIT license). Real StarNote compatibility is not a release requirement. Rules as always: test
only; never type or store credentials or API keys (the owner types their own); Drive/Zotero only with the owner's approval; touch
only `QA-` items. Reports: `qa/reports/<platform>-retest-1.0.4-<date>.md`, summary to "Linux main". `--version` prints `1.0.4`.
Expected tests: ai 10, cli 9, desktop-oauth 22, erase-saved 8, folders 10, handwriting 12, pages 8, pdf-export 10 (or 1 blocked),
pictures 3, sync 48, zotero 18 (11 files); `npm run test:e2e` 18/18.

New since 1.0.3: the split view's halves are resizable; the AI reader accepts more answer shapes and quotes an answer it cannot
read; README for users and the MIT license.

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check | Who |
|---|---|---|---|
| D5 | **Resizable split** | Split two notes: drag the divider; the halves resize (it stops at 20% / 80%); both pages redraw at the new size; on a tall window the halves are stacked and the divider drags up and down; end the split and split again: the size is remembered; save a group at one size, change the size, reopen the group: the group's size comes back; double-click the divider: half and half | QA |
| A3 | **AI answer shapes** | With a model that answered in a list before (e.g. Nano Banana 2 Lite on pages 2-3 of HW#2): Read handwriting (AI) reads the pages; if an answer still is not a list of lines, the message quotes its start | owner |
| N2 | **README and license** | `README.md` reads well for a new user (what it does, install, accounts, privacy); `LICENSE` is MIT; nothing in them is wrong for this platform | QA |
| R | **Release pass** | A last pass over everything since 1.0.0-beta.1 as in RETEST_1.0.3 (R), on the real window: anything odd is a reason not to release | QA / owner |

## Owner's phone (`rea-starnote-1.0.4.apk`, installs over 1.0.3)
| # | Check |
|---|---|
| P1 | Split view on the Fold: drag the divider (open and folded); a group keeps its size |
| P2 | A last pass: write, erase with the S Pen (palm resting), lasso and move, pictures, Find, Drive sync |
