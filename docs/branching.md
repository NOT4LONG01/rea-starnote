# Branching, versions and releases

**Owner, 2026-10-19:** `main` is stable; work happens on a work branch; no release branches. `main` only moves when a stable
version is released, so every commit on it is a released x.x.0 version. All work, and every QA build, is on **`dev`**.
`release/1.0` was removed (its 1.0.0-beta.1 stays as the tag `v1.0.0-beta.1`). **1.0.0 is the first stable version** (owner):
the code of QA build 1.0.4 once it checks out, released with a README for users and the MIT license. QA builds after it go on
from 1.0.5 (1.0.1-1.0.4 are taken), up to 1.1.0.

## Branches
| Branch | Use | Lifetime |
|---|---|---|
| `main` | stable releases only (`x.x.0`), each tagged `v<version>` | permanent |
| `dev` | the work branch: features and fixes land here; QA builds (`x.y.1`, `x.y.2`, ...) are tagged here | permanent |
| `feat/<name>`, `fix/<name>`, `docs/<name>` | one topic, cut from `dev`, merged into `dev` | merged, then deleted |

```
main  ───────────────────────●  v1.0.0 ──────────────●  v1.1.0
                            /                       /
dev   ──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──
           v1.0.3  v1.0.4    v1.0.5 v1.0.6 ...       (QA builds)
             \    /
            feat/xyz
```

## Flow
1. Topic branch from `dev`: `git switch -c feat/<name> dev`; small commits whose messages say why.
2. `npm run check` and the full `npm run test:e2e` before every merge.
3. `git merge --no-ff` into `dev`; delete the topic branch.
4. **QA build** (only when the owner asks): on `dev`, bump the last number, add a CHANGELOG heading, commit, tag `v<version>`,
   build the bundle and the APK (see ../CLAUDE.md).
5. **Stable release** (when the owner calls a QA build stable): on `dev`, set the version to the stable number (same code as
   the approved QA build, nothing else; the first is 1.0.0, then 1.1.0, ...), add its CHANGELOG heading, commit; merge `dev`
   into `main` (`git switch main && git merge --no-ff dev`), tag `v<version>` on `main`. `dev` goes on with QA builds.
6. Nothing is committed on `main` directly. A fix for a stable version goes through `dev`, a QA build and the next stable.
7. Push only when the owner decides.

## Versions and tags
Semantic Versioning. The version is in `package.json` (and `package-lock.json`), `src-tauri/Cargo.toml` (and `Cargo.lock`) and
`src-tauri/tauri.conf.json`: keep them equal.
- **Only `x.x.0` versions are stable** (owner, 2026-10-19). Every QA build between them takes the next last number (no `-alpha`
  or `-beta`): 1.0.1-1.0.4 before 1.0.0 (they were made first), 1.0.5, 1.0.6, ... after it, then 1.1.1, ... after 1.1.0. Files are named by the version:
  `rea-starnote-<version>.zip`, `.apk`, `qa/RETEST_<version>.md`. Between builds the files keep the last built version.
- **Android version code** must grow with every build, or a phone refuses the update. Up to 1.0.4 it is derived from the
  version (1.0.3 -> 1000003, 1.0.4 -> 1000004). From 1.0.0 on it is **explicit** in `tauri.conf.json`
  (`bundle.android.versionCode`), each build the previous one + 1 (1.0.0 -> 1000005, 1.0.5 -> 1000006, ...), because 1.0.0 comes
  after 1.0.4 although its number is smaller. (History: the 1.0.0 betas used 999900 + N, `1.1.0-alpha.1` used 999801.)
- History: the work was first numbered 1.1.0 (`1.1.0-alpha.1`, 2026-10-19), then shipped to QA as 1.0.1 to 1.0.4, and becomes 1.0.0.

## QA bundles
Built from tracked files only (`git archive`) at the build's tag on `dev` into `artifacts/rea-starnote-<version>.zip`, with
`qa/RETEST_<version>.md` written first; a stable bundle comes from `main` at its tag. The full recipe is in [../CLAUDE.md](../CLAUDE.md).
