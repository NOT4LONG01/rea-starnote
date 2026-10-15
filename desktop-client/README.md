# StarNote Multiplatform (Windows · Linux · Android)

A clean-room reconstructed viewer, editor, and cloud synchronization client for StarNote (`.note`) archives, built with TypeScript, HTML5 Canvas, Tauri v2, and Google Drive v3 integration.

---

## 🚀 Key Features

* **Cross-Platform Compatibility**:
  * **Windows & Linux**: Runs as a lightweight native desktop application via Tauri v2 or local web app.
  * **Android**: Full Progressive Web App (PWA) with 1-tap "Install App" / "Add to Home Screen" support on Chrome, Firefox, and Samsung Internet, plus native Android build via Tauri Mobile.
* **Google Drive Cloud Integration**:
  * Seamlessly search, open, and download `.note` files from your Google Drive.
  * Save and sync modified notes directly back to Google Drive (multipart upload).
  * Uses the **Google Identity Services** token flow — no client secret; access token lasts ~1 hour, then sign in again.
  * Includes **Quick Access Token** mode (e.g., via `gcloud auth print-access-token`) and **Demo Mode** for offline evaluation.
* **Hardware Stylus & Digitizer Engine**:
  * Reconstructed Catmull-Rom cubic spline curve smoothing and variable-width ribbon geometry matching StarNote's native C++ engine (`libengine_sdk.so`).
  * Full 15-bit pressure dynamics ($0 \dots 32767$) with customizable pressure exponent curves.
* **Android & Tablet Enhancements**:
  * **Palm Rejection ("Stylus Only" Mode)**: When toggled, finger touches exclusively pan and zoom the boundless canvas, while digitizer pens (Wacom, S-Pen, EMR) draw.
  * **2-Finger Pinch Zoom & Pan**: Fluid multi-touch navigation.
  * **E-Ink Mode**: High-contrast monochrome rendering without alpha gradients or drop shadows, engineered specifically for Onyx Boox and e-paper displays.
* **Infinite 2D Tiling Plane**:
  * Full support for boundless $2100 \times 2100$ coordinate tiles (`Page[Y-X]`), ruled paper templates ($86.81\text{ px}$ spacing), and multi-tile navigation.
* **PDF Document Loading & Stylus Annotation**:
  * Direct support for opening any standard `.pdf` document alongside `.note` archives (via Open File, Drag-and-Drop, or Google Drive).
  * High-DPI page rendering to infinite canvas tiles with customizable spacing.
  * Full stylus annotation, highlighting, margin writing, and pressure ribbon rendering over PDF pages.
  * Export annotated documents to vector `.svg` or pack into `.note` archives.
* **Exporting**:
  * Direct `.note` archive re-serialization (verified byte-accurate).
  * Clean vector SVG export (`.svg`) for publications, LaTeX manuscripts, or vector illustration.

---

## 📱 Platform Deployment

### 1. Android (Onyx Boox, Samsung Galaxy Tab, Pixel Tablet)
The client includes a complete PWA Manifest (`manifest.webmanifest`) and Service Worker (`sw.js`).
1. Host the built files (`dist/`) or run the dev server on your local network:
   ```bash
   npm run dev -- --host
   ```
2. On your Android device, navigate to the IP address (e.g. `http://192.168.1.50:1420`).
3. Tap the browser menu (&vellip;) and select **"Add to Home screen"** or **"Install App"**.
4. The app will launch in standalone fullscreen mode without browser URL bars, with full hardware stylus acceleration and palm rejection.

### 2. Linux & Windows (Desktop)
* **Web / Development**:
  ```bash
  npm run dev
  ```
  Open `http://localhost:1420` in any browser.
* **Native Desktop Binary (Tauri v2)**:
  Once the Rust toolchain is installed (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`):
  ```bash
  npm run tauri dev      # Native dev window
  npm run tauri build    # Generates .deb/.AppImage on Linux, .exe/.msi on Windows
  ```

---

## ☁️ Google Drive Setup Guide

1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Enable the **Google Drive API** in your project.
3. Under **Credentials**, create an **OAuth 2.0 Client ID**:
   * Application type: **Web application**
   * (Consent screen → add your Google account under **Test users**; `drive.readonly` is a restricted scope, fine for personal use in Testing mode)
   * Authorized JavaScript origins: `http://localhost:1420` (or your production domain)
   * Authorized redirect URIs: leave empty
4. In StarNote Desktop, click **Google Drive &rarr; Settings & OAuth**, paste your Client ID, and click **Sign in with Google**.
5. *Quick Alternative*: You can also paste an access token obtained from `gcloud auth print-access-token` for instant testing without configuring OAuth.

---

## 🔬 Reverse-Engineered Format Summary

* **Container**: PK ZIP archive containing Protobuf metadata (`note/pb/note_info`, `virtual/doc/pb`) and binary `#points` files.
* **Point Records**: 16-byte big-endian structs:
  $$\text{Record} = \big[ \Delta t \; (\text{uint32}), \; X \; (\text{float32}), \; Y \; (\text{float32}), \; \text{Pressure} \; (\text{uint32}) \big]$$
* **Validation**: Verified with `test-erase-saved.mjs` and `test-pages.mjs`, which run the real loader and serializer on a genuine StarNote sample (untouched point files re-serialize byte for byte).


---

## Library, Drive sync, Zotero, PDF export

* **Library**: notes live in this browser (IndexedDB). Import `.note` / `.pdf`, trash, rename, duplicate, search, sort.
* **Google Drive sync**: sidebar -> Connect Drive. Two-way sync with a "StarNote" Drive folder; deletions go to trash on both sides.
* **Zotero**: sidebar -> Zotero -> Account. Paste a Zotero API key (zotero.org/settings/keys; "Allow library access", plus "Allow write access" to save back). The key stays in this browser. Browse collections or search, open an item's PDFs, **Import**. In the editor "..." menu: **Save annotated PDF to Zotero** adds a new attachment to the same item (it never replaces files).
* **Annotated PDF**: editor "..." -> **Export annotated PDF**. One PDF page per note page: the page background (JPEG) with every stroke drawn on top as vector shapes, and typed text as real text (Latin-1 only; other characters become `?`).
* Limits: erasing/undo cover strokes drawn since the last save; Zotero's file storage must allow browser access (otherwise use the desktop app); the app has only been tested against a fake Zotero server, not a live account.
* Tests: `node test-sync.mjs`, `node test-zotero.mjs`, `node test-pdf-export.mjs` (needs `pdfinfo`, `pdftoppm`, `pdftotext`, `gs`, `python3` with PIL).
