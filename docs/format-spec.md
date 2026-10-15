# StarNote (.note) File Format Specification

**Document Version:** 1.0  
**Target Application:** StarNote (`com.onyx.galaxy.global.note`)  
**Verified On:** StarNote v1.5.3 (Build 5703) on Android (Samsung Galaxy Z Fold 7 / `SM-F971N`)  
**Evidence Source:** Shipped APK bytecode, native libraries (`libengine_sdk.so`, `libgraphicv2.so`, `libgraphenginev2.so`, `libarchive.so`), and real-world sample file verification (`test.note`).

---

## 1. Container Architecture & File Structure

A `.note` file is a standard PK ZIP container (`PK\x03\x04`) without encryption. All paths inside the archive reside within a single root directory identified by the document's canonical UUID:

```
<document-uuid>/
├── <document-uuid>.png                     # Thumbnail / cover preview PNG
├── extra/
│   └── pb/
│       └── extra                           # Envelope metadata (Protobuf)
├── note/
│   └── pb/
│       └── note_info                       # Document metadata, layers & page mapping (Protobuf)
├── virtual/
│   ├── doc/
│   │   └── pb/
│   │       └── <document-uuid>             # Viewport, boundless canvas & margin settings (Protobuf)
│   └── page/
│       └── pb/
│           └── <page-uuid>                 # 2D Infinite Canvas tile spatial layout (Protobuf)
├── document/
│   └── <document-uuid>/
│       └── template/
│           └── json/
│               ├── <document-uuid>.template_json  # Global template definition (JSON)
│               └── Page[row-col].template_json    # Per-tile template rules (JSON)
├── shape/
│   └── Page[row-col]#<uuid>#<timestamp>.zip       # Vector shape & stroke objects (Protobuf inside ZIP)
├── point/
│   └── Page[row-col]/
│       └── Page[row-col]#<stroke-uuid>#points    # Raw hardware stroke point records (Custom Binary)
├── stash/                                         # Undo / history snapshots & archived shapes
└── ftsContent/ & ftsPageState/                    # Full-Text Search and handwriting OCR indices
```

---

## 2. Envelope & Global Metadata

### 2.1 `extra/pb/extra` (Protobuf Wire Format)
Stores versioning and document origin attributes:

| Field Number | Wire Type | Data Type | Description | Observed Example |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Varint (0) | `int32` | Format schema version | `1` |
| **2** | Varint (0) | `int32` | App build `versionCode` | `5703` |
| **3** | Length (2) | `string` | User / Author Account UUID | `6a9f09e5a76cef4b033605be` |
| **4** | Length (2) | `string` | Document UUID | `14384f35-f378-4bf5-8e43-e7c1f6b0dd81` |
| **6** | Varint (0) | `int32` | Document sync / state flags | `1` |

### 2.2 `note/pb/note_info` (Protobuf + Embedded JSON)
Primary document configuration:

| Field Number | Wire Type | Type | Description |
| :--- | :--- | :--- | :--- |
| **1.1** | Length (2) | `string` | Document UUID |
| **1.2** | Varint (0) | `int64` | Creation timestamp (milliseconds UTC) |
| **1.3** | Varint (0) | `int64` | Last modified timestamp (milliseconds UTC) |
| **1.6** | Length (2) | `string` | Note Title (e.g., `"test"`) |
| **1.9** | 32-bit (5) | `float32` | Default stroke width (default `5.0`) |
| **1.10** | 32-bit (5) | `float32` | Zoom / Scale level (default `100.0`) |
| **1.11** | Length (2) | `string` | Pen & Shape Defaults JSON |
| **1.12** | Length (2) | `string` | **Layer & Tile Configuration JSON** (see below) |
| **1.14** | Length (2) | `string` | Originating device hardware info (`SM-F971N`, screen dimensions) |
| **1.20** | Length (2) | `string` | Active tile list JSON (e.g. `{"pageNameList":["Page[0-0]","Page[-5--1]"]}`) |

#### Embedded Layer & Tile Configuration JSON (Field 1.12):
```json
{
  "canvasExpandType": "DEFAULT",
  "defaultPageRect": { "left": 0.0, "top": 0.0, "right": 2100.0, "bottom": 2100.0 },
  "pageInfoMap": {
    "Page[0-0]": {
      "width": 2100.0,
      "height": 2100.0,
      "colorTheme": 0,
      "currentLayerId": 0,
      "nextLayerId": 1,
      "layerList": [
        { "id": 0, "show": true, "lock": false, "opacity": 1.0, "status": 0, "updatedAt": 1791267287955 }
      ],
      "pageRectFWithMargin": { "left": 0.0, "top": 0.0, "right": 2100.0, "bottom": 2100.0 }
    }
  }
}
```

---

## 3. Infinite 2D Canvas Tiling Plane

StarNote utilizes a **Boundless (Infinite) Canvas Model** (`sizeFormat: "BOUNDLESS"`):
* The infinite drawing space is partitioned into a 2D matrix of discrete **Tiles**, each measuring $2100 \times 2100$ coordinate units.
* Tile identifier syntax: `Page[Y-X]` (or `Page[row-col]`).
* The spatial origin `Page[0-0]` occupies coordinates $[0, 2100] \times [0, 2100]$.
* Expanding upward/leftward introduces negative indices (e.g., `Page[-1-0]` occupies $[0, 2100] \times [-2100, 0]$, `Page[-5--1]` occupies $[-2100, 0] \times [-10500, -8400]$).
* The active tiles and their global bounding boxes are registered in `virtual/page/pb/<page-uuid>`.

---

## 4. Vector Shape Object Format (`shape/*.zip`)

Each active tile stores its vector shapes in a compressed ZIP containing a Protobuf binary payload. The payload comprises repeated `ShapeRecord` elements (Field 1):

### `ShapeRecord` Protobuf Wire Mapping:
| Field Number | Wire Type | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **1** | Length (2) | `string` | Shape UUID (36 ASCII characters, matches `#points` trailer `parentUuid`) |
| **2** | Varint (0) | `int64` | Creation timestamp (ms) |
| **3** | Varint (0) | `int64` | Last modification timestamp (ms) |
| **4** | Varint (0) | `uint64` | **Stroke Color (ARGB-8888 packed in 32/64-bit varint)** |
| **5** | 32-bit (5) | `float32` | Stroke base line width |
| **7** | Length (2) | `string` | Bounding Box JSON (`left`, `top`, `right`, `bottom`, `empty`) |
| **8** | Length (2) | `string` | 2D Transformation Matrix JSON (affine $3 \times 3$ values) |
| **9** | Length (2) | `string` | **Typography / Text Style JSON** (`textSize`, `isTextBold`, `isTextItalic`, `alignType`, `textWidth`, `textHeight`) |
| **10** | Length (2) | `string` | **Plaintext string content** (for Text Box / Shape Type 16) |
| **11** | Length (2) | `string` | **Brush Physics & Dynamics JSON** (see below) |
| **12** | Varint (0) | `int32` | **Shape Type ID** (see Taxonomy below) |
| **15** | Varint (0) | `int32` | Layer ID (matching `layerList[i].id`) |
| **17** | Length (2) | `string` | **Line Style JSON** (e.g. `{"lineStyle":{"phase":0.0,"type":0}}`) |
| **18** | Length (2) | `string` | Group UUID (matching Shape ZIP filename UUID) |
| **22** | Length (2) | `string` | ProseMirror Rich Text HTML payload (for Type 16) |
| **24** | Length (2) | `string` | **Shape Version JSON** (e.g. `{"a":{"KEY_SHAPE_VERSION":2},"repo":{"KEY_SHAPE_VERSION":2}}`) |
| **26** | Length (2) | `string` | **Cross-Tile Proxy JSON** (`shapeReferenceBean` with translation matrix, target `pageId`, target `shapeId`) |

> **Note on Linkage:** Real StarNote Type 2 ShapeRecords contain fields `[1, 2, 3, 4, 5, 7, 8, 11, 12, 15, 17, 18, 24]`. There is no Field 16 on Type 2 strokes. The `#points` file links to the ShapeRecord because its trailer `parentUuid` exactly equals Field 1 (`shapeUuid`). Field 18 (`groupUuid`) links the shape to its containing shape archive `Page[row-col]#<groupUuid>#<timestamp>.zip`.

#### Shape Taxonomy & The 294 Shape Records Breakdown:
In the sample archive `test.note`, there are 294 total ShapeRecords across `shape/*.zip`:
1. **Type 2 — Freehand Stylus Ink Stroke (34 shapes):** Standard ballpoint / fountain pen strokes. Active point files exist for the current drawing state, while superseded strokes have their point streams purged by the engine to reduce file size.
2. **Type 16 — Rich Text Box (3 shapes):** Formatted text boxes (`HELLO_INTEROP_TEST` in `Page[-5--1]`, 2 in `Page[-4--1]`). Field 7 provides local coordinates, Field 10 provides plain text, and Field 22 contains ProseMirror HTML. In multi-segment `#points` files, a 36-byte segment matching the text box bounds acts as an internal spatial anchor.
3. **Type 46 — Brush / Highlighter Dynamics Stroke (210 shapes):** Width 5.91 px vs 3.54 px. 170 of these also exist in `stash/archivedShape/`, confirming they represent historical/undo snapshots.
4. **Type 2000 — Cross-Tile Virtual Proxy Reference (47 shapes):** Spatial references generated when shapes overlap multiple tiles. They contain an affine matrix translation in `shapeReferenceBean.matrixValues` (e.g. $[1, 0, 0, 0, 1, 2100, 0, 0, 1]$) pointing to master shapes on neighboring tiles. They carry no `#points` files of their own.

#### Color Varint Encoding:
Color values are encoded as standard Android `0xAARRGGBB` in a varint.
* Pure Black: `18446744073692774400` $\rightarrow$ `0xFF000000`
* Preset Red: `0xFFB33333` (Red `179`, Green `51`, Blue `51`)

#### Brush Dynamics JSON Specification (Field 11):
```json
{
  "alphaFactor": 1.0,
  "brushShape": 1,
  "directionEnabled": true,
  "displayScale": 1.0819331,
  "dpi": 428.23846,
  "maxPressure": 32767.0,
  "pressureSensitivity": 0.375,
  "smoothLevel": 0.2,
  "velocityAmplifier": 0.0,
  "velocityIgnoreThreshold": 0.0,
  "velocityLowerBound": 0.0,
  "velocitySensitivity": 0.0,
  "velocityUpperBound": 0.0
}
```

---

## 5. Raw Hardware Point Stream Specification (`#points`)

High-precision stylus input is captured in raw binary point files stored under `point/Page[row-col]/`:

```
File name: Page[row-col]#<stroke-uuid>#points
Byte Order: Big-Endian (Network Byte Order)
```

### Complete Binary Layout:

```
+-----------------------------------------------------------------------+
| Header (76 Bytes)                                                     |
|   - 0x00..0x03 (4 B): Format Version (uint32_be = 1)                  |
|   - 0x04..0x27 (36 B): Page Tile Tag (ASCII, space-padded, "Page[0-0]")|
|   - 0x28..0x4B (36 B): Stroke UUID (ASCII, 36 chars)                  |
+-----------------------------------------------------------------------+
| Point Array (N × 16 Bytes)                                            |
|   Each Point:                                                         |
|     - Offset +0x00 (4 B): dt (uint32_be, relative ms from stroke start)|
|     - Offset +0x04 (4 B): X (float32_be, coordinate in tile space)     |
|     - Offset +0x08 (4 B): Y (float32_be, coordinate in tile space)     |
|     - Offset +0x0C (4 B): Pressure (uint32_be, 0 .. 32767)             |
+-----------------------------------------------------------------------+
| Duration Footer (4 Bytes)                                             |
|   - Total Stroke Duration (uint32_be, milliseconds)                   |
+-----------------------------------------------------------------------+
| Chained Trailer Table (M × 44 Bytes + 4-Byte Offset)                  |
|   For each segment i = 0 .. M-1 (at trailerOff + i * 44):             |
|     - Offset +0x00..+0x23 (36 B): Parent / Link Shape UUID (ASCII)     |
|     - Offset +0x24..+0x27 (4 B):  Header Offset (uint32_be)           |
|     - Offset +0x28..+0x2B (4 B):  Points Byte Length (uint32_be)      |
|   Final 4 Bytes of File:                                              |
|     - Offset -0x04..-0x00 (4 B):  Trailer Table Start Offset (uint32_be)|
+-----------------------------------------------------------------------+
```

> **Note on Multi-Segment Chaining:** While simple strokes feature $M=1$ (trailer length 48 bytes), complex operations (e.g. text-box point bindings or multi-pass strokes) chain $M \ge 2$ segments where the file concludes with the 4-byte `trailerOff`, and the entries between `trailerOff` and `file.length - 4` point to distinct point segments and parent UUIDs within the file (e.g. `Page[-5--1]#0bd65fdd` features 2 segments at 2208 bytes total).

### Pressure Normalization Formula:
$$\text{Normalized Pressure } p_{\text{norm}} = \frac{\text{raw\_pressure}}{\text{maxPressure}} = \frac{p}{32767.0}$$

---

## 6. Template Engine (`.template_json`)

Background patterns (lines, dots, grids) are configured via JSON:
* `universalShapeType`: `"layout_horizontal_line_fitted"`, `"layout_grid"`, `"layout_cornell"`
* `spacing`: Line/grid pitch in coordinate units (e.g. `86.81`)
* `strokeAttr`: Color (`-7829368`), width (`0.7875`), `roundCorner: true`

---

## 7. Rich-Text & Typing System

Typed text is rendered through an embedded WebView running a customized ProseMirror instance (`assets/main.js` targeting DOM node `#onyx-reditor`).
* Exported text runs serialize character runs, bounding boxes, and styles via `onEditorTextRun`:
  $$\{ \text{text}, \text{style: } \{ \text{fontSize}, \text{color}, \text{bold}, \text{italic} \}, \text{rect: } \{ x, y, w, h \} \}$$

