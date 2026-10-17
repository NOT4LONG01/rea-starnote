# Roadmap

| Version | Branch | What | State |
|---|---|---|---|
| 1.0.0 | `release/1.0` | the first release: notes, notebooks and sections, Pages / Infinite, PDF, Drive, Zotero, CLI; Android, Windows, Linux | 1.0.0-beta.1 out (2026-10-16); the real-phone beta check comes next |
| 1.1.0 | `main` (+ `feat/handwriting-recognition`) | multi-select, default notebook view, the name REA-StarNote; **handwriting search inside a note** | multi-select etc. on `main`; handwriting in progress |
| 1.1.1 | from `main` after 1.1.0 | **AI assistant** (below) | planned |

## 1.1.0: handwriting search inside a note
*Find in note* (a search button in the editor, Ctrl+F): typed text everywhere, handwriting where the platform has a recognizer
(Windows' own ink recognizer, Google ML Kit on Android; none on Linux and the web). Each match jumps to its page and is highlighted.
Recognized text is kept by the app, never written into the `.note`. Built on the branch: line grouping and matching (unit tests),
the Windows recognizer (type-checked for Windows), the Android bridge (builds), the stored index, the Find bar (e2e test with a
stand-in recognizer). On the owner's OneNote pages (2026-10-17, mostly English) the English (US)
recognizer read every line of 16 pages, 0 failures: prose comes out as readable words, math as noisy fragments (no recognizer
reads math; that is what Convert to LaTeX is for). Next: QA of the Find bar on Windows and on the phone, then merge into `main`.

## Later: OneNote ink importer
Turn existing OneNote notes into REA-StarNote notes with their ink as real strokes (so handwriting search and the assistant can
read them). PDF exports cannot be used: OneNote flattens ink into filled outlines there, without stroke order. OneNote keeps the
original ink; on Windows its COM API gives a page's XML with the ink data, which Windows can load with its points. Plan: a
Windows-only import (or a CLI step) that reads a section's pages and writes `.note` notes (pages with strokes and typed text),
tested on copies of the owner's sample sections, which stay private (never in the repo).

## 1.1.1: AI assistant for students and researchers
An assistant that sees what you wrote and helps with it, through the AI provider *you* connect.

**What it does**
- *Ask about this*: lasso some ink (or take the whole page), ask a question ("explain this", "check this derivation", "what is
  the next step"); the answer appears in a side panel, and *Insert* puts it on the page as a text box (LaTeX for math).
- *Read my handwriting*: turn a selection or page into typed text or LaTeX (a multimodal model reads Korean, English and math
  from the page image, usually better than the on-device recognizers, which do not read math).
- *Summarise / quiz*: a section or notebook summarised, or turned into practice questions.
- *With your papers* (researchers): relate a question to the Zotero PDFs already in the library.

**How it connects**
- Providers: Anthropic (Claude) first, then OpenAI; one small adapter per provider, all behind the same "send images + a
  question, stream the answer" call. The user types their own API key into the app (like Drive and Zotero today): it is stored on
  the device only, never in files, chat or Drive. Usage is billed to that key.
- What is sent: only what the user asked about, at the moment they ask (the selection or page as an image, plus the question).
  Nothing is sent in the background. The panel says which provider and model answered.
- Works on Android, Windows and Linux (it is plain HTTPS, through the app's native networking).

**Open decisions (for when 1.1.1 starts)**
- Which models to offer by default, and whether to show the cost of a question before sending.
- Whether answers are kept with the note (a history per page) or only inserted when asked.
- Offline: the assistant needs internet; handwriting search (1.1.0) keeps working offline on Windows and Android.
