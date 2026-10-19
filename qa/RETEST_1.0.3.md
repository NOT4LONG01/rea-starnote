# Retest 1.0.3 (Windows, Linux app + web, owner's phone): the candidate for 1.1.0

QA build from tag `v1.0.3`. If this comes back clean, it becomes 1.1.0 (stable). Real StarNote compatibility is **not** a release
requirement (owner, 2026-10-19), so there is no StarNote check. Rules as always: test only; never type or store credentials or API
keys (the owner types their own); Drive/Zotero only with the owner's approval; touch only `QA-` items. Reports:
`qa/reports/<platform>-retest-1.0.3-<date>.md`, summary to "Linux main". `--version` prints `1.0.3`. Expected tests: ai 9, cli 9,
desktop-oauth 22, erase-saved 8, folders 10, handwriting 12, pages 8, pdf-export 10 (or 1 blocked), pictures 3, sync 48, zotero 18
(11 files); `npm run test:e2e` 18/18.

New since 1.0.2 (small): a used-up free-model limit says so plainly and is not retried; after a failed read the Find bar says how
many pages are still unread (the ones read are kept); the eraser's clear-page double tap no longer leaves its options open.

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check | Who |
|---|---|---|---|
| L3 | **AI limit** | With a free model whose limit is used up: "The free model's limit is used up..." (wait / a little credit / a paid model), Retry and Change model shown, nothing retried by itself; the status says how many pages are not read yet | owner |
| A2 | **AI read** | With a model that works for the owner (Gemini 3 Pro Image did): a page of handwriting is read and found | owner |
| O2 | **Eraser double tap** | Eraser chosen, its options closed: a quick double tap clears the page and no options panel stays open; Undo brings the ink back | QA |
| R | **Regression pass (everything since 1.0.0)** | Find (typed, PDF, handwriting read), pictures, split view and groups, tool options, palm rejection (drawing and erasing), lasso moves (pen, mouse, finger; side button with Hand), Convert to LaTeX, Drive sync, multi-select, sections, page browser and panel, icon, Hand at start: a quick pass, anything odd noted | QA / owner |

## Owner's phone (`rea-starnote-1.0.3.apk`, installs over 1.0.2)
| # | Check |
|---|---|
| P1 | S Pen: palm resting while drawing and while erasing (eraser tool and the pen's eraser end): no pan, no zoom |
| P2 | Lasso with the side button (any tool), then move with the pen and with a finger |
| P3 | Split view and a group on the Fold, open and folded |
| P4 | Read handwriting (AI) with a model that works; Drive still signed in and syncing |
