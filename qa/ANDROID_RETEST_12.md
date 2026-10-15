# Android retest 12 (Waydroid on this Linux PC, and the user's Galaxy Note 8)

Test only; do not edit source, do not commit or push. Write the report to `qa/reports/android-retest12-<date>.md` (gitignored)
with screenshots in `qa/reports/android-retest12-<date>/`, and send a summary to the owner's session `playground-0a`.

## Rules
- No sudo. If a step needs root, mark it BLOCKED and give the command.
- Never print or copy `~/.android/starnote-release.pass` (the signing password). Never type credentials, client secrets or API keys.
- Drive and Zotero writes only after the user approves; touch only notes and notebooks you create, named `QA-...`.
- The emulator's app data is QA data; the user's real notes are on the phone. On the phone, only work in `QA-` items.

## Build and install (emulator)
```
export PATH="$HOME/.cargo/bin:$PATH" ANDROID_HOME=$HOME/Android/Sdk NDK_HOME=$HOME/Android/Sdk/ndk/27.0.12077973 JAVA_HOME=$HOME/Android/jdk-17
npx tauri android build --debug --apk --target x86_64
adb -s 192.168.240.112:5555 install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```
Waydroid: `bash scripts/waydroid-up.sh` (is usually already running; `waydroid status`). Note 8 size: `adb shell wm size 2220x1080`, `wm density 420`.
Screenshots: `adb exec-out screencap -p` prints a warning line first; cut everything before the PNG signature (`\x89PNG`).
Typing: `adb shell input text 'a%sb'` (`%s` = space). For the system name prompt, tap its field first, then Done, then OK.
A signed arm64 release APK for the phone: see `docs/android.md` (apksigner with `--ks-pass env:...`; the password never in output).

## Checks (PASS / FAIL / BLOCKED / NOT RUN + one line of evidence)
| # | Check |
|---|---|
| A1 | Launch, library, wide-phone layout (left tool rail, thin top strip), no overflow at 2220x1080 and in portrait 1080x2220 |
| A2 | Create dialog: Type Pages / Infinite / Notebook; Notebook asks only for a name and opens the notebook; the dialog fits a landscape phone |
| A3 | Notebooks: open, path (breadcrumbs), nested notebook, note created inside, Move to... (touch has no drag), rename, search, trash and restore with contents, Trash count |
| A4 | Pages note: pen, eraser, lasso, shapes, text typed on the page with the soft keyboard (stays visible above the keyboard), Math panel above the keyboard, undo |
| A5 | Infinite note: write far from the start in all directions, reopen |
| A6 | Autosave: commit text / draw, wait 5 s, `am force-stop com.starnote.interop`, relaunch: kept |
| A7 | Export: More menu > PDF / .note opens the Android "Save as" picker and writes the file (`adb shell ls /sdcard/Download`) |
| A8 | Old notes: library pictures redrawn once (no raw `$$latex$$`) |
| A9 | Phone (needs the user): install the signed APK over the old one (same key, notes kept), S Pen drawing and eraser end, palm, pinch zoom, lag |
| A10 | Real StarNote opens our files: BLOCKED until ARM translation is installed (`sudo bash scripts/waydroid-arm-fetch.sh`, the user runs it) |
