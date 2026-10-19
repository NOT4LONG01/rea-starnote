# REA-StarNote (repo rea-starnote): instructions for Claude

Viewer/editor/sync client for StarNote `.note` files. TypeScript + HTML canvas; Tauri v2 desktop (Windows, Linux) and
Tauri Android; a Node command line. **`main` is stable** (only released x.x.0 versions; 1.0.0 is the first); all work and every QA
build is on the work branch **`dev`**; no release branches (owner). QA builds take the next last number (1.0.4, 1.0.5, ...) (docs/branching.md). Docs index: `docs/README.md`.

## What is the product
The **Android, Windows and Linux apps** (Google Drive + Zotero connectors) and the **CLI**. The localhost web version
(`npm run dev`) is for development only: say so in any doc you write, and test product behavior in the apps.

## Commands
- `npm run check`: typecheck (app + CLI) + `test/*.test.mjs` + build. Must pass before any merge.
- `npm test` (`node test/run-all.mjs [prefix]`), `npm run test:e2e` (needs Chrome), `npm run dev`, `npm run tauri dev|build`.
- CLI: `npm run build:cli`, `npm run cli -- <args>` (src/cli, bundled by scripts/build-cli.mjs).
- Android build/sign/Waydroid: `docs/android.md`, `scripts/waydroid-*.sh`.

## Layout
`src/` model (no UI) / render / data / integrations / cli / `main.ts` (UI) · `src-tauri/` (Rust + `gen/android`) ·
`test/` · `docs/` · `qa/` (tester runbooks) · `scripts/` · `artifacts/` (gitignored: APKs, QA zips, the original StarNote APK).
Dependencies point one way: main.ts -> render/data/integrations -> model; cli -> model.

## Rules
- **Never push to GitHub** (`origin` = NOT4LONG01/rea-starnote, private) until the owner says; commit locally. Branch per topic
  (`feat/`, `fix/` from `dev`, merged into `dev`), `git merge --no-ff` after `npm run check` and the full e2e; nothing is committed on `main`:
  a stable release merges `dev` into `main` and tags it there (docs/branching.md). Android versionCode: explicit from 1.0.0 on, each build the previous one + 1 (docs/branching.md).
- **Secrets:** never print `~/.android/starnote-release.pass`; never write client secrets/API keys to files, chat or Drive
  (the user types them into the app); the Windows QA session must never see keys. Drive/Zotero writes need explicit approval.
- Saving a `.note` stays non-destructive. Whether real StarNote opens our output is still unverified; do not claim it.
- Keep the identifier `com.starnote.interop` (installed apps' data) and the same signing keystore (updates).
- Keep all generated files inside the repo (`artifacts/`); delete build caches when asked, not elsewhere on the machine.
- Comments say why; shortcuts are marked `ponytail: <ceiling>, <upgrade path>`. MIT license (`LICENSE`, owner 2026-10-19). No ESLint or Prettier on purpose.

## QA bundles (only when the user asks)
Name every bundle and APK by its version, never by a number (owner, 2026-10-19): bump the last number first: 1.0.1, 1.0.2, ... (docs/branching.md).
`git archive --format=zip --prefix=rea-starnote/ -o artifacts/rea-starnote-<version>.zip <tag>`, with `qa/RETEST_<version>.md` written first;
the APK is `artifacts/rea-starnote-<version>.apk`.
Copy to Yonsei Drive `My Drive/QA` via GVFS (`/run/user/1000/gvfs/google-drive:host=yonsei.ac.kr,user=js.jeong/0AMawZ-Z1xeoLUk9PVA/QA/`),
verify the sha256 of the new copy, hash-check then `rm` the previous bundle I uploaded (never other Drive files), then message
the QA sessions (below) with name, size, SHA-256 and what to test. Latest: 1.0.4 (dev); then 1.0.0 (the first stable, on main, with README and LICENSE); 1.1.0 = the AI tutor/agent.
Two QA sessions (find them with ListAgents): "Laptop window QA" (Windows, gets the zip via Drive) and "playground-b5" (Linux app,
web, Waydroid; gets an unpacked copy in `artifacts/linux-qa-<version>`, builds there, never in the main tree).
