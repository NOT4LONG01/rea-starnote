# rea-starnote

Clean-room viewer / editor / sync client for StarNote (`.note`) files, reconstructed from the real app's output with
reverse-engineering tools. TypeScript + HTML canvas, packaged for desktop with Tauri v2.

- `desktop-client/` the app (`npm ci`, `npm run dev` on http://localhost:1420, `npm run build`, `npm run tauri build`).
  Features: pens, shapes, lasso, text and LaTeX, finite pages with formats, PDF import/export, Google Drive sync, Zotero.
- `FORMAT_SPEC.md` what is known about the `.note` format (ZIP of protobuf shape records, `#points` streams, 2100-unit tiles).
- `qa/` retest runbooks for the Windows / Android testers and the Waydroid scripts.
- `samples/` a real `.note` and a PDF used by the tests.

## Tests
From `desktop-client/`: `node test-sync.mjs`, `test-zotero.mjs`, `test-pdf-export.mjs` (needs poppler + Python with
Pillow), `test-desktop-oauth.mjs`, `test-erase-saved.mjs`, `test-pages.mjs`. They run the real modules, no mocks of the
format code.

## Not included
The original StarNote APK (`artifacts/`) is deliberately not in the repo. Google OAuth client secrets and API keys are
entered by the user in the app and never stored in the source.
