# Branching, versions and releases

Trunk-based: `main` is always green (`npm run check` passes) and always the newest work.

## Branches
| Branch | Use | Lifetime |
|---|---|---|
| `main` | the trunk | permanent |
| `feat/<name>`, `fix/<name>`, `docs/<name>` | one topic each, cut from `main` | merged then deleted |
| `release/0.N` | only while a version is in QA: fixes land here, then merge back to `main` | days |

## Flow
1. `git switch -c feat/<name> main`; commit small, with messages saying why.
2. Before merging run `npm run check` (CI runs the same).
3. Merge with `git merge --no-ff feat/<name>` so each topic stays visible in history; delete the branch.
4. Push only when the owner decides (currently: one big push after the Windows QA session signs off).

## Versions
Semantic Versioning, staying `0.x` until the owner calls it 1.0: `0.MINOR.PATCH`. A new feature bumps the minor, a fix the
patch. The version lives in `package.json` and `src-tauri/Cargo.toml` (keep them equal; Tauri takes the app version from
Cargo.toml). Tag releases `v0.N.P` on `main` and add them to [CHANGELOG.md](../CHANGELOG.md).

## QA bundles
A retest bundle is a zip of the repo without `node_modules`, `dist`, `dist-cli`, `src-tauri/target`, `artifacts` and
`qa/reports`, named `rea-starnote-qa-N.zip`, with a matching `qa/RETEST_N.md`. A signed APK ships alongside it.
