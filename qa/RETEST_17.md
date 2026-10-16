# Retest 17: multi-select, default notebook view, the name REA-StarNote (Windows, Linux app, web)

Built from `main` (towards 1.1; the 1.0 beta line is `release/1.0`). Test only; never type or store credentials; Drive/Zotero writes
only with the owner's approval; touch only `QA-` items. Report in `qa/reports/<platform>-retest17-<date>.md` and send a summary to
`playground-0a`. Expected tests: cli 9, desktop-oauth 18, erase-saved 8, folders 10, pages 8, pdf-export 10 (or 1 blocked), sync 48,
zotero 18; `npm run test:e2e`: 10 files incl. `select.e2e`.

## Who tests what
- **Windows** (Starnote local application QA): the desktop app window; clicks your tool can't make go to the owner.
- **Linux app and web** (playground-df, on the owner's Linux PC): the Linux desktop app built from this bundle (`npm run tauri build`,
  then `src-tauri/target/release/rea-starnote`, or the `.deb`), plus the browser version (`npm run dev`, http://localhost:1420; it is the
  development build, but it must work). Also run `qa/LINUX_QA_1.md` L1-L9 on the Linux app.

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Area | Check |
|---|---|---|
| S1 | **Select several** | The select button (top right of the library, squares icon), Ctrl/⌘-click on a card, or press-and-hold on touch starts selecting; a bar shows "N selected". Taps then select instead of opening; Select all / Select none |
| S2 | **Group actions** | Move to… (the chooser greys out places that don't fit any selected item), Duplicate (notes), Download (one note: .note; several: one .zip, check it opens and holds each note), Colour… (only when notebooks are selected), Move to trash (one question) |
| S3 | **Trash** | In the Trash, select several: Restore and Delete forever |
| S4 | **Sections page list** | The same selecting works on the page rows of the Sections view |
| S5 | **Leaving** | Esc, Back (Android) and *Done* end selecting; moving to another notebook clears the selection |
| S6 | **Default notebook view** | Sort menu > *Notebooks open in* Grid / Sections: every notebook follows it, except one you switched yourself (it keeps its choice); switching a notebook back to the default makes it follow the default again |
| S7 | **The name** | The window title, app list / Start menu / launcher entry, browser tab and the Android app show **REA-StarNote**; the CLI help starts with "REA-StarNote"; notes, settings and Drive sign-in are kept after updating (same app identity) |
| S8 | **1.0.0-beta.1 leftovers** (Windows) | B1-B4 of RETEST_16 if not done yet |
