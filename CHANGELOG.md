# Changelog

Versions follow [SemVer](https://semver.org). Newest first.

## Unreleased (towards 1.1)
### Added
- **Find in note** (search button, Ctrl+F): typed text everywhere; handwriting where the device has a recognizer (Windows' own ink recognizer, Google ML Kit on Android), read in the background page by page and kept by the app.
- Select several notes and notebooks in the library (select button, Ctrl/⌘-click, or press and hold) and Move to…, Duplicate, Download (one .zip), Colour…, Move to trash; Restore / Delete forever in the Trash.
- The rename dialog is the app's own (no "JavaScript - tauri://localhost" prompt, no full-screen editor on Android); notebook and section tabs each get their own colour until one is picked; selecting no longer makes Sections rows jump.
- All notes has its own Grid / Sections switch: in Sections it works like a notebook, with the top-level notebooks as tabs and *Quick Notes* for loose notes (+ Notebook, + Page, reorder, colours). Each notebook keeps its own switch; the "Notebooks open in" default is gone.
### Changed
- The app is named **REA-StarNote** everywhere you see it (window, app list, Android, browser tab). Commands, package and repo stay `rea-starnote`; installed apps keep their data (same identifier).

## 1.0.0-beta.1 (2026-10-16)
First 1.0 beta, after Windows QA bundle 15 passed (its one finding, Esc and the page browser, is fixed here). For testing on real
devices; the 1.0 line lives on `release/1.0` (docs/branching.md).
### Added
- Grid view: a *Manual* sort (drag cards to reorder, or Move earlier / later), the same order as the Sections page list.
- Clear sign-in errors (a missing or wrong client secret names the setting to fix).
- Linux app: release build, `.deb` / `.rpm` / AppImage, smaller binary (stripped, LTO); qa/LINUX_QA_1.md.
- Page browser: the page number opens a grid of the note's pages (jump, drag to reorder, add, delete).
- Motion: panels, the page rail, menus, dialogs, the sidebar and messages slide or fade in and out; the view glides between pages; library cards rise in when you move to another notebook or section. All CSS, off with reduced-motion and in E-Ink mode.
- On a notebook's own tab in the Sections view the add button makes a section (Notebook > Section > Pages).
- Page panel on the right of the editor: the page's format applied live (this page or all) and the page actions; an infinite canvas's sheet style.
- The page rail lists the whole notebook, sections as headings.
- **Sections view** (OneNote-like, a Grid / Sections switch per notebook): sub-notebooks as coloured tabs, a page list with drag-to-reorder, a page rail beside the editor, *Quick Notes* for notes outside notebooks, notebook and section colours. Page order and colours sync via Drive file properties.
- **Notebooks**: folders in the library, made from the one *Create* dialog (type Pages / Infinite / Notebook), that hold notes and other notebooks (create, nest, *Move to…*, drag and drop, breadcrumbs, search across all, trash and restore with contents). On Drive each is a nested sub-folder of *StarNote*; renames, moves and deletes sync both ways.
- Note types: an **Infinite** canvas (tiles appear wherever you write), chosen in the New note dialog; `rea-starnote new --kind infinite`.
- Line spacing choice (Narrow / Medium / Wide) and a Tablet 4:3 paper; lines are about 7 mm by default (Medium) instead of 12 mm. Older notes keep their spacing.
### Changed
- Text boxes and formulas have a bigger tap area; the Text popover stays open while editing; thumbnails show formulas as a block.
- The default pen colour is the first swatch (black) instead of red.
- Text is typed right on the page (caret and live text where you tap; tap elsewhere, switch tool or Esc commits); size/bold/italic in the Text popover.
- Math has a docked side panel for the LaTeX source; the formula is typeset live on the page. Same `$$latex$$` storage and error refusal.
- One Fit button: first tap fits the page height, then the width, alternating; it starts at height on each note or page.
### Fixed
- Desktop: closing the window waits for the save, so ink drawn seconds before closing is no longer lost.
- The desktop window can be made as narrow as 400 px (was 800), e.g. snapped to half a small screen; the Math panel then becomes a bottom sheet.
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
