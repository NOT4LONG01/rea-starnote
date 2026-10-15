# Changelog

Versions follow [SemVer](https://semver.org) and stay 0.x until 1.0. Newest first.

## Unreleased
### Added
- Note types: **Notebook** (one endless seamless sheet that grows as you scroll) and **Infinite** canvas (tiles appear wherever you write), chosen in the New note dialog; `rea-starnote new --kind notebook|infinite`.
- Line spacing choice (Narrow / Medium / Wide) and a Tablet 4:3 paper; lines are about 7 mm by default (Medium) instead of 12 mm. Older notes keep their spacing.
### Changed
- The default pen colour is the first swatch (black) instead of red.
- Text is typed right on the page (caret and live text where you tap; tap elsewhere, switch tool or Esc commits); size/bold/italic in the Text popover.
- Math has a docked side panel for the LaTeX source; the formula is typeset live on the page. Same `$$latex$$` storage and error refusal.
- One Fit button: first tap fits the page height, then the width, alternating; it starts at height on each note or page.
### Fixed
- Desktop: closing the window waits for the save, so ink drawn seconds before closing is no longer lost.
- Version in `tauri.conf.json` is 0.2.0; the clear-page toast says undo works until the next autosave.

## 0.2.0
### Added
- Command line (`rea-starnote info | text | validate | export | new`), see docs/cli.md.
- Android app (Tauri Android) with a wide-phone layout and a "Save as" bridge; fullscreen.
- Single-row toolbar with a popover for the active tool, four quick colors, a pen settings popover.
- Documentation index, user guide, branching guide, contributing guide.
### Changed
- Pen: new samples are inked on `pointerrawupdate` to cut lag.
- Autosave; a stale empty-note tab and closing with unsaved strokes are handled.
- The project and apps are named rea-starnote; the repo is organised as src/ test/ docs/ scripts/ qa/.
- The localhost web version is documented as development-only.
### Fixed
- Black canvas after a zoom preview, ink drawn outside the page, clearer "Client ID is missing" error on desktop.

## 0.1.0
Initial import: StarNote viewer/editor, Drive sync, Zotero, PDF import and export.
