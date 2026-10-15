# Changelog

Versions follow [SemVer](https://semver.org) and stay 0.x until 1.0. Newest first.

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
