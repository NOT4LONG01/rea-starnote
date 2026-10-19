# Retest 1.0.2 (Windows, Linux app + web, owner's phone)

QA build from tag `v1.0.2` (`feat/handwriting-recognition` with `main`; only x.x.0 is stable). Rules as always: test only;
never type or store credentials or API keys (the owner types their own); Drive/Zotero only with the owner's approval; touch only
`QA-` items. Reports: `qa/reports/<platform>-retest-1.0.2-<date>.md`, summary to "Linux main". `--version` prints `1.0.2`.
Expected tests: ai 8, cli 9, desktop-oauth 22, erase-saved 8, folders 10, handwriting 12, pages 8, pdf-export 10 (or 1 blocked),
pictures 3, sync 48, zotero 18 (11 files); `npm run test:e2e` 18/18 (new: pictures, selection).

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check | Who |
|---|---|---|---|
| G1 | **Pictures** | In a `QA-` note: paste a picture (Ctrl+V; a screenshot works) and drop a picture file onto the page: it lands selected, under the ink. With the select tool: tap selects, drag moves, the corner handle resizes (proportions kept), Delete / the bin removes, Undo / Redo. A big photo is scaled (the note stays small). Save, close, reopen: the pictures are there; the library card shows them | QA |
| G2 | **Pictures in StarNote** | Open a `.note` with a picture (made here) in the real StarNote on the phone: does the picture show? **Unverified**: the format is inferred from Onyx's SDK | owner |
| O1 | **Tool options** | Choosing a tool only selects it (nothing opens over the page); a second tap on the tool opens its options; a stroke started at the top of the page right after picking the pen draws (Linux QA 1.0.1 F-A); picking the eraser and tapping it again opens its options, it does not clear the page; a double tap on the eraser in use clears it (Undo brings it back) | QA |
| E1 | **Palm while erasing** | Erase with the pen (eraser tool, and the pen's eraser end) while a palm rests and slides on the screen: the page neither pans nor zooms, the erase goes on (owner's 1.0.1 report) | owner |
| M1 | **Moving a selection** | Lasso ink (Lasso tool, or the pen's side button with any tool, Hand included); drag inside the dashed box with the pen, a mouse and a finger (palm rejection on): it moves; a finger outside the box pans. A selected picture moves by finger too | QA / owner |
| S3 | **Split view look** | Split: two halves with a plain divider, each with a slim head (its note's name, ×); the active half's head is tinted (no blue frame); × on either half closes it and the other note fills the window; both stay open in tabs; Undo acts on the half last touched | QA |
| S4 | **Split groups** | While split, the split button > *Save as a group…* (name it); Back: *Groups* in the library sidebar lists it; one tap reopens both side by side; ⋯ > Rename, Delete group (the notes stay) | QA |
| A2 | **Read handwriting (AI)** | The owner, own key, a **specific** free model from More > AI settings (the list no longer offers routers; choosing one warns): read a handwritten page; report the model id and the result. On a failure the message names the model that answered, with Retry and Change model | owner |
| R | **1.0.1 checks** | Spot-check Find (typed, PDF), the reopen fix, the icon, Hand at start, page navigation | QA |

## Owner's phone (`rea-starnote-1.0.2.apk`, installs over 1.0.1)
| # | Check |
|---|---|
| P1 | Pictures: paste or share-to isn't there yet on Android; drag one in from split-screen if the launcher allows, else skip (file picker and camera come later) |
| P2 | S Pen: palm resting while erasing; lasso with the side button then move with the pen or a finger |
| P3 | Split view and a group on the Fold |
| P4 | Read handwriting (AI) with a specific model |
