# User guide

For the Android, Windows and Linux apps. (The localhost web version is for development; use an app.)

## Library
Your notes are kept on the device. The library shows a grid with the tabs All / Notes / PDF, search, sort, and a trash
(deleted notes stay there until you empty it). Create a note with **New note** and choose the paper (A4, A5, ...) and template
(blank, ruled, grid, dots); **Import .note / .pdf** adds a file from the device. Opened notes appear as tabs; the title at
the top lists them.

## Editor
- **Tools** (left rail on a wide phone, top row elsewhere): pen, eraser, select (lasso), shapes, text, hand. Tapping the
  active tool opens its options (pen type, four quick colors, sizes; the eraser also has Clear page). The button next to
  the pen sets pressure or opacity and a custom color. **Pen & touch settings** covers stylus-only drawing.
- **Pen vs finger:** the stylus draws; fingers pan and pinch to zoom (the hand tool lets a finger drag the page).
- **Lasso** selects strokes to move, recolor, copy and paste. **Text** boxes take plain text and LaTeX math (`$$...$$`).
- **Pages:** the pages menu adds, deletes, moves pages and changes their format; the add-page button at the end adds one.
- **Undo/redo** works until the note is saved (autosave runs a few seconds after you stop); after that, earlier edits can't be undone.
- **Fit** button: first tap fits the page height, the next the page width, and so on.
- Notes **autosave** a few seconds after you stop. Saving is non-destructive: parts of a `.note` the app does not understand
  stay untouched.

## Google Drive
The Google Drive account button (top left). You provide your own Google OAuth client (ID, and secret on the desktop apps) by typing it into
the app; sign-in opens your system browser. Sync is two-way: new and changed notes go up and down, a note changed on two
devices keeps both versions as a conflict copy, and deleting a note moves its Drive file to the Drive trash.

## Zotero
Zotero in the sidebar. Create an API key at zotero.org/settings/keys (read and write library, allow file access) and paste it
into the app. Browse collections, open a stored PDF to annotate it, and upload the annotated PDF back as a new attachment
on the same item. If a PDF is "not stored", file syncing is off for it in Zotero.

## Exporting
**More** menu: `.note` (opens again in the app), SVG (vector ink), PDF (pages with your ink on top; for PDF notes the
original page is underneath). On Android, files are saved through the system "Save as" dialog.

## Command line
The same files can be inspected and converted without the app: [cli.md](cli.md).
