# Branching, versions and releases

`main` is always green (`npm run check` passes) and holds the newest work. From 1.0 on, each release line has a branch of its
own so the version people use can get fixes while `main` moves on. `release/1.0` was cut at `v1.0.0-beta.1` (2026-10-16), after
Windows QA bundle 15 passed.

## Branches
| Branch | Use | Lifetime |
|---|---|---|
| `main` | development of the next version | permanent |
| `release/1.0` | the 1.0 line: betas, 1.0.0, then 1.0.x fixes. Fixes only, no features | until 1.0 is no longer supported |
| `feat/<name>` | a feature, cut from `main`, merged into `main` | merged then deleted |
| `fix/<name>` | a fix, cut from the oldest branch that needs it (usually `release/1.0`), merged there and then into `main` | merged then deleted |
| `docs/<name>` | documentation only, like `feat/` | merged then deleted |

```
main ──●──●──●───────●──●── (features for 1.1)
        \           /
release/1.0 ●──●──●──●  tags: v1.0.0-beta.1 … v1.0.0, v1.0.1
             \  /
           fix/xyz
```

## Flow
1. Topic branch: `git switch -c feat/<name> main` (or `fix/<name> release/1.0`); commit small, with messages saying why.
2. `npm run check` before every merge (CI runs the same).
3. Merge with `git merge --no-ff`; delete the topic branch.
4. A fix merged into `release/1.0` is then merged into `main` (`git switch main && git merge --no-ff release/1.0`), so `main`
   never loses a fix. Never merge `main` into a release branch: that would bring unreleased features along.
5. Push only when the owner decides.

## Versions and tags
Semantic Versioning: `MAJOR.MINOR.PATCH`, pre-releases `1.0.0-beta.N`. The version is in `package.json`,
`src-tauri/Cargo.toml` (Tauri takes the app version from it) and `src-tauri/tauri.conf.json`: keep all three equal.
- A beta or release is made on `release/1.0`: bump the version, add a CHANGELOG heading, commit, tag `v<version>`.
- **Android version code** must grow with every build people install, or the phone refuses the update. Tauri derives it
  from the version (`1.0.0` -> 1000000, `1.0.1` -> 1000001) and ignores `-beta.N`, so betas set it explicitly in
  `tauri.conf.json` (`bundle.android.versionCode`): `999900 + N` for `1.0.0-beta.N`. Remove that line for `1.0.0` itself.
- **Stable and internal (owner, 2026-10-19):** only `x.x.0` versions are stable releases (1.0.0, 1.1.0, ...). Versions in
  between (`1.0.1`, `1.0.2`, ...) are internal steps: built and tested, never released as stable. 1.0.0 comes from
  `release/1.0`; the work after it is **1.0.1** (handwriting search, Convert to LaTeX, PDF text and highlights, Android Google
  sign-in, palm rejection, ...), then **1.0.2** (the AI assistant); the next stable, **1.1.0**, is cut from them when the owner
  calls it stable (a `release/1.1` branch with betas, like 1.0). The work was first numbered 1.1.0; `1.1.0-alpha.1` (2026-10-19)
  was its first test build, everything after it is 1.0.1.
- `main` is the next internal version with `-dev` (now `1.0.1-dev`), so any build says what it is.
- **Test builds are `<internal version>-alpha.N`** (owner: builds are named by their version, never a number), now
  `1.0.1-alpha.N`. Each build that goes to testers bumps N in all three files, gets a CHANGELOG heading and a local tag
  `v<version>`. Files are named by it: `rea-starnote-<version>.zip`, `.apk`, `qa/RETEST_<version>.md`.
- Its Android `versionCode` is the previous build's plus one (999801 was 1.1.0-alpha.1, so 1.0.1-alpha.1 is 999802): it only
  grows, and stays below 1.0.0 (1000000), so a phone can always update to the next 1.0 beta or 1.0.0.
  ponytail: once 1.0.0 is on devices, internal builds need codes above 1000000 (for example 1000000 + 100 x patch + N); decide
  when 1.0.0 ships.

## QA bundles
Built from tracked files only (`git archive`) into `artifacts/rea-starnote-<version>.zip`, with a matching `qa/RETEST_<version>.md`
(bundles up to qa-22 were numbered). A beta
bundle is built from the release branch at its tag; a QA bundle of work in progress may still be built from `main` untagged.
The full recipe is in [../CLAUDE.md](../CLAUDE.md).
