# Command line

`rea-starnote` works on `.note` files without a window: look inside one, check it, convert it, or create a blank one. It
runs the same loader, serializer and PDF writer as the apps. Needs Node 20 or newer.

## Run it
```
npm run build:cli                       # writes dist-cli/rea-starnote.mjs (one file, runnable with node)
node dist-cli/rea-starnote.mjs --help
npm run cli -- info my.note             # builds, then runs (the -- passes the arguments on)
```

## Commands
| Command | Does |
|---|---|
| `info <file.note> [--json]` | title, id, page or canvas layout, and per page: size, template, stroke and text-box counts |
| `text <file.note> [--json]` | every text box, with its page; LaTeX math appears as its `$$source$$` |
| `validate <file.note>` | checks the ZIP, `note_info`, every point stream, shape files, `interop/pages.json`, and that the app can load it |
| `export <file.note> -f svg\|pdf\|json [-o out]` | convert; default output is `<name>.<format>` beside the cwd; `-o -` writes svg/json to stdout |
| `new -o <file.note> [options]` | create a note (below) |

`new` options: `--kind pages|infinite` (default pages), `--title T`, `--paper a4|a5|a6|b5|letter|tablet|slide|square`
(default a4), `--landscape`, `--template blank|lined|grid|dotted` (default lined; `ruled` and `dots` work too), `--spacing narrow|medium|wide` (default medium),
`--pages N` (1-500, default 1). An infinite canvas starts as one tile and ignores
`--paper`, `--landscape` and `--pages`.

## Exit codes
`0` success, `1` the file is bad or missing (`validate` found problems), `2` wrong usage (unknown command or option, missing
argument). Messages go to stderr; data goes to stdout, so `export -o -` and `--json` pipe cleanly.

## Examples
```
node dist-cli/rea-starnote.mjs info lecture.note   # below: shortened to rea-starnote (alias it, or use npm run cli --)
rea-starnote text lecture.note --json | jq '.[].text'
rea-starnote export lecture.note -f pdf -o lecture.pdf
rea-starnote new -o weekly.note --paper a5 --landscape --template grid --pages 7 --title "Week 42"
rea-starnote validate weekly.note && echo fine
```

## Limits
- PDF export of a free-form StarNote canvas includes only the tiles that have ink, text or a background (an empty 12-tile canvas with ink on 3 gives a 3-page PDF); a page-stack note keeps its blank pages.
- PDF and SVG export draw strokes, text and page layout. The **page backgrounds of PDF-based notes are bitmaps and are not
  drawn** (the command line has no image decoder); use the app to export those with their background.
- `validate` checks structure, not whether the real StarNote app opens the file (that check is still open, see
  [format-spec.md](format-spec.md)).
- The CLI reads and creates files only. It does not talk to Google Drive or Zotero; sync stays in the apps.
