# Roadmap

| Version | Branch | What | State |
|---|---|---|---|
Only `x.x.0` versions are stable; every QA build in between takes the next last number, 1.0.1, 1.0.2, ... (owner, 2026-10-19; docs/branching.md).

| Version | Branch | What | State |
|---|---|---|---|
| 1.0.0 (stable) | `release/1.0` | the first release: notes, notebooks and sections, Pages / Infinite, PDF, Drive, Zotero, CLI; Android, Windows, Linux | 1.0.0-beta.1 out (2026-10-16); the real-phone beta check comes next |
| 1.0.x (QA builds) | `main` (+ `feat/handwriting-recognition`) | multi-select, the name REA-StarNote; **handwriting search inside a note**, **Convert to LaTeX**, PDF text and highlights, Android Google sign-in, palm rejection, Hand at start | next QA build 1.0.1 (the first one was named 1.1.0-alpha.1) |
| a later 1.0.x | `main` | **AI assistant** (below) | planned |
| a later 1.0.x | `main` | **Pictures in notes**: paste (Ctrl+V) and drag in, shown on the page, move, resize, delete; later from a file and the Android camera. Stored the way StarNote stores images; real StarNote opening such a note is unverified until checked on the phone | in progress |
| 1.1.0 (stable) | `release/1.1`, cut from 1.0.x | everything in the 1.0.x QA builds (handwriting search, Convert to LaTeX, PDF text and highlights, split view, the app icon, the AI assistant if ready) **plus pictures in notes** | owner, 2026-10-19: order is 1.0.0, QA builds 1.0.1, 1.0.2, ..., then 1.1.0 when pictures are in and the owner calls it stable |

## Handwriting search inside a note (first in 1.0.1)
*Find in note* (a search button in the editor, Ctrl+F): typed and PDF text everywhere, offline; handwriting once the AI has
read it, only when asked (*Read handwriting (AI)*: a picture of each page's ink with its lines numbered, one request per page,
the text per line kept by the app, never in the `.note`). Each match jumps to its page and is highlighted.
**No recognizer on the device (owner, 2026-10-19):** handwriting is read only through the AI. The first builds used Windows'
ink recognizer and Google ML Kit on Android; both were removed (smaller app, no model downloads; ML Kit had also needed
special shrinking rules). Their test on the owner's OneNote pages (2026-10-17) read prose well and math poorly; the AI reads
both.

## Later: OneNote ink importer
Turn existing OneNote notes into REA-StarNote notes with their ink as real strokes (so handwriting search and the assistant can
read them). PDF exports cannot be used: OneNote flattens ink into filled outlines there, without stroke order. OneNote keeps the
original ink; on Windows its COM API gives a page's XML with the ink data, which Windows can load with its points. Plan: a
Windows-only import (or a CLI step) that reads a section's pages and writes `.note` notes (pages with strokes and typed text),
tested on copies of the owner's sample sections, which stay private (never in the repo).

## AI assistant for students and researchers (a later 1.0.x)
An assistant that sees what you wrote and helps with it, through the AI provider *you* connect.

**What it reads (owner, 2026-10-19):** the note's text as the app already indexes it for Find in note, so questions about a
whole notebook do not need page images: typed text, the handwriting read on the device (Korean and English, line by line),
an imported PDF's own text, and the passages the highlighter covers on a PDF ("summarise what I highlighted", "quiz me on my
highlights"). Images of the ink are sent only where text is not enough (math, diagrams). Built for 1.0.1: the index
(`src/integrations/handwriting.ts`: lines, PDF lines and words, highlighted passages); *What was read* in the Find bar shows it.

**What it does**
- *Ask about this*: lasso some ink (or take the whole page), ask a question ("explain this", "check this derivation", "what is
  the next step"); the answer appears in a side panel, and *Insert* puts it on the page as a text box (LaTeX for math).
- *Read my handwriting*: turn a selection or page into typed text or LaTeX (a multimodal model reads Korean, English and math
  from the page image; it is also how Find gets handwriting, see above). The math half shipped early, in
  1.0.1, as *Convert to LaTeX* (`src/integrations/ai.ts`).
- *Summarise / quiz*: a section or notebook summarised, or turned into practice questions.
- *With your papers* (researchers): relate a question to the Zotero PDFs already in the library.

**How it connects**
- Provider: OpenRouter (one key, many models including free ones; OpenAI-compatible), already used by Convert to LaTeX;
  the owner chose it. Direct Anthropic / OpenAI adapters only if OpenRouter falls short. The user types their own API key into the app (like Drive and Zotero today): it is stored on
  the device only, never in files, chat or Drive. Usage is billed to that key.
- What is sent: only what the user asked about, at the moment they ask (the selection or page as an image, plus the question).
  Nothing is sent in the background. The panel says which provider and model answered.
- Works on Android, Windows and Linux (it is plain HTTPS, through the app's native networking).

**Open decisions (for when the assistant starts)**
- Which models to offer by default, and whether to show the cost of a question before sending.
- Whether answers are kept with the note (a history per page) or only inserted when asked.
- Offline: the assistant needs internet; handwriting search (1.0.1) keeps working offline on Windows and Android.
