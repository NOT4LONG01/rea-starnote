# Linux app QA 1 (this PC): the desktop app on Linux

The Linux app is the same app as Windows in a WebKitGTK window. Build: `npm run tauri build` gives
`src-tauri/target/release/bundle/{deb,rpm,appimage}/`; run without installing: `src-tauri/target/release/rea-starnote`.
Its data lives in `~/.local/share/com.starnote.interop`. Use QA- notes only; Drive and Zotero only with your OK.

## Smoke test (done by the dev session, 2026-10-16, not by hand)
| Check | Result |
|---|---|
| Release build, `.deb` 7.6 MB, `.rpm` 7.6 MB, AppImage | built |
| Launch, window draws the library | PASS (screenshot `qa/reports/linux-2026-10-16/01-launch.png`) |
| Memory at start | about 180 MB app + 300 MB WebKit page process + 70 MB network process (resident, shared libraries counted in each) |

## By hand (needs clicks; ~15 min)
| # | Check |
|---|---|
| L1 | **Files out** (the most Linux-specific risk): More > *Download .note*, *Export SVG*, *Export annotated PDF*: does a file land (where? `~/Downloads`?) and open? |
| L2 | **Files in**: Import (.note / .pdf) through the file picker, and drag a file from the file manager onto the window |
| L3 | **Writing**: mouse, and a pen tablet if you have one (pressure, eraser end); pinch/scroll zoom; lag compared with Windows |
| L4 | **Text and Math**: type on the page (Korean IME too), the Math panel, formula typesetting |
| L5 | **Notebooks, Sections view, page rail, page panel, page browser**, with their open/close motion (smooth, not jumpy?) |
| L6 | **Window**: resize down to ~400 px (bottom sheets), maximise, close with unsaved ink and reopen (it must be there) |
| L7 | **Google Drive sign-in** (system browser opens; with a wrong secret the app now says which setting to fix) and a sync |
| L8 | **Zotero**: open a PDF from the library, annotate, upload |
| L9 | **Lightness**: idle CPU near 0 % (`top`), memory after 10 minutes of use |
