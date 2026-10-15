# Development

## Setup
- Node 22 (`.nvmrc`; `nvm use`), then `npm ci`.
- Rust (stable) and the Tauri prerequisites only if you build the desktop or Android app. On Linux:
  `bash scripts/linux-tauri-deps.sh`.

## Everyday commands
| Command | What it does |
|---|---|
| `npm run dev` | dev server at http://localhost:1420 (the Google OAuth client is registered for exactly that origin) |
| `npm run typecheck` | `tsc --noEmit` (strict, no unused locals/params) |
| `npm test` | every `test/*.test.mjs`; `node test/run-all.mjs sync` runs one |
| `npm run build` | typecheck + production bundle in `dist/` |
| `npm run check` | all of the above; what CI runs |
| `npm run tauri dev` / `npm run tauri build` | desktop app (`-- --no-bundle` for just the binary) |

`test/pdf-export.test.mjs` needs `pdfinfo`, `pdftoppm`, `pdftotext` (poppler) and Python with Pillow; Ghostscript is optional.

## Adding a test
Copy the header of `test/pages.test.mjs`: bundle the modules you need with esbuild, then use `assert`. Keep tests on
the real modules; use the sample note in `public/samples/test.note` for format questions.

## The base settings in this repo
| File | Purpose |
|---|---|
| `package.json` | dependencies, scripts, `engines` (minimum Node) |
| `package-lock.json` | exact dependency versions: commit it, install with `npm ci` |
| `tsconfig.json` | TypeScript strictness; `include: ["src"]` |
| `vite.config.ts` | dev server (port 1420, fixed) and build target |
| `.nvmrc` | the Node version everyone (and CI) uses |
| `.editorconfig` | indentation, charset, final newline: editors apply it automatically |
| `.gitattributes` | LF line endings in the repo (Windows checkouts too); marks binary files |
| `.gitignore` | keeps dependencies, build output, keystores, `.env` and the proprietary APK out of git |
| `.github/workflows/ci.yml` | runs `npm run check` on every push and pull request |
| `src-tauri/tauri.conf.json` | app name, window, identifier `com.starnote.interop` (do not change: it keys installed apps' data) |
| `src-tauri/Cargo.toml`, `Cargo.lock` | Rust dependencies for the desktop/Android shell |
| `src-tauri/capabilities/` | what the desktop window may do (HTTP hosts, opening the sign-in page) |

Not set up on purpose (add when the team wants them): ESLint and Prettier, a `LICENSE` (the owner's choice), release
automation, an issue template.

## Conventions
- Comments say *why*, not what. A deliberate shortcut is marked `ponytail: <ceiling>, <upgrade path>`.
- Never commit secrets. Client IDs are public identifiers; client secrets and API keys are typed into the app.
- Saving must stay non-destructive: change the archive only where the edit requires it.
- The Android and Tauri identifier `com.starnote.interop` stays, so installs keep their data.

## QA
Retest runbooks for the Windows and Android testers are in `qa/`. A retest bundle is a zip of the repo without
`node_modules`, `dist`, `src-tauri/target`, `artifacts` and `qa/reports`.
