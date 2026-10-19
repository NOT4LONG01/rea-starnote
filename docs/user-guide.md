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
and Move to…, Duplicate, Download (as one .zip), Colour… or trash them together. All notes has its own Grid / Sections switch: in
Sections its notebooks are the tabs and the notes in no notebook are *Quick Notes* (each notebook keeps its own switch too). Sort > *Manual* lets you drag cards into your own order
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
- The app opens with the **hand** tool selected (moving around never leaves a mark); pick the pen to write.
- **Pen vs finger:** once a pen has been used on the device, palm rejection is on: the stylus draws, fingers pan and pinch to
  zoom. A device without a pen draws with a finger. *Pen & touch settings > Stylus only* turns it on or off for good.
- **Lasso** selects strokes to move, recolor, copy and paste. **Text** boxes take plain text and LaTeX math (`$$...$$`).
- **Convert to LaTeX** (Σ, shown while ink is selected): an AI model reads the selected handwriting and the Math panel opens
  with its LaTeX; fix it if needed, then Done replaces the ink with the formula (Undo brings the ink back, Cancel keeps it).
  It needs an [OpenRouter](https://openrouter.ai) key (models marked *Free* cost nothing; they have daily limits): *More > AI
  settings*, paste the key, pick a model that reads images. The key stays on this device. Only the selection is sent, as a
  picture, to OpenRouter and that model's provider, and only when you press Σ.
- **Pages:** the pages menu adds, deletes, moves pages and changes their format; the add-page button at the end adds one.
- **Find in note** (the search button, or Ctrl+F): finds a word in the note's typed text and, in an imported PDF, in the PDF's
  own text, offline and right away. Handwriting is searched once the **AI has read it**: *Read handwriting (AI)* in the bar (it
  asks first) sends a picture of each page's handwriting, lines numbered, to OpenRouter and the model you chose (More > AI
  settings, your key), one request per page; Korean, English and math come back line by line. A page is read once and again
  only when you ask after changing it. *What was read* (under the bar) shows the text per line (`ai`) and, in a PDF, the
  passages you marked with the **highlighter** (`hl`). Enter / ↓ next, Shift+Enter / ↑ previous; matches are highlighted and
  the view moves to each. The read text stays in the app on this device; the `.note` file is not changed. A PDF imported
  before PDF text search (or a scan without text) needs importing again for its text.
- **Pictures:** paste one (Ctrl+V) or drop a picture file onto the page; it lands selected, under the ink. With the select
  tool, tap a picture to select it, drag it to move it, drag its corner handle to resize it (proportions kept), Delete (or the
  bin) removes it; Undo works as for ink. Big photos are scaled to 2400 px. Pictures are saved inside the `.note` the way
  StarNote's engine stores them, but whether StarNote itself shows them is not yet checked.
- **Split view** (the split button in the top bar): pick another open note, a recent one or a PDF to show beside the current
  one (one above the other on a tall screen). Each half has its own pages, zoom and undo; the tools work on the half you
  touched last (its head is tinted). Tapping the other half's tab moves there; the × on a half closes it (the other note
  fills the window), and the button or Back ends the split. Drag the divider between the halves to give one more room (20-80%;
  remembered, and a saved group keeps its own sizes); double-click it for half and half.
  **Groups:** while split, the split button offers *Save as a group…*: name the pair and it is listed under *Groups* in
  the library sidebar (and at the top of the split button's list); one tap opens both notes side by side again. Its ⋯ renames
  or deletes the group (the notes stay). Groups are kept on this device.
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

**On Android** there is nothing to type: *Sign in with Google* uses the phone's Google account (account picker and consent
screen from Google Play services). Once, in the same Google Cloud project as your Desktop client: *APIs & Services >
Credentials > Create credentials > OAuth client ID*, type **Android**, package name `com.starnote.interop`, SHA-1
`62:06:26:F8:30:16:3E:9C:52:5D:8E:87:22:28:B6:2C:85:1A:FF:DE` (the app's signing key; the same for every release). Your account
must be a Test user of the project, as for the desktop apps. Sign-in stays: Play services renews access by itself.

## Zotero
Zotero in the sidebar. Create an API key at zotero.org/settings/keys (read and write library, allow file access) and paste it
into the app. Browse collections, open a stored PDF to annotate it, and upload the annotated PDF back as a new attachment
on the same item. If a PDF is "not stored", file syncing is off for it in Zotero.

## Exporting
**More** menu: `.note` (opens again in the app), SVG (vector ink), PDF (pages with your ink on top; for PDF notes the
original page is underneath). On Android, files are saved through the system "Save as" dialog.

## Command line
The same files can be inspected and converted without the app: [cli.md](cli.md).
