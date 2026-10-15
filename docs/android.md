# Building the Android app (Tauri Android)

The Android app is the same web UI inside a native shell (Tauri v2). On a landscape phone screen under 520 px tall (e.g.
Galaxy Note 8) the editor switches to the wide-phone layout: a left tool rail, a thin top strip, floating options.
The app is fullscreen (system bars hidden; swipe from an edge to show them) and saves files through Android's "Save as"
dialog (the WebView ignores in-page downloads, so `MainActivity.kt` exposes `window.StarNoteAndroid.saveFile`).

## One-time setup (no sudo)
- JDK 17 (a JRE is not enough): unpack Temurin 17 to e.g. `~/Android/jdk-17`.
- Android SDK: command-line tools -> `sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973"`
  (installing also asks to accept the Android SDK licenses).
- Rust targets: `rustup target add aarch64-linux-android x86_64-linux-android`.
- `npx tauri android init` was already run; the project lives in `src-tauri/gen/android` (kept in git).

## Build
```
export ANDROID_HOME=$HOME/Android/Sdk NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973 JAVA_HOME=$HOME/Android/jdk-17
npx tauri android build --debug --apk --target x86_64    # for the Waydroid emulator
npx tauri android build --apk --target aarch64           # for a phone (release, unsigned)
```
Output: `src-tauri/gen/android/app/build/outputs/apk/universal/{debug,release}/`.
A release APK must be signed before it installs: `apksigner sign --ks <keystore> --out app.apk app-universal-release-unsigned.apk`.
Keep the same keystore for every build, or Android refuses to update the installed app (uninstall first instead).

## Install
- Emulator: `adb install -r app-universal-debug.apk`, then `adb shell am start -n com.starnote.interop/.MainActivity`.
- Phone: copy the signed APK to the phone and open it (allow "install unknown apps" for the file manager once), or
  `adb install -r` over USB with USB debugging on.

## Emulating a Galaxy Note 8 in Waydroid
`adb shell wm size 2220x1080` and `adb shell wm density 420` (landscape, about 846 x 411 CSS px); undo with
`wm size reset` / `wm density reset`.
