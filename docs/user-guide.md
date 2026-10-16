# User guide

For the Android, Windows and Linux apps. (The localhost web version is for development; use an app.)

## Library
Your notes are kept on the device. The library shows a grid with the tabs All / Notes / PDF, search, sort, and a trash
(deleted notes stay there until you empty it). Create a note with **New note** and choose the paper (A4, A5, ...) and template
(blank, ruled, grid, dots), the line spacing (Narrow, Medium, Wide) and the type:
  - **Pages**: finite pages (A4, A5, Tablet 4:3, ...) one under the other.
  - **Infinite**: no page edges; write anywhere and pan as far as you like (the paper keeps its ruling the whole way).
  **Import .note / .pdf** adds a file from the device.

### Notebooks (folders)
A **notebook** is a folder for notes. Create one from *Create* (or the folder button) with the type *Notebook*: it only asks for a name and opens the new notebook. Tap it to open it: the path
at the top (All notes › Physics › Lab) takes you back up. **Select several:** the select button (or Ctrl/⌘-click, or press and hold a card) lets you pick several notes or notebooks
and Move to…, Duplicate, Download (as one .zip), Colour… or trash them together. Sort > *Notebooks open in* sets Grid or Sections
for every notebook (one you switched yourself keeps its own). Sort > *Manual* lets you drag cards into your own order
(the same order the Sections view uses). Notebooks nest, and a note you create or import while a notebook is
open goes inside it. Move a note or notebook with *Move to…* in its menu, or drag its card onto a notebook card or onto a name
in the path. The search looks in every notebook. Trashing a notebook trashes what is inside it, and restoring brings it all back.
**Sections view (like OneNote).** Inside a notebook, switch *Grid* to *Sections*: the notebook's sub-notebooks become coloured tabs
(sections), and the open section lists its pages. *+ Section* and *+ Page* add one; drag a page up or down (or *Move up / down*
in its menu) to set the order; a section's menu has *Colour…*. In the editor the *Pages* button opens a rail with all the
pages of the notebook, each section under its own heading. *Quick Notes* in the sidebar lists the notes that are not in any notebook. Page order and colours sync.

On Google Drive each notebook is a sub-folder of the *StarNote* folder, nested the same way, and renames, moves and deletes
are mirrored in both directions. Opened notes appear as tabs; the title at
the top lists them.

## Editor
- **Tools** (left rail on a wide phone, top row elsewhere): pen, eraser, select (lasso), shapes, text, hand. Tapping the
  active tool opens its options (pen type, four quick colors, sizes; the eraser also has Clear page). The button next to
  the pen sets pressure or opacity and a custom color. **Pen & touch settings** covers stylus-only drawing.
- **Pen vs finger:** the stylus draws; fingers pan and pinch to zoom (the hand tool lets a finger drag the page).
- **Lasso** selects strokes to move, recolor, copy and paste. **Text** boxes take plain text and LaTeX math (`$$...$$`).
- **Pages:** the pages menu adds, deletes, moves pages and changes their format; the add-page button at the end adds one.
- **Page browser:** tap the page number ("2 / 3") to see every page as a thumbnail: tap one to go there, drag to reorder,
  ⋯ for move / add after / delete.
- **Page panel** (the page-with-gear button, top right): the open page's paper, orientation, style and line spacing, applied
  live to this page or all pages, and *+ Page after*, *+ Page at end*, *Move up / down*, *Delete page*. For an infinite
  canvas it sets the style of the whole sheet.
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
