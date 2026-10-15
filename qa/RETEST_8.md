# Retest 8 (Windows): typing on the page, Math side panel, one Fit button, close-flush

Test only; do not edit source. Same rules as `WINDOWS_QA.md` (never type or store credentials; Drive/Zotero writes only
with the person's approval; touch only notes you create, prefix `QA-`). Use the desktop app
(`npm run tauri build -- --no-bundle`); the localhost web version is development-only. Report in
`qa\reports\windows-retest8-<date>.md` with a summary to `playground-00`.

## 0. Setup
`npm ci`, then `npm run check` (expected test files: cli 8, desktop-oauth 17, erase-saved 8, pages 6, pdf-export 10, sync 32,
zotero 18; pdf-export BLOCKED is fine without Pillow). Optional `npm run test:e2e` (needs Chrome): 4 files incl. `text.e2e`.
The Tauri capability file changed (`core:window:allow-destroy`), so a fresh `tauri build` is needed for U1.

## 1. What changed, and what to check (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Change | Check |
|---|---|---|
| U1 | **Ink lost on close** (your finding) | Draw a stroke, close the window with X less than 4 s later (several tries, also with text typed but not committed): reopen, the stroke/text must be there. The window may take a moment to close |
| U2 | **Typing on the page** | Text tool, tap the page: a dashed frame and a caret appear at the tap and no floating box. Type with Enter for new lines (also try Korean/IME): text shows live. Tap elsewhere = commits and starts a new text there; Esc commits; tapping another tool commits. Tap committed text: edit it in place (add a word). Empty it and commit: it is deleted. Undo reverts one commit |
| U3 | **Text style** | Text popover: A−/A+, B, I change the text being typed (and the default for new text); a color swatch recolors it; "Delete text" shows while editing an existing text |
| U4 | **Math side panel** | Text popover > Math, then tap the page: a panel docked on the right (source focused, snippet buttons, A−/A+, Cancel, Done). Type `x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`: the formula appears typeset on the page at the tap and updates as you type; the page scrolls so it stays clear of the panel. A broken formula (`\frac{`) shows an error line under the code and Esc/Done refuse with "Fix the formula first: ..."; fixing it lets Esc commit. Cancel discards. Tap a committed formula: the panel reopens with its LaTeX. Resize the window narrow: the panel becomes a bottom sheet |
| U5 | **One Fit button** (top bar, right) | First tap fits the page height, second the width, then alternating; the icon/tooltip shows the next one ("Fit page height" / "Fit page width"). Changing page or opening a note starts at height again. The page menu still has "Fit page width" |
| U6 | **Retest 7 leftovers** | T1 at a small window width and Shapes popover; T3 Brush/Highlighter popovers and persistence; T6 Hand drag pans; R7 lasso move/paste; R14 export from the app; Zotero upload |
| U7 | **Known limit (not a finding)** | Undo works until the note is saved (autosave about 4 s after you stop); the Clear page toast says so |

## 2. Report
Environment, the table above, for each FAIL: steps, expected vs actual, screenshot, console errors; top 5 findings; what could not be tested.
