import { PEN_KINDS, PenType, penById, penFor } from "./model/pens";
import { SHAPE_KINDS, ShapeKind } from "./model/shapes";
import { isMathText, latexOf, wrapLatex, renderMath } from "./model/math";
import { PAPERS, TEMPLATES, SPACINGS, DEFAULT_FORMAT, DEFAULT_SPACING, NoteKind, PageFormat, PageTemplate, newCanvasTile, newPageTile, relayout, pageFormat, paperOf } from "./model/pages";
import { CanvasRenderer, ViewSnapshot } from "./render/canvas-renderer";
import { loadStarNoteArchive, StarNoteDocument, ParsedTextBox, ParsedStroke } from "./model/note-loader";
import { exportStarNoteArchive, exportCanvasAsSvg } from "./model/note-serializer";
import { GoogleDriveService, GoogleDriveFile, androidSignIn } from "./integrations/google-drive";
import { loadPdfDocument, convertPdfToStarNoteDocument } from "./render/pdf-loader";
import { library, renderThumbnail, renderPageThumbnail, LibraryItem, InkIndex } from "./data/library";
import { groupIntoLines, inkSignature, findIn, numberedInkImage, Box, InkStroke, pdfLines, pdfWords, highlightedPassages, PdfRun } from "./integrations/handwriting";
import { isFolder, childrenOf, descendantsOf, pathOf, canMoveTo, noteCount, visibleTrash, liveParent, byPlace, orderAt, rootNotebookOf } from "./data/folders";
import { isDesktopApp } from "./integrations/net";
import { syncLibrary } from "./data/sync";
import { ZoteroClient, ZoteroItem, ZoteroPdf, ZoteroCollection } from "./integrations/zotero";
import { exportAnnotatedPdf, safeFileName } from "./render/pdf-export";
import { aiKey, aiModel, setAiKey, setAiModel, aiReady, visionModels, readMath, readHandwritingLines } from "./integrations/ai";
import JSZip from "jszip";

// ---------------------------------------------------------------- icons
const ICONS: Record<string, string> = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dot: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
  spin: '<path d="M12 3a9 9 0 019 9"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  notes: '<path d="M12 4H7a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3v-5"/><path d="M18.5 3.5a2 2 0 013 3L12 16l-4 1 1-4z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  sort: '<path d="M4 6h12M4 12h8M4 18h4M17 6v12M14 15l3 3 3-3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h9a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9h-9a6 6 0 000 12h3"/>',
  pen: '<path d="M16 3l5 5L8 21H3v-5z"/><path d="M13 6l5 5"/>',
  eraser: '<path d="M8 20h12"/><path d="M5 15L15 5a2 2 0 013 0l2 2a2 2 0 010 3L11 19H8l-3-3a1.4 1.4 0 010-1z"/>',
  hand: '<path d="M18 11V6a2 2 0 00-4 0"/><path d="M14 10V4a2 2 0 00-4 0v2"/><path d="M10 10.5V6a2 2 0 00-4 0v8"/><path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 012.83-2.82L7 15"/>',
  fit: '<path d="M8 4H5a1 1 0 00-1 1v3M16 4h3a1 1 0 011 1v3M8 20H5a1 1 0 01-1-1v-3M16 20h3a1 1 0 001-1v-3"/>',
  fitw: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  fith: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  cloud: '<path d="M7 18a4 4 0 01-.6-7.95A6 6 0 0118 9.5 4.3 4.3 0 0117.5 18z"/>',
  pprev: '<path d="M4 5v14M20 12H8M13 7l-5 5 5 5"/>',
  pnext: '<path d="M20 5v14M4 12h12M11 7l5 5-5 5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M19 17H6a2 2 0 00-2 2"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  shape: '<rect x="3" y="11" width="9" height="9" rx="1.5"/><circle cx="15.5" cy="8.5" r="5.5"/>',
  brush: '<path d="M20 4c-5 1-9 5-10 9l2 2c4-1 8-5 8-11z"/><path d="M10 13c-3 0-4 2-4 4 0 1-1 2-2 3 3 1 7 0 7-3"/>',
  highlighter: '<path d="M9 3l7 7-6 6-3-1-3 3H2l3-4-1-3z"/><path d="M14 12l6-6M5 21h15"/>',
  lasso: '<path d="M12 4c-5 0-9 2.4-9 5.5S7 15 12 15s9-2.4 9-5.5S17 4 12 4z" stroke-dasharray="3 2.4"/><path d="M9 15c-.8 2.6.6 5 3 5"/>',
  paste: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V4a1 1 0 011-1h4a1 1 0 011 1v1M9 12h6M9 16h6"/>',
  pagecfg: '<path d="M6 3h8l4 4v6"/><path d="M6 3v18h7"/><circle cx="18" cy="18" r="2.5"/><path d="M18 13.5v2M18 20.5v2M13.5 18h2M20.5 18h2"/>',
  sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
  select: '<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M4.8 7l1.6 1.6L9.5 5.4"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  quick: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>',
  pages: '<rect x="3" y="4" width="6" height="16" rx="1.5"/><path d="M12 7h9M12 12h9M12 17h6"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
};

const iconSvg = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>`;

function hydrateIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("i[data-icon]").forEach((el) => {
    if (!el.firstElementChild) el.innerHTML = iconSvg(el.dataset.icon!);
  });
}

// ---------------------------------------------------------------- helpers
/**
 * Shows or hides a bar, panel, menu or dialog with its motion (the CSS keyframes per element in styles.css): it appears
 * with its "in" animation, and on hiding plays "out" before it is really hidden. No motion with reduced-motion or E-Ink.
 * `onHidden` runs once it is gone (not if it is shown again first).
 */
const leaving = new WeakMap<HTMLElement, () => void>();
function setShown(el: HTMLElement, show: boolean, onHidden?: () => void) {
  if (show) {
    const pending = leaving.get(el);
    if (pending) { leaving.delete(el); el.classList.remove("leaving"); el.removeEventListener("animationend", pending); }
    el.classList.remove("hidden");
    return;
  }
  if (el.classList.contains("hidden") || leaving.has(el)) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("eink-mode") || !el.isConnected;
  if (still) { el.classList.add("hidden"); onHidden?.(); return; }
  const done = () => {
    if (leaving.get(el) !== done) return;
    leaving.delete(el);
    el.removeEventListener("animationend", done);
    el.classList.remove("leaving");
    el.classList.add("hidden");
    onHidden?.();
  };
  leaving.set(el, done);
  el.addEventListener("animationend", done);
  setTimeout(done, 260); // in case no animation runs (e.g. the element has none)
  el.classList.add("leaving");
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function downloadBlob(blob: Blob, filename: string) {
  const android = (window as any).StarNoteAndroid; // set by the Android app: its WebView ignores in-page downloads
  if (android) {
    const reader = new FileReader();
    reader.onload = () => android.saveFile(filename, blob.type || "application/octet-stream", String(reader.result).split(",")[1] ?? ""); // opens "Save as"
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showToast(message: string, type: "success" | "error" | "info" = "info") {
  const container = $("toast-container");
  const toast = el("div", `toast ${type}`, message);
  container.appendChild(toast);
  const hide = () => setShown(toast, false, () => toast.remove()); // slides back out to the edge
  if (type === "error") { toast.style.pointerEvents = "auto"; toast.title = "Tap to close"; toast.addEventListener("click", hide); }
  setTimeout(hide, type === "error" ? Math.max(8000, message.length * 70) : 3200); // an error stays long enough to read (you may still be in the browser)
}

function debounce(fn: (...args: any[]) => void, delay: number) {
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const pref = {
  get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  remove: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};
const baseName = (n: string) => n.replace(/\.(note|pdf|zip)$/i, "");
const toBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

// ---------------------------------------------------------------- app
interface Session {
  item: LibraryItem;
  doc: StarNoteDocument;
  view: ViewSnapshot | null; // parked state while another tab is active
  isNew: boolean;            // never saved; skipped on close if untouched
  saving: Promise<void> | null;
  inFlight: number;          // saves in progress (a sync must not replace the note meanwhile)
}

document.addEventListener("DOMContentLoaded", async () => {
  hydrateIcons();
  const canvas = $<HTMLCanvasElement>("note-canvas");
  let renderer = new CanvasRenderer(canvas); // the focused half's renderer (split view has two; see panes)
  if (new URLSearchParams(location.search).has("debug")) (window as any).__starnote = { renderer }; // for performance tests only
  const drive = new GoogleDriveService();

  let items: LibraryItem[] = [];
  const sessions: Session[] = [];
  let active: Session | null = null;

  const ui = {
    folder: null as string | null, // the notebook being shown (null = top level)
    rootTab: null as string | null, // All notes in the Sections view: the top-level notebook whose tab is open (null = Quick Notes)
    filter: "all" as "all" | "quick" | "trash", // quick = notes that are in no notebook
    kind: "all" as "all" | "note" | "pdf",
    query: "",
    sort: pref.get("sn.sort", "modified") as "modified" | "created" | "title" | "manual", // manual = the order you drag cards into
  };

  // ============================================================ popover
  const pop = $("popover");
  function closePopover() { setShown(pop, false, () => { pop.innerHTML = ""; }); }
  function openPopover(anchor: HTMLElement, fill: (root: HTMLElement) => void) {
    pop.innerHTML = "";
    fill(pop);
    hydrateIcons(pop);
    setShown(pop, true);
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = r.left + w > window.innerWidth - 8 ? r.right - w : r.left; // open rightwards unless it would overflow
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, left))}px`;
    const below = r.bottom + 6;
    pop.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  }
  const popItem = (label: string, icon: string, run: () => void, opts: { danger?: boolean; checked?: boolean } = {}) => {
    const b = el("button", `pop-item${opts.danger ? " danger" : ""}`);
    b.innerHTML = `<i data-icon="${icon}"></i><span></span>${opts.checked ? '<i class="check" data-icon="check"></i>' : ""}`;
    b.querySelector("span")!.textContent = label;
    b.addEventListener("click", () => { closePopover(); run(); });
    return b;
  };
  document.addEventListener("pointerdown", (e) => {
    if (!pop.classList.contains("hidden") && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-pop]")) closePopover();
  });

  // ============================================================ library data
  async function refreshLibrary() {
    items = await library.list();
    renderLibrary();
    if (active && inEditor()) renderRail();
  }

  function visibleItems(): LibraryItem[] {
    const q = ui.query.trim().toLowerCase();
    const live = items.filter((i) => !i.trashed);
    const here = ui.filter === "trash" ? visibleTrash(items) : ui.filter === "quick" ? live.filter((i) => !isFolder(i) && !liveParent(items, i) && (!q || i.title.toLowerCase().includes(q))) : q ? live.filter((i) => i.title.toLowerCase().includes(q)) : live.filter((i) => liveParent(items, i) === ui.folder); // an item whose notebook is gone or trashed shows at the top level; a search looks in every notebook
    return here
      .filter((i) => ui.kind === "all" || (!isFolder(i) && i.kind === ui.kind))
      .sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || (ui.sort === "manual" ? byPlace(a, b) : ui.sort === "title" ? a.title.localeCompare(b.title) : b[ui.sort] - a[ui.sort])); // notebooks first
  }

  /** Cards rise in when you go somewhere else in the library (another notebook, section, filter or view), not on a refresh in place. */
  let lastPlace = "";
  function enterIfMoved(box: HTMLElement) {
    const ctx = sectionsCtx();
    const place = [ui.filter, ui.folder, ui.rootTab, ui.kind, ui.query ? "q" : "", ctx ? viewOf(ctx.nb) : ""].join("|");
    if (place !== lastPlace && lastPlace) sel.ids.clear(); // a selection belongs to the place it was made in
    box.classList.toggle("enter", place !== lastPlace);
    lastPlace = place;
  }

  function renderLibrary() {
    if (ui.folder && !items.some((i) => i.id === ui.folder && isFolder(i) && !i.trashed)) ui.folder = null; // the notebook is gone (deleted or synced away)
    $("count-all").textContent = String(items.filter((i) => !i.trashed && !isFolder(i)).length);
    $("count-trash").textContent = String(visibleTrash(items).length);
    $("count-quick").textContent = String(items.filter((i) => !i.trashed && !isFolder(i) && !liveParent(items, i)).length);
    renderCrumbs();
    const ctx = sectionsCtx();
    const view = $("lib-view");
    view.classList.toggle("hidden", !ctx);
    const sections = !!ctx && viewOf(ctx.nb) === "sections";
    const shown = sections ? "sections" : "grid";
    view.querySelectorAll<HTMLElement>("button").forEach((b) => b.classList.toggle("active", b.dataset.v === shown));
    $("lib-grid").classList.toggle("hidden", sections);
    $("lib-tabs").classList.toggle("hidden", sections);
    $("lib-sections").classList.toggle("hidden", !sections);
    if (sections) { renderSections(ctx!.nb); queueMicrotask(renderSelBar); return; }
    $("lib-drop-hint").innerHTML = ui.filter === "trash"
      ? "Trashed notes are also moved to Google Drive's trash when sync is on (Drive keeps them 30 days)."
      : "Drop a <b>.note</b> or <b>.pdf</b> file anywhere to import it.";
    document.querySelectorAll<HTMLElement>(".side-item").forEach((b) => b.classList.toggle("active", b.dataset.filter === ui.filter));
    document.querySelectorAll<HTMLElement>("#lib-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.kind === ui.kind));

    const grid = $("lib-grid");
    grid.innerHTML = "";
    enterIfMoved(grid);

    if (ui.filter !== "trash") {
      const create = el("div", "card create");
      const thumb = el("button", "card-thumb");
      thumb.title = "Create a note or a notebook";
      thumb.innerHTML = '<i data-icon="plus"></i>';
      thumb.addEventListener("click", () => void createNote());
      const meta = el("div", "card-meta");
      meta.appendChild(el("div", "card-title", "Create"));
      meta.appendChild(el("div", "card-date", ui.folder ? "A note or notebook here" : "A note or a notebook"));
      create.append(thumb, meta);
      grid.appendChild(create);
    }

    const list = visibleItems();
    for (const item of list) grid.appendChild(isFolder(item) ? folderCard(item) : card(item));
    [...grid.children].forEach((c, i) => (c as HTMLElement).style.setProperty("--i", String(Math.min(i, 12))));
    if (list.length === 0 && ui.filter === "trash") grid.appendChild(el("div", "empty-state", "Trash is empty."));
    if (list.length === 0 && ui.filter === "all" && (ui.query || ui.kind !== "all")) grid.appendChild(el("div", "empty-state", "No notes match."));
    queueMicrotask(() => { hydrateIcons(grid); renderSelBar(); });
  }

  // ---------- selecting several items: the select button, Ctrl/⌘-click, or press and hold a card; then act on them together
  const sel = { on: false, ids: new Set<string>() };
  const selected = () => items.filter((i) => sel.ids.has(i.id));
  function setSelecting(on: boolean) {
    sel.on = on;
    if (!on) sel.ids.clear();
    $("btn-select").classList.toggle("on", on);
    renderLibrary();
  }
  function toggleSelected(item: LibraryItem) {
    if (sel.ids.has(item.id)) sel.ids.delete(item.id); else sel.ids.add(item.id);
    sel.on = true;
    $("btn-select").classList.add("on");
    renderLibrary();
  }
  /** A card or row: Ctrl/⌘-click or press-and-hold selects; while selecting, a tap selects instead of opening. Returns true when it handled the tap. */
  let swallowClick = false; // a press-and-hold already selected: the click that follows the lift (on the re-rendered card) must not toggle it back
  function selectable(elx: HTMLElement, item: LibraryItem) {
    let timer = 0;
    elx.addEventListener("pointerdown", (e) => {
      swallowClick = false;
      if (e.pointerType !== "touch") return;
      timer = window.setTimeout(() => { swallowClick = true; toggleSelected(item); navigator.vibrate?.(15); }, 500);
    });
    for (const ev of ["pointerup", "pointercancel", "pointermove"]) elx.addEventListener(ev, (e) => { if (ev !== "pointermove" || Math.hypot((e as PointerEvent).movementX, (e as PointerEvent).movementY) > 4) clearTimeout(timer); });
    elx.addEventListener("click", (e) => {
      if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); return; } // the press-and-hold already selected it
      if (sel.on || e.ctrlKey || e.metaKey) { e.stopPropagation(); e.preventDefault(); toggleSelected(item); }
    }, true);
    if (sel.on) {
      elx.classList.toggle("selected", sel.ids.has(item.id));
      const check = el("span", "sel-check");
      check.innerHTML = sel.ids.has(item.id) ? '<i data-icon="check"></i>' : "";
      (elx.querySelector(".card-thumb, .pr-thumb") ?? elx).appendChild(check);
    }
  }
  /** The bar of actions for what is selected (only actions that fit the selection are offered). */
  function renderSelBar() {
    const bar = $("sel-bar");
    const picked = selected();
    if (!sel.on) { setShown(bar, false); return; }
    bar.innerHTML = "";
    const notes = picked.filter((i) => !isFolder(i)), folders = picked.filter(isFolder);
    bar.appendChild(el("span", "sel-count", picked.length ? `${picked.length} selected` : "Tap notes to select"));
    const act = (label: string, run: () => Promise<unknown> | unknown, cls = "") => {
      const b = el("button", `btn btn-sm ${cls}`, label);
      b.addEventListener("click", async () => { if ((await run()) !== false) setSelecting(false); });
      bar.appendChild(b);
      return b;
    };
    const sc = sectionsCtx();
    const visible = ui.filter !== "trash" && sc && viewOf(sc.nb) === "sections" ? sectionPages(sectionsOpen()) : visibleItems();
    const all = el("button", "btn btn-sm", picked.length === visible.length && visible.length ? "Select none" : "Select all");
    all.addEventListener("click", () => { if (picked.length === visible.length) sel.ids.clear(); else visible.forEach((i) => sel.ids.add(i.id)); renderLibrary(); });
    bar.appendChild(all);
    if (picked.length) {
      if (ui.filter === "trash") {
        act("Restore", () => setTrashedMany(picked, false));
        act("Delete forever", () => deleteForeverMany(picked), "btn-danger");
      } else {
        act("Move to…", () => moveManyTo(picked));
        if (notes.length) act(notes.length > 1 ? "Duplicate" : "Duplicate", () => duplicateMany(notes));
        if (notes.length) act(notes.length > 1 ? "Download (.zip)" : "Download .note", () => downloadMany(notes));
        if (folders.length) { const b = el("button", "btn btn-sm", "Colour…"); b.dataset.pop = "1"; b.addEventListener("click", () => pickColor(folders, b)); bar.appendChild(b); }
        act("Move to trash", () => setTrashedMany(picked, true), "btn-danger");
      }
    }
    act("Done", () => true);
    setShown(bar, true);
  }
  $("btn-select").addEventListener("click", () => setSelecting(!sel.on));

  /** The notes the grid shows right now, in their manual order (what a drag in the grid reorders). */
  const gridNotes = () => visibleItems().filter((i) => !isFolder(i));
  /** Manual sort: drop a card on the left or right half of another to put it there (mouse and pen; touch uses the card menu). */
  function gridReorder(c: HTMLElement, item: LibraryItem) {
    const side = (e: DragEvent) => (e.clientX - c.getBoundingClientRect().left > c.offsetWidth / 2 ? "after" : "before");
    c.addEventListener("dragover", (e) => {
      const moving = gridNotes().find((x) => x.id === dragId);
      if (!moving || moving.id === item.id) return;
      e.preventDefault(); e.stopPropagation();
      c.classList.toggle("drop-before", side(e) === "before");
      c.classList.toggle("drop-after", side(e) === "after");
    });
    c.addEventListener("dragleave", () => c.classList.remove("drop-before", "drop-after"));
    c.addEventListener("drop", (e) => {
      c.classList.remove("drop-before", "drop-after");
      const all = gridNotes(), moving = all.find((x) => x.id === dragId);
      if (!moving || moving.id === item.id) return;
      e.preventDefault(); e.stopPropagation();
      dragId = null;
      const rest = all.filter((x) => x.id !== moving.id);
      void placePage(moving, all, rest.indexOf(item) + (side(e) === "after" ? 1 : 0));
    });
  }

  /** Manual sort on touch: move a card one place earlier or later. */
  function manualMoves(item: LibraryItem): HTMLElement[] {
    if (ui.sort !== "manual" || ui.query) return [];
    const list = gridNotes(), i = list.findIndex((x) => x.id === item.id), out: HTMLElement[] = [];
    if (i > 0) out.push(popItem("Move earlier", "undo", () => void placePage(item, list, i - 1)));
    if (i >= 0 && i < list.length - 1) out.push(popItem("Move later", "redo", () => void placePage(item, list, i + 1)));
    return out;
  }

  function card(item: LibraryItem): HTMLElement {
    const c = el("div", "card");
    if (!item.trashed) makeDraggable(c, item);
    if (!item.trashed && ui.sort === "manual" && !ui.query) gridReorder(c, item);
    queueMicrotask(() => selectable(c, item)); // after the card is built (the check goes on its picture)
    const thumb = el("button", "card-thumb");
    if (item.thumb) {
      const img = el("img");
      img.src = item.thumb;
      img.alt = "";
      img.draggable = false;
      thumb.appendChild(img);
    }
    if (item.kind === "pdf") thumb.appendChild(el("span", "card-badge", "PDF"));
    if (item.syncId) {
      const pending = item.modified > (item.syncLocal ?? 0);
      const b = el("span", `card-sync${pending ? " pending" : ""}`);
      b.title = pending ? "Waiting to sync to Drive" : "Synced to Drive";
      b.innerHTML = '<i data-icon="cloud"></i>';
      thumb.appendChild(b);
    }
    thumb.addEventListener("click", () => (item.trashed ? showToast("Restore this note to open it.", "info") : openItem(item.id)));

    const title = el("div", "card-title");
    title.appendChild(el("span", "", item.title));
    const menu = el("button");
    menu.dataset.pop = "1";
    menu.innerHTML = '<i data-icon="chevron"></i>';
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      openPopover(menu, (root) => {
        if (item.trashed) {
          root.append(
            popItem("Restore", "undo", () => setTrashed(item, false)),
            popItem("Delete forever", "trash", () => deleteForever(item), { danger: true })
          );
        } else {
          root.append(
            popItem("Open", "notes", () => openItem(item.id)),
            popItem("Rename", "pen", () => renameItem(item)),
            ...manualMoves(item),
            popItem("Move to…", "folder", () => void moveItemTo(item)),
            popItem("Duplicate", "copy", () => duplicateItem(item)),
            popItem("Download .note", "download", () => downloadItem(item)),
            popItem("Move to trash", "trash", () => setTrashed(item, true), { danger: true })
          );
        }
      });
    });
    title.appendChild(menu);
    const meta = el("div", "card-meta");
    meta.append(title, el("div", "card-date", fmtDate(item.modified)));
    c.append(thumb, meta);
    return c;
  }

  const setTrashed = (item: LibraryItem, trashed: boolean) => setTrashedMany([item], trashed);
  /** Trash or restore items; a notebook takes its contents with it, both ways. One question, one message. */
  async function setTrashedMany(picked: LibraryItem[], trashed: boolean) {
    const folders = picked.filter(isFolder);
    if (trashed && folders.length) {
      const n = folders.reduce((k, f) => k + noteCount(items, f.id), 0);
      const what = picked.length === 1 ? `the notebook "${picked[0].title}"` : `${picked.length} items`;
      if (n && !confirm(`Move ${what} and the ${n} note${n === 1 ? "" : "s"} inside to the trash?`)) return false;
    }
    for (const item of picked) {
      for (const it of isFolder(item) ? [item, ...descendantsOf(items, item.id)] : [item]) {
        const fields: Partial<LibraryItem> = { trashed };
        if (!trashed && it === item && it.parentId && !liveParent(items, it)) { fields.parentId = undefined; fields.modified = Date.now(); } // its notebook is in the trash: it comes back at the top level
        await library.update(it.id, fields);
        if (trashed) closeSession(sessions.find((s) => s.item.id === it.id), true);
      }
    }
    await refreshLibrary();
    const n = picked.length;
    showToast(trashed ? (n === 1 ? "Moved to trash" : `${n} items moved to trash`) : (n === 1 ? "Restored" : `${n} items restored`), "info");
    scheduleSync(); // the Drive copy follows (Drive's trash is recoverable for 30 days)
    return true;
  }

  const deleteForever = (item: LibraryItem) => deleteForeverMany([item]);
  async function deleteForeverMany(picked: LibraryItem[]) {
    const all = picked.flatMap((item) => (isFolder(item) ? [item, ...descendantsOf(items, item.id)] : [item]));
    const one = picked[0];
    const what = picked.length > 1 ? `${picked.length} items (${all.length} with what is inside)` : isFolder(one) ? `the notebook "${one.title}" and everything in it (${all.length - 1} item${all.length === 2 ? "" : "s"})` : `"${one.title}"`;
    if (!confirm(`Permanently delete ${what}? This cannot be undone.`)) return false;
    for (const it of all) {
      if (it.syncId) addTombstone(it.syncId); // the Drive copy stays; just never re-import it
      await library.remove(it.id);
      closeSession(sessions.find((s) => s.item.id === it.id), true);
    }
    await refreshLibrary();
    scheduleSync();
    return true;
  }

  /** A one-line text question in the app's own dialog (the webview's prompt() looks foreign: "JavaScript - tauri://localhost", a full-screen editor on Android). */
  function askText(title: string, value = ""): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = $("ask-modal"), input = $<HTMLInputElement>("ask-input");
      $("ask-title").textContent = title;
      input.value = value;
      const done = (v: string | null) => { setShown(modal, false); input.onkeydown = null; resolve(v); };
      $("ask-ok").onclick = () => done(input.value);
      $("ask-cancel").onclick = () => done(null);
      input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); done(input.value); } else if (e.key === "Escape") { e.preventDefault(); done(null); } };
      setShown(modal, true);
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  }

  async function renameItem(item: LibraryItem) {
    const name = (await askText(isFolder(item) ? "Rename notebook" : "Rename note", item.title))?.trim();
    if (!name || name === item.title) return;
    const fields = { title: name, modified: Date.now() };
    await library.update(item.id, fields);
    const s = sessions.find((x) => x.item.id === item.id);
    if (s) s.item = { ...s.item, ...fields };
    scheduleSync();
    await refreshLibrary();
    renderEditorChrome();
    renderTabs();
  }

  // ---------- notebooks (folders): create, open, move
  let dragId: string | null = null; // the card being dragged inside the library (a file dragged in from outside has no id)
  async function newFolder(name: string, parent: string | null = ui.folder) {
    const now = Date.now(), id = crypto.randomUUID();
    await library.put({ id, title: name, kind: "folder", created: now, modified: now, trashed: false, parentId: parent ?? undefined });
    await refreshLibrary();
    const sc = sectionsCtx();
    if (parent === null && sc && !sc.nb && viewOf(null) === "sections") { ui.rootTab = id; renderLibrary(); } // All notes in Sections: the new notebook's tab opens
    else openFolder(id); // straight into it, ready for its first note
    scheduleSync();
  }
  function openFolder(id: string | null) {
    ui.folder = id;
    ui.query = "";
    $<HTMLInputElement>("lib-search").value = "";
    renderLibrary();
  }
  const moveItem = (item: LibraryItem, target: string | null) => moveMany([item], target);
  async function moveMany(picked: LibraryItem[], target: string | null) {
    const movable = picked.filter((it) => (it.parentId ?? null) !== target && canMoveTo(items, it.id, target));
    if (!movable.length) return false;
    for (const item of movable) {
      const fields = { parentId: target ?? undefined, modified: Date.now() };
      await library.update(item.id, fields);
      const s = sessions.find((x) => x.item.id === item.id);
      if (s) s.item = { ...s.item, ...fields };
    }
    await refreshLibrary();
    const where = target ? items.find((i) => i.id === target)?.title ?? "the notebook" : "All notes";
    showToast(movable.length === 1 ? `Moved to ${where}` : `${movable.length} items moved to ${where}`, "info");
    scheduleSync();
    return true;
  }
  const moveItemTo = (item: LibraryItem) => moveManyTo([item]);
  async function moveManyTo(picked: LibraryItem[]) {
    const dest = await pickFolder(picked.length === 1 ? `Move "${picked[0].title}" to` : `Move ${picked.length} items to`, picked);
    return dest !== undefined && (await moveMany(picked, dest));
  }
  /** The "Move to" chooser: the top level and every notebook, indented. Resolves to the folder id, null (top level) or undefined (cancelled). */
  function pickFolder(title: string, moving: LibraryItem[]): Promise<string | null | undefined> {
    return new Promise((resolve) => {
      const modal = $("move-modal"), list = $("move-list");
      $("move-title").textContent = title;
      list.innerHTML = "";
      const done = (v: string | null | undefined) => { setShown(modal, false); resolve(v); };
      const row = (label: string, id: string | null, depth: number) => {
        const b = el("button");
        b.style.paddingLeft = `${12 + depth * 18}px`;
        b.innerHTML = '<i data-icon="folder"></i><span></span>';
        b.querySelector("span")!.textContent = label;
        b.disabled = moving.some((m) => !canMoveTo(items, m.id, id)) || moving.every((m) => (m.parentId ?? null) === id); // no notebook into itself; somewhere at least one item is not already
        b.addEventListener("click", () => done(id));
        list.appendChild(b);
      };
      row("All notes (top level)", null, 0);
      const walk = (parent: string | null, depth: number) => {
        for (const f of childrenOf(items.filter((i) => isFolder(i) && !i.trashed), parent).sort((a, b) => a.title.localeCompare(b.title))) { row(f.title, f.id, depth); walk(f.id, depth + 1); }
      };
      walk(null, 1);
      hydrateIcons(list);
      $("move-cancel").onclick = $("move-close").onclick = () => done(undefined);
      setShown(modal, true);
    });
  }
  /** Dragging a card onto a notebook card or a breadcrumb moves it there (mouse and pen; on touch use "Move to…"). */
  function makeDraggable(c: HTMLElement, item: LibraryItem) {
    c.draggable = true;
    c.addEventListener("dragstart", (e) => { dragId = item.id; e.dataTransfer?.setData("text/x-starnote-item", item.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; });
    c.addEventListener("dragend", () => { dragId = null; });
  }
  function dropTarget(target: HTMLElement, folderId: string | null) {
    const ok = () => { const it = dragId ? items.find((i) => i.id === dragId) : undefined; return !!it && canMoveTo(items, it.id, folderId) && (it.parentId ?? null) !== folderId; };
    target.addEventListener("dragover", (e) => { if (!dragId) return; e.stopPropagation(); if (ok()) { e.preventDefault(); target.classList.add("drop"); } });
    target.addEventListener("dragleave", () => target.classList.remove("drop"));
    target.addEventListener("drop", (e) => {
      target.classList.remove("drop");
      if (!dragId) return;
      e.preventDefault(); e.stopPropagation();
      const it = items.find((i) => i.id === dragId);
      dragId = null;
      if (it && canMoveTo(items, it.id, folderId)) void moveItem(it, folderId);
    });
  }
  function renderCrumbs() {
    const h = $("lib-title");
    h.innerHTML = "";
    if (ui.filter === "trash") { h.textContent = "Trash"; return; }
    if (ui.filter === "quick") { h.textContent = "Quick Notes"; return; }
    if (ui.query.trim()) { h.textContent = "Search in all notes"; return; } // a search is not limited to the open notebook
    const path = pathOf(items, ui.folder);
    const crumb = (label: string, id: string | null, current: boolean) => {
      const b = el(current ? "span" : "button", "crumb", label);
      if (!current) { b.addEventListener("click", () => openFolder(id)); dropTarget(b, id); }
      return b;
    };
    h.appendChild(crumb("All notes", null, path.length === 0));
    path.forEach((f, i) => { h.append(el("span", "crumb-sep", "›"), crumb(f.title, f.id, i === path.length - 1)); });
  }
  function folderCard(item: LibraryItem): HTMLElement {
    const c = el("div", "card folder-card");
    queueMicrotask(() => selectable(c, item));
    const thumb = el("button", "card-thumb");
    thumb.innerHTML = '<i data-icon="folder"></i>';
    if (item.color) { thumb.style.color = item.color; thumb.style.background = `color-mix(in srgb, ${item.color} 22%, #2b2f36)`; }
    const n = noteCount(items, item.id, item.trashed); // in the Trash its contents are trashed too, but still count
    thumb.appendChild(el("span", "folder-count", String(n)));
    if (item.syncId) {
      const pending = item.modified > (item.syncLocal ?? 0);
      const b = el("span", `card-sync${pending ? " pending" : ""}`);
      b.title = pending ? "Waiting to sync to Drive" : "Synced to Drive";
      b.innerHTML = '<i data-icon="cloud"></i>';
      thumb.appendChild(b);
    }
    thumb.addEventListener("click", () => (item.trashed ? showToast("Restore this notebook to open it.", "info") : openFolder(item.id)));
    if (!item.trashed) { makeDraggable(c, item); dropTarget(c, item.id); }
    const title = el("div", "card-title");
    title.appendChild(el("span", "", item.title));
    const menu = el("button");
    menu.dataset.pop = "1";
    menu.innerHTML = '<i data-icon="chevron"></i>';
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      openPopover(menu, (root) => {
        if (item.trashed) root.append(popItem("Restore", "undo", () => setTrashed(item, false)), popItem("Delete forever", "trash", () => deleteForever(item), { danger: true }));
        else root.append(
          popItem("Open", "folder", () => openFolder(item.id)),
          popItem("Rename", "pen", () => renameItem(item)),
          popItem("Colour…", "sliders", () => pickColor(item, menu)),
          popItem("Move to…", "folder", () => void moveItemTo(item)),
          popItem("Move to trash", "trash", () => setTrashed(item, true), { danger: true })
        );
      });
    });
    title.appendChild(menu);
    const meta = el("div", "card-meta");
    meta.append(title, el("div", "card-date", `${n} note${n === 1 ? "" : "s"}`));
    c.append(thumb, meta);
    return c;
  }

  // ---------- OneNote-style view: a notebook's sub-notebooks are its sections (tabs), the notes in a section its pages
  const NB_COLORS = ["#d9534f", "#e8833a", "#d4a514", "#4caf50", "#2aa1b3", "#3f7fd9", "#8a63d2", "#c45ca2"];
  const DEFAULT_TAB = "#5b8db8";
  /** A notebook's or section's colour: the one picked, else one of the palette chosen from its id, so tabs differ from the start and keep it. */
  const colourOf = (f: LibraryItem | null) => {
    if (!f) return DEFAULT_TAB;
    if (f.color) return f.color;
    let h = 0;
    for (const ch of f.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return NB_COLORS[h % NB_COLORS.length];
  };
  /** The notebook whose sections are shown: when a top-level notebook or one of its sections is open (deeper levels use the grid). */
  /**
   * Where the Grid / Sections switch applies: a top-level notebook or one of its sections ({nb}), or All notes itself ({nb: null}),
   * which in the Sections view is the root: its notebooks are the tabs and its loose notes the Quick Notes tab.
   */
  function sectionsCtx(): { nb: LibraryItem | null } | null {
    if (ui.filter !== "all" || ui.query) return null;
    if (!ui.folder) return { nb: null };
    const { root, depth } = rootNotebookOf(items, ui.folder);
    return root && depth <= 1 ? { nb: root } : null;
  }
  /** Each place keeps its own view: a notebook by its id, All notes as "root". Grid unless switched. */
  const viewKey = (nb: LibraryItem | null) => `sn.view.${nb ? nb.id : "root"}`;
  const viewOf = (nb: LibraryItem | null) => pref.get(viewKey(nb), "grid");
  $("lib-view").querySelectorAll<HTMLElement>("button").forEach((b) => b.addEventListener("click", () => {
    const ctx = sectionsCtx();
    if (!ctx) return;
    pref.set(viewKey(ctx.nb), b.dataset.v!);
    renderLibrary();
  }));
  const liveIn = (parent: string) => items.filter((i) => !i.trashed && i.parentId === parent);

  function pickColor(item: LibraryItem | LibraryItem[], anchor: HTMLElement) {
    const list = Array.isArray(item) ? item : [item];
    const one = list.length === 1 ? list[0] : null;
    openPopover(anchor, (root) => {
      root.append(el("div", "pop-title", one ? `Colour of "${one.title}"` : `Colour of ${list.length} notebooks`));
      const g = el("div", "color-swatches");
      for (const c of NB_COLORS) {
        const b = el("button", one && c === one.color ? "active" : "");
        b.style.setProperty("--c", c);
        b.title = c;
        b.addEventListener("click", () => { closePopover(); void setColor(list, c); });
        g.appendChild(b);
      }
      root.append(g, popItem("No colour", "close", () => void setColor(list, undefined)));
    });
  }
  async function setColor(list: LibraryItem[], color: string | undefined) {
    for (const item of list) await library.update(item.id, { color, modified: Date.now() });
    await refreshLibrary();
    scheduleSync();
  }

  /** Puts a page at `index` of its list (the list it is in, sorted by place). Only that page changes. */
  async function placePage(item: LibraryItem, list: LibraryItem[], index: number) {
    const rest = list.filter((x) => x.id !== item.id).sort(byPlace);
    const at = Math.max(0, Math.min(rest.length, index));
    await library.update(item.id, { order: orderAt(rest, at), modified: Date.now() });
    const s = sessions.find((x) => x.item.id === item.id);
    if (s) s.item = { ...s.item, order: orderAt(rest, at) };
    await refreshLibrary();
    scheduleSync();
  }
  /** Drag a row up or down its list to reorder (mouse and pen). Rows also keep their move-to-notebook drag (onto a tab or the path). */
  function reorderable(row: HTMLElement, item: LibraryItem, list: () => LibraryItem[]) {
    row.draggable = true;
    row.addEventListener("dragstart", (e) => { dragId = item.id; e.dataTransfer?.setData("text/x-starnote-item", item.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; });
    row.addEventListener("dragend", () => { dragId = null; });
    const side = (e: DragEvent) => (e.clientY - row.getBoundingClientRect().top < row.offsetHeight / 2 ? "before" : "after");
    row.addEventListener("dragover", (e) => {
      const moving = list().find((x) => x.id === dragId);
      if (!moving || moving.id === item.id) return;
      e.preventDefault(); e.stopPropagation();
      row.classList.toggle("drop-before", side(e) === "before");
      row.classList.toggle("drop-after", side(e) === "after");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
    row.addEventListener("drop", (e) => {
      row.classList.remove("drop-before", "drop-after");
      const all = list().sort(byPlace), moving = all.find((x) => x.id === dragId);
      if (!moving || moving.id === item.id) return;
      e.preventDefault(); e.stopPropagation();
      dragId = null;
      const rest = all.filter((x) => x.id !== moving.id);
      void placePage(moving, all, rest.indexOf(item) + (side(e) === "after" ? 1 : 0));
    });
  }
  function noteMenu(item: LibraryItem, anchor: HTMLElement, list?: LibraryItem[]) {
    openPopover(anchor, (root) => {
      root.append(popItem("Open", "notes", () => openItem(item.id)), popItem("Rename", "pen", () => renameItem(item)));
      if (list) { // a page list: touch has no drag, so up / down are here
        const sorted = [...list].sort(byPlace), i = sorted.findIndex((x) => x.id === item.id);
        if (i > 0) root.append(popItem("Move up", "undo", () => void placePage(item, sorted, i - 1)));
        if (i < sorted.length - 1) root.append(popItem("Move down", "redo", () => void placePage(item, sorted, i + 1)));
      }
      root.append(
        popItem("Move to…", "folder", () => void moveItemTo(item)),
        popItem("Duplicate", "copy", () => duplicateItem(item)),
        popItem("Download .note", "download", () => downloadItem(item)),
        popItem("Move to trash", "trash", () => setTrashed(item, true), { danger: true })
      );
    });
  }

  /** The open tab of a sections view: a section's (or notebook's) id; at All notes the chosen notebook, or null for Quick Notes. */
  function sectionsOpen(): string | null { return ui.folder ?? ui.rootTab; }
  /** What a tab lists: the notes (and deeper notebooks) in it; at All notes, Quick Notes lists the notes in no notebook. */
  const sectionPages = (tab: string | null) => (tab ? items.filter((i) => !i.trashed && i.parentId === tab) : items.filter((i) => !i.trashed && !isFolder(i) && !liveParent(items, i)));

  function renderSections(nb: LibraryItem | null) {
    const box = $("lib-sections");
    box.innerHTML = "";
    const home = nb?.id ?? null; // the notebook, or null for All notes
    const sections = (home ? liveIn(home) : items.filter((i) => !i.trashed && !i.parentId)).filter(isFolder).sort(byPlace);
    const loose = sectionPages(home).filter((i) => !isFolder(i));
    const hasOwn = !nb || loose.length > 0 || sections.length === 0; // a notebook's own pages get a tab when it has some; All notes always has Quick Notes (where a quick note is added)
    if (nb) { if (ui.folder === nb.id && !hasOwn) ui.folder = sections[0].id; } // a notebook opens on its first section
    else if (!sections.some((f) => f.id === ui.rootTab) && !(ui.rootTab === null && hasOwn)) ui.rootTab = hasOwn ? null : sections[0]?.id ?? null;
    const current = sectionsOpen();
    enterIfMoved(box);
    const cur = current ? items.find((i) => i.id === current) : null;
    renderCrumbs();

    const tabs = el("div", "sec-tabs");
    tabs.style.setProperty("--c", colourOf(cur ?? nb));
    const open = (id: string | null) => (nb ? openFolder(id) : (ui.rootTab = id, renderLibrary())); // at All notes a tab only switches; inside a notebook it opens the section
    const tab = (f: LibraryItem | null, label: string) => {
      const id = f?.id ?? null;
      const b = el("button", `sec-tab${id === current ? " active" : ""}`);
      b.style.setProperty("--c", colourOf(f));
      b.appendChild(el("span", "", label));
      b.addEventListener("click", () => open(id));
      dropTarget(b, id);
      if (f && id === current && id !== home) { // the open section's (or notebook's) own menu
        const m = el("span", "sec-menu");
        m.dataset.pop = "1";
        m.innerHTML = '<i data-icon="chevron"></i>';
        m.addEventListener("click", (e) => {
          e.stopPropagation();
          openPopover(m, (root) => root.append(
            ...(nb ? [] : [popItem("Open notebook", "folder", () => openFolder(f.id))]),
            popItem("Rename", "pen", () => renameItem(f)),
            popItem("Colour…", "sliders", () => pickColor(f, m)),
            popItem("Move to…", "folder", () => void moveItemTo(f)),
            popItem("Move to trash", "trash", () => setTrashed(f, true), { danger: true })
          ));
        });
        b.appendChild(m);
      }
      return b;
    };
    if (hasOwn) tabs.appendChild(tab(nb, nb ? nb.title : "Quick Notes"));
    for (const f of sections) tabs.appendChild(tab(f, f.title));
    const add = el("button", "sec-tab add", nb ? "+ Section" : "+ Notebook");
    add.title = nb ? "Add a section to this notebook" : "Add a notebook";
    add.addEventListener("click", () => void createNote("notebook", home));
    tabs.appendChild(add);
    box.appendChild(tabs);

    const list = el("div", "page-list");
    const pages = () => sectionPages(current).filter((i) => !isFolder(i));
    for (const f of (current ? liveIn(current) : []).filter(isFolder).sort(byPlace)) { // notebooks inside a section open as a grid
      const r = el("div", "page-row folder");
      r.innerHTML = '<div class="pr-thumb"><i data-icon="folder"></i></div>';
      const t = el("div"); t.append(el("div", "pr-title", f.title), el("div", "pr-date", `${noteCount(items, f.id)} notes`));
      r.appendChild(t);
      r.addEventListener("click", () => openFolder(f.id));
      dropTarget(r, f.id);
      selectable(r, f);
      list.appendChild(r);
    }
    for (const p of pages().sort(byPlace)) {
      const r = el("div", "page-row");
      const th = el("div", "pr-thumb");
      if (p.thumb) { const img = el("img"); img.src = p.thumb; img.alt = ""; img.draggable = false; th.appendChild(img); }
      const t = el("div"); t.append(el("div", "pr-title", p.title), el("div", "pr-date", fmtDate(p.modified)));
      const menu = el("button");
      menu.dataset.pop = "1";
      menu.title = "More";
      menu.innerHTML = '<i data-icon="more"></i>';
      menu.addEventListener("click", (e) => { e.stopPropagation(); noteMenu(p, menu, pages()); });
      r.append(th, t, menu);
      r.addEventListener("click", () => openItem(p.id));
      reorderable(r, p, pages);
      selectable(r, p);
      list.appendChild(r);
    }
    if (!list.children.length) list.appendChild(el("div", "empty-state", "No pages yet."));
    // Notebook > Section > Pages: in a section you add pages; on a notebook's own tab you add a section; Quick Notes takes a quick note
    const atNotebookTop = !!nb && current === nb.id;
    const newPage = el("button", "btn page-add", atNotebookTop ? "+ Section" : current === null ? "+ Quick note" : "+ Page");
    newPage.addEventListener("click", () => (atNotebookTop ? void createNote("notebook", home) : newNote(lastFormat(), "pages", current))); // a page: straight in, in the last page format, like OneNote
    box.append(list, newPage);
    [...list.children].forEach((c, i) => (c as HTMLElement).style.setProperty("--i", String(Math.min(i, 12))));
    hydrateIcons(box);
  }

  // ---------- the page rail beside the editor: the other pages of the open note's notebook or section
  const railOn = () => pref.get("sn.rail", "1") === "1";
  $("btn-pages").addEventListener("click", () => { pref.set("sn.rail", railOn() ? "0" : "1"); renderRail(); });
  function renderRail() {
    const rail = $("page-rail"), btn = $("btn-pages");
    const parent = active && active.item.parentId ? items.find((i) => i.id === active!.item.parentId && isFolder(i) && !i.trashed) : undefined;
    btn.classList.toggle("hidden", !parent);
    btn.classList.toggle("on", !!parent && railOn());
    setShown(rail, !!parent && railOn());
    if (!parent || !railOn()) return;
    // the whole notebook: its own pages first, then each section (and deeper notebook) as a heading with its pages
    const nb = rootNotebookOf(items, parent.id).root ?? parent;
    const notesIn = (folderId: string) => {
      const l = items.filter((i) => !i.trashed && !isFolder(i) && i.parentId === folderId);
      for (const t of sessions) if (t.item.parentId === folderId && !l.some((i) => i.id === t.item.id)) l.push(t.item); // pages open in tabs but not saved yet
      return l;
    };
    const groups: { folder: LibraryItem; depth: number }[] = [{ folder: nb, depth: 0 }];
    const walk = (id: string, depth: number) => { for (const f of items.filter((i) => isFolder(i) && !i.trashed && i.parentId === id).sort(byPlace)) { groups.push({ folder: f, depth }); walk(f.id, depth + 1); } };
    walk(nb.id, 1);
    rail.innerHTML = "";
    rail.style.setProperty("--c", colourOf(nb));
    const head = el("div", "rail-head");
    head.append(el("span", "", nb.title));
    const close = el("button", "icon-btn");
    close.title = "Hide pages";
    close.innerHTML = '<i data-icon="close"></i>';
    close.addEventListener("click", () => { pref.set("sn.rail", "0"); renderRail(); });
    head.appendChild(close);
    const list = el("div", "rail-list");
    for (const { folder, depth } of groups) {
      const pages = notesIn(folder.id);
      if (depth > 0) {
        const h = el("div", "rail-group", folder.title);
        h.style.setProperty("--c", colourOf(folder));
        h.style.paddingLeft = `${4 + (depth - 1) * 12}px`;
        list.appendChild(h);
      } else if (!pages.length) continue;
      for (const p of pages.sort(byPlace)) {
        const b = el("button", `rail-item${p.id === active!.item.id ? " current" : ""}`);
        b.style.paddingLeft = `${10 + Math.max(0, depth - 1) * 12}px`;
        b.append(el("b", "", p.title), el("small", "", fmtDate(p.modified)));
        b.addEventListener("click", () => { if (p.id !== active?.item.id) void openItem(p.id); });
        if (items.some((i) => i.id === p.id)) reorderable(b, p, () => notesIn(folder.id).filter((x) => items.some((i) => i.id === x.id))); // an unsaved page can't be reordered yet
        list.appendChild(b);
      }
      if (depth > 0 && !pages.length) list.appendChild(el("div", "rail-empty", "No pages"));
    }
    rail.append(head, list);
    if (parent.id !== nb.id || viewOf(nb) !== "sections") { // in the sections view pages belong in sections, not on the notebook itself
      const add = el("button", "btn btn-sm rail-add", "+ Page");
      add.title = `New page in ${parent.title}`;
      add.addEventListener("click", () => { ui.folder = parent.id; newNote(lastFormat(), "pages"); });
      rail.append(add);
    }
    hydrateIcons(rail);
  }


  const duplicateItem = (item: LibraryItem) => duplicateMany([item]);
  async function duplicateMany(picked: LibraryItem[]) {
    let n = 0;
    for (const item of picked.filter((i) => !isFolder(i))) {
      const bytes = await library.getBytes(item.id);
      if (!bytes) continue;
      const now = Date.now(), id = crypto.randomUUID();
      await library.put(
        { ...item, id, title: `${item.title} copy`, created: now, modified: now, order: undefined, driveId: undefined, syncId: undefined, syncRemote: undefined, syncLocal: undefined, syncParent: undefined },
        bytes
      );
      const pdfText = await library.getPdfText(item.id).catch(() => undefined);
      if (pdfText) await library.putPdfText(id, pdfText); // the copy of a PDF stays searchable
      n++;
    }
    await refreshLibrary();
    if (n > 1) showToast(`${n} notes duplicated`, "info");
    scheduleSync();
    return n > 0;
  }

  /** Several notes download as one .zip (one Save-as on Android, one file on the desktop), each note under its own name. */
  async function downloadMany(picked: LibraryItem[]) {
    const notes = picked.filter((i) => !isFolder(i));
    if (notes.length === 1) { await downloadItem(notes[0]); return true; }
    if (!notes.length) return false;
    const zip = new JSZip(), used = new Set<string>();
    for (const item of notes) {
      const s = sessions.find((x) => x.item.id === item.id);
      if (s) await saveSession(s);
      const bytes = await library.getBytes(item.id);
      if (!bytes) continue;
      let name = `${safeFileName(item.title)}.note`;
      for (let k = 2; used.has(name); k++) name = `${safeFileName(item.title)} (${k}).note`;
      used.add(name);
      zip.file(name, bytes);
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), `REA-StarNote ${notes.length} notes.zip`);
    showToast(`Saving ${notes.length} notes as one .zip…`, "info");
    return true;
  }

  async function downloadItem(item: LibraryItem) {
    const s = sessions.find((x) => x.item.id === item.id);
    if (s) await saveSession(s);
    const bytes = await library.getBytes(item.id);
    if (bytes) {
      downloadBlob(new Blob([bytes as any], { type: "application/octet-stream" }), `${item.title}.note`);
      showToast(`Saving "${item.title}.note" to your Downloads folder…`, "info"); // desktop webviews download silently
    }
  }

  // ============================================================ import
  async function importBuffer(filename: string, buf: ArrayBuffer, driveId?: string, extra?: { title?: string; zotero?: LibraryItem["zotero"]; parentId?: string | null }): Promise<LibraryItem> {
    const now = Date.now();
    const parentId = (extra && "parentId" in extra ? extra.parentId : ui.folder) ?? undefined; // a synced file lands in its Drive folder's notebook, anything else in the one on screen
    const id = crypto.randomUUID();
    if (filename.toLowerCase().endsWith(".pdf")) {
      showToast(`Rendering "${filename}"...`, "info");
      const pdf = await loadPdfDocument(buf, filename, 2100);
      const doc = convertPdfToStarNoteDocument(pdf);
      const bytes = await exportStarNoteArchive(doc, []);
      const item: LibraryItem = { id, title: extra?.title ?? baseName(filename), kind: "pdf", created: now, modified: now, trashed: false, parentId, thumb: renderThumbnail(doc), zotero: extra?.zotero };
      await library.put(item, bytes);
      if (pdf.pages.some((p) => p.text.length)) await library.putPdfText(id, Object.fromEntries(pdf.pages.map((p, i) => [`Page[${i}-0]`, p.text]))); // same tags as convertPdfToStarNoteDocument
      return item;
    }
    let doc: StarNoteDocument;
    try {
      doc = await loadStarNoteArchive(buf); // validates before anything is stored
    } catch (e: any) {
      console.error(e);
      throw new Error("not a valid StarNote (.note) file");
    }
    // The file name names the note: StarNote itself saves "<title>.note", and many files share one embedded title.
    const title = baseName(filename);
    const item: LibraryItem = { id, title, kind: "note", created: now, modified: now, trashed: false, driveId, parentId, thumb: renderThumbnail(doc) };
    await library.put(item, new Uint8Array(buf)); // keep the original bytes untouched
    return item;
  }

  async function importFiles(files: FileList | File[]) {
    let last: LibraryItem | null = null;
    let n = 0;
    for (const f of Array.from(files)) {
      try {
        last = await importBuffer(f.name, await f.arrayBuffer());
        n++;
      } catch (err: any) {
        showToast(`Could not import ${f.name}: ${err.message}`, "error");
        console.error(err);
      }
    }
    if (n === 0) return;
    await refreshLibrary();
    scheduleSync();
    if (n === 1 && last) await openItem(last.id);
    else showToast(`Imported ${n} files`, "success");
  }

  const fileInput = $<HTMLInputElement>("note-file-input");
  $("btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    if (fileInput.files?.length) await importFiles(fileInput.files);
    fileInput.value = ""; // re-selecting the same file must fire change again
  });
  for (const zone of [$("lib-main"), $("canvas-container")]) {
    zone.addEventListener("dragover", (e) => { if (dragId) return; e.preventDefault(); zone.classList.add("drag"); }); // a card moved inside the library is not a file drop
    zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drag");
      if (e.dataTransfer?.files?.length) await importFiles(e.dataTransfer.files);
    });
  }

  // ============================================================ sessions & editor
  const inEditor = () => !$("view-editor").classList.contains("hidden");

  function pendingStrokes(s: Session) {
    return shownIn(s)?.getUserStrokes() ?? s.view?.strokes ?? [];
  }
  const erasedSaved = (s: Session) => s.doc.removedStrokes ?? []; // erased strokes the archive still holds
  const textChanged = (s: Session) => (s.doc.addedTextBoxes?.length ?? 0) + (s.doc.removedTextBoxes?.length ?? 0) > 0;
  const pagesChanged = (s: Session) => !!s.doc.pagesChanged || (s.doc.removedPages?.length ?? 0) > 0;
  const isDirty = (s: Session) => pendingStrokes(s).length > 0 || erasedSaved(s).length > 0 || textChanged(s) || pagesChanged(s);

  function showView(name: "library" | "editor") {
    $("view-library").classList.toggle("hidden", name !== "library");
    $("view-editor").classList.toggle("hidden", name !== "editor");
    if (name === "editor") renderer.resize();
  }

  function park() {
    commitInline();
    void commitTextEditor(true);
    if (active) active.view = renderer.snapshot();
  }

  function newNote(format: PageFormat = DEFAULT_FORMAT, kind: NoteKind = "pages", parent: string | null = ui.folder) {
    const now = Date.now();
    const doc: StarNoteDocument = { uuid: crypto.randomUUID(), title: "Untitled note", tiles: new Map(), layout: "stack" };
    if (kind === "infinite") { // free-form tiles that appear wherever you write
      delete doc.layout;
      doc.infinite = { template: format.template, spacing: format.spacing ?? DEFAULT_SPACING };
      doc.tiles.set("Page[0-0]", newCanvasTile("Page[0-0]", doc.infinite.template, doc.infinite.spacing));
    } else {
      doc.tiles.set("Page[0-0]", newPageTile("Page[0-0]", format));
      relayout(doc);
    }
    const item: LibraryItem = { id: crypto.randomUUID(), title: "Untitled note", kind: "note", created: now, modified: now, trashed: false, parentId: parent ?? undefined };
    const s: Session = { item, doc, view: null, isNew: true, saving: null, inFlight: 0 };
    sessions.push(s);
    activate(s);
  }

  async function openItem(id: string) {
    const existing = sessions.find((s) => s.item.id === id);
    if (existing) { activate(existing); return; }
    const item = items.find((i) => i.id === id);
    if (!item) return;
    try {
      const bytes = await library.getBytes(id);
      if (!bytes) throw new Error("note data is missing");
      const doc = await loadStarNoteArchive(toBuffer(bytes));
      const s: Session = { item, doc, view: null, isNew: false, saving: null, inFlight: 0 };
      sessions.push(s);
      activate(s);
    } catch (err: any) {
      showToast(`Could not open "${item.title}": ${err.message}`, "error");
      console.error(err);
    }
  }

  // ---------- split view: two halves, each its own renderer (pages, zoom, undo); the toolbar and keys act on the focused half
  const panes: { r: CanvasRenderer | null; s: Session | null; el: HTMLElement }[] = [{ r: renderer, s: null, el: $("pane-0") }, { r: null, s: null, el: $("pane-1") }];
  let focus = 0, split = false;
  if ((window as any).__starnote) Object.assign((window as any).__starnote, { panes, sessions }); // tests
  /** The renderer showing a session right now, or null when it is parked in a tab. */
  const shownIn = (s: Session) => panes.find((p, i) => p.s === s && (i === focus || split))?.r ?? null;
  const TOOL_FIELDS = ["activeTool", "penType", "penColor", "penWidth", "stylusOnly", "eraserReach", "shapeKind", "smoothLevel", "pressureSensitivity", "eInkMode"] as const;
  const HOOKS = ["onChange", "onZoomChange", "onRender", "onTextRequest", "onSelectionChange", "onClipboardChange", "onPen", "onNotice"] as const;
  function focusPane(i: number) {
    if (i === focus || !panes[i].r) return;
    commitInline(); void commitTextEditor(true); // text being typed belongs to the half it was typed in
    if (findOpen()) closeFind(); // its marks belong to the other half
    const from = panes[focus].r!, to = panes[i].r!;
    for (const k of TOOL_FIELDS) (to as any)[k] = (from as any)[k]; // one toolbar: the same pen in both halves
    if (from.hasSelection()) { from.clearSelection(); from.render(); }
    focus = i; renderer = to; active = panes[i].s;
    panes.forEach((p, j) => p.el.classList.toggle("focused", split && j === focus));
    resetFit(); renderEditorChrome(); renderTabs(); renderToolOptions();
  }
  function setSplit(on: boolean) {
    if (on === split) return;
    if (!on) {
      focusPane(0);
      const p = panes[1];
      if (p.s && p.r) p.s.view = p.r.snapshot(); // parked in its tab, as if it had been switched away from
      p.s = null;
    } else if (!panes[1].r) {
      const r = new CanvasRenderer($<HTMLCanvasElement>("note-canvas-2"));
      for (const k of HOOKS) (r as any)[k] = (renderer as any)[k];
      panes[1].r = r;
      panes[1].el.addEventListener("pointerdown", () => focusPane(1), { capture: true }); // focus first, then the pen acts there
      panes[0].el.addEventListener("pointerdown", () => focusPane(0), { capture: true });
    }
    split = on;
    panes[1].el.classList.toggle("hidden", !on);
    $("panes").classList.toggle("split", on);
    $("btn-split").classList.toggle("on", on);
    panes.forEach((p, j) => p.el.classList.toggle("focused", on && j === focus));
    requestAnimationFrame(() => panes.forEach((p, j) => { if (p.r && (j === 0 || on)) { p.r.resize(); if (p.s) p.r.fit("width"); } })); // each half fits its new width
    renderTabs();
  }
  /** Split on: choose what the other half shows (another open note, or a recent one from the library). */
  $("btn-split").addEventListener("click", (e) => {
    if (split) { setSplit(false); return; }
    const anchor = e.currentTarget as HTMLElement;
    const open = sessions.filter((t) => t !== active);
    const recent = items.filter((i) => !isFolder(i) && !i.trashed && !sessions.some((t) => t.item.id === i.id)).sort((a, b) => b.modified - a.modified).slice(0, 8);
    if (!open.length && !recent.length) { showToast("Open or create a second note first", "info"); return; }
    const show = (go: () => void) => { closePopover(); setSplit(true); focusPane(1); go(); };
    openPopover(anchor, (root) => {
      root.append(el("div", "pop-title", "Show beside it"));
      for (const t of open) root.appendChild(popItem(t.item.title, "notes", () => show(() => activate(t))));
      if (open.length && recent.length) root.append(el("div", "pop-sep"));
      for (const i of recent) root.appendChild(popItem(i.title, i.kind === "pdf" ? "pages" : "notes", () => show(() => void openItem(i.id))));
    });
  });

  function activate(s: Session) {
    const there = split ? panes.findIndex((p, i) => i !== focus && p.s === s) : -1;
    if (there >= 0) { focusPane(there); return; }
    if (active && active !== s) park();
    active = s;
    panes[focus].s = s;
    showView("editor");
    if (s.view) renderer.restore(s.view);
    else {
      renderer.setDocument(s.doc);
      renderer.fit("width");
    }
    resetFit();
    if (findOpen()) closeFind(); // its marks belong to the note it searched
    s.view = null;
    renderEditorChrome();
    renderTabs();
  }

  async function leaveToLibrary() {
    if (split) setSplit(false); // the library is one view; the other half's note stays open in its tab
    if (active) {
      const s = active;
      park();
      if (s.isNew && !isDirty(s)) { // a note nobody wrote on is not kept: no card, and no stale tab
        sessions.splice(sessions.indexOf(s), 1);
        active = null;
        renderTabs();
      } else await saveSession(s);
    }
    await Promise.all(sessions.filter((t) => t !== active && isDirty(t)).map((t) => saveSession(t))); // pages written in other tabs show up in the library too
    showView("library");
    await refreshLibrary();
  }

  async function closeSession(s: Session | undefined, silent = false) {
    if (!s) return;
    if (split && panes.some((p) => p.s === s)) setSplit(false); // closing a note on screen ends the split first
    if (s === active) park();
    if (!silent && !(s.isNew && !isDirty(s))) await saveSession(s);
    const i = sessions.indexOf(s);
    sessions.splice(i, 1);
    if (s !== active) { renderTabs(); await refreshLibrary(); return; }
    active = null;
    const next = sessions[Math.min(i, sessions.length - 1)];
    if (next) activate(next);
    else { showView("library"); await refreshLibrary(); }
  }

  /** Writes the note (including strokes drawn since the last save) into the library. */
  /** `auto`: the background save leaves text/formula that is still being typed alone (it saves what is already committed). */
  function saveSession(s: Session, auto = false): Promise<void> {
    if (s === active && !auto) commitInline(); // text still being typed goes in first
    const p = (s.saving ?? Promise.resolve()).then(async () => {
      if (s === active && te.open && !auto) await commitTextEditor(true);
      const pending = [...pendingStrokes(s)];
      const erased = [...erasedSaved(s)];
      if (s.isNew && pending.length === 0 && !textChanged(s) && !pagesChanged(s)) return; // untouched new note: nothing to keep
      if (!s.isNew && pending.length === 0 && erased.length === 0 && !textChanged(s) && !pagesChanged(s) && s.item.thumb) return; // unchanged
      setSaveState("saving");
      try {
        const bytes = await exportStarNoteArchive(s.doc, pending);
        const r = shownIn(s);
        if (r) {
          r.markSaved(pending, erased);
          if (s.view) s.view = r.snapshot(); // parked just before this save (leaving the editor): markSaved made new lists, so the old snapshot would bring the saved strokes back as unsaved ones
        } else if (s.view) s.view = { ...s.view, strokes: s.view.strokes.filter((x) => !pending.includes(x)), undoStack: [], redoStack: [] };
        const fields = { modified: Date.now(), thumb: renderThumbnail(s.doc) };
        if (s.isNew || !(await library.update(s.item.id, fields, bytes))) {
          s.item = { ...s.item, ...fields };
          await library.put(s.item, bytes);
        } else {
          s.item = (await library.get(s.item.id)) ?? { ...s.item, ...fields }; // pick up sync bookkeeping
        }
        s.isNew = false;
        scheduleSync();
      } catch (err: any) {
        showToast(`Save failed: ${err.message}`, "error");
        console.error(err);
      } finally {
        renderEditorChrome();
        renderTabs();
      }
    });
    s.saving = p;
    s.inFlight++;
    p.then(() => s.inFlight--, () => s.inFlight--);
    return p;
  }

  // ---------- editor chrome
  function setSaveState(state: "saved" | "dirty" | "saving") {
    const b = $("save-state");
    b.className = `save-state ${state === "saved" ? "" : state}`;
    b.innerHTML = `<i data-icon="${state === "saved" ? "check" : state === "dirty" ? "dot" : "spin"}"></i>`;
    b.title = state === "saved" ? "Saved to library" : state === "dirty" ? "Unsaved strokes — click to save" : "Saving…";
    hydrateIcons(b);
  }

  function renderEditorChrome() {
    if (!active) return;
    $("doc-title").textContent = active.item.title;
    setSaveState(isDirty(active) ? "dirty" : "saved");
    $<HTMLButtonElement>("tool-undo").disabled = !renderer.canUndo();
    $<HTMLButtonElement>("tool-redo").disabled = !renderer.canRedo();
    renderRail();
    renderPagePanel();
  }

  const seenTabs = new Set<string>(); // tabs already shown: only a newly opened one animates
  function renderTabs() {
    const wrap = $("tabs");
    wrap.innerHTML = "";
    for (const s of sessions) {
      const t = el("div", `tab${s === active ? " active" : split && panes.some((p) => p.s === s) ? " shown" : ""}${seenTabs.has(s.item.id) ? "" : " enter"}`);
      seenTabs.add(s.item.id);
      if (isDirty(s)) t.appendChild(el("i", "tab-dirty"));
      t.appendChild(el("span", "", s.item.title));
      const x = el("button");
      x.title = "Close";
      x.innerHTML = '<i data-icon="close"></i>';
      x.addEventListener("click", (e) => { e.stopPropagation(); closeSession(s); });
      t.appendChild(x);
      t.addEventListener("click", () => s !== active && activate(s));
      wrap.appendChild(t);
    }
    hydrateIcons(wrap);
  }

  $("doc-title").addEventListener("click", (e) => { // the tab bar is hidden on a wide phone: the title lists the open notes
    openPopover(e.currentTarget as HTMLElement, (root) => {
      root.append(el("div", "pop-title", "Open notes"));
      for (const s of sessions) root.appendChild(popItem(s.item.title, "notes", () => { closePopover(); if (s !== active) activate(s); }, { checked: s === active }));
      root.appendChild(el("div", "pop-sep"));
      root.appendChild(popItem("New note", "plus", () => { closePopover(); newNote(lastFormat()); }));
    });
  });
  $("canvas-container").addEventListener("pointerdown", () => { if (optionsOpen && !renderer.hasSelection()) { optionsOpen = false; renderToolOptions(); } }, true); // a flyout must not sit on the page while you draw

  // Autosave: a few seconds after the last change the work is written to the library, so closing the app loses next to nothing
  let autosaveTimer = 0;
  const AUTOSAVE_MS = 4000;
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      if (!active || !isDirty(active)) return;
      if (renderer.isBusy() || renderer.hasSelection()) { scheduleAutosave(); return; } // not in the middle of a gesture or with a selection held
      void saveSession(active, true);
    }, AUTOSAVE_MS);
  }
  // Palm rejection: on by default on devices with a pen (from the first pen stroke), so a finger only pans there; a device
  // that never saw a pen keeps drawing with touch. Choosing it in Touch & pen wins and is kept.
  renderer.stylusOnly = pref.get("sn.stylus", "") ? pref.get("sn.stylus", "") === "1" : pref.get("sn.penseen", "") === "1";
  renderer.onPen = () => {
    if (pref.get("sn.penseen", "") === "1") return;
    pref.set("sn.penseen", "1");
    if (!pref.get("sn.stylus", "")) renderer.stylusOnly = true;
  };
  renderer.onChange = () => {
    if (!active) return;
    renderEditorChrome();
    renderTabs();
    if (isDirty(active)) scheduleAutosave();
  };
  renderer.onZoomChange = (z) => { $("zoom-level").textContent = `${Math.round(z * 100)}%`; };
  let lastPageLabel = "";
  renderer.onRender = () => {
    const { index, total } = renderer.pageInfo();
    const label = `${index + 1} / ${total}`;
    if (label !== lastPageLabel) { lastPageLabel = label; $("page-label").textContent = label; resetFit(); }
    if (panelOn() && inEditor() && `${index}/${total}` !== panelAt) renderPagePanel();
    $("pagenav").classList.toggle("hidden", renderer.isInfinite());
    $("add-page-pill").classList.toggle("hidden", !(renderer.isStack() && renderer.endOfNoteVisible() && inEditor()));
  };

  // ---------- editor wiring
  $("btn-back").addEventListener("click", leaveToLibrary);
  $("btn-new-tab").addEventListener("click", () => newNote(lastFormat(), lastKind())); // the "+" tab: a new note in the last-used format, no dialog
  $("save-state").addEventListener("click", async () => { if (active) { await saveSession(active); showToast("Saved", "success"); } });
  $("tool-undo").addEventListener("click", () => renderer.undo());
  $("tool-redo").addEventListener("click", () => renderer.redo());
  // one Fit button: it shows the next fit (height first, then width, alternating); a new note or page starts at height again
  let fitNext: "height" | "width" = "height";
  function resetFit(next: "height" | "width" = "height") {
    fitNext = next;
    const b = $("btn-fit");
    b.title = next === "height" ? "Fit page height" : "Fit page width";
    b.innerHTML = `<i data-icon="${next === "height" ? "fith" : "fitw"}"></i>`;
    hydrateIcons(b);
  }
  $("btn-fit").addEventListener("click", () => { renderer.fit(fitNext); resetFit(fitNext === "height" ? "width" : "height"); });
  $("page-prev").addEventListener("click", () => renderer.gotoPage(-1));
  $("page-next").addEventListener("click", () => renderer.gotoPage(1));

  type Tool = "pen" | "eraser" | "pan" | "lasso" | "shape" | "text";
  const TOOLS: Tool[] = ["pen", "eraser", "lasso", "shape", "text", "pan"];

  // ----- colors: pen and highlighter each keep their own current color and their own 4 quick colors, in the order the user set
  const penColors = { ink: pref.get("sn.ink", "#000000"), hl: pref.get("sn.hl", penById("highlighter").color!) };
  type Kind = "ink" | "hl";
  const QUICK_COLORS = 4;
  const DEFAULT_COLORS: Record<Kind, string[]> = { ink: ["#000000", "#b33333", "#2f4fd0", "#0b8a5f"], hl: ["#f5d742", "#7ee081", "#ff9ecb", "#7cc4ff"] };
  const colorOrder: Record<Kind, string[]> = { ink: [...DEFAULT_COLORS.ink], hl: [...DEFAULT_COLORS.hl] };
  try {
    const saved = JSON.parse(pref.get("sn.colorOrder", "{}"));
    for (const k of ["ink", "hl"] as const) if (Array.isArray(saved[k])) colorOrder[k] = [...new Set<string>([...saved[k], ...DEFAULT_COLORS[k]])].slice(0, QUICK_COLORS);
  } catch { /* defaults */ }
  const saveColorOrder = () => pref.set("sn.colorOrder", JSON.stringify(colorOrder));
  const isHighlighter = () => renderer.penType.alpha < 1;
  const applyPenColor = () => {
    renderer.penColor = isHighlighter() ? penColors.hl : penColors.ink;
    $("tool-pen").style.setProperty("--pen-color", renderer.penColor);
  };
  /** The pen button shows the pen type in use. */
  function syncPenButton() {
    const icon = $("tool-pen").querySelector("i")!;
    icon.dataset.icon = renderer.penType.id;
    icon.innerHTML = "";
    hydrateIcons($("tool-pen"));
    $("tool-pen").title = `${renderer.penType.label}. Tap again to show or hide its colors and sizes`;
  }

  // ----- the choices of the tool in use, as a popover under (or, on a wide phone, beside) its button
  const optBox = $("tool-options");
  let optionsOpen = false;
  const compact = window.matchMedia("(orientation: landscape) and (max-height: 520px)"); // wide phone: tools are a rail on the left
  const group = (label?: string) => { const g = el("div", "opt-group"); if (label) g.appendChild(el("span", "opt-label", label)); optBox.appendChild(g); return g; };
  const chipButton = (parent: HTMLElement, label: string, active: boolean, run: () => void, extra = "") => {
    const b = el("button", `opt-chip${active ? " active" : ""} ${extra}`.trim(), label);
    b.addEventListener("click", run);
    parent.appendChild(b);
  };
  function chooseColor(color: string) {
    color = color.toLowerCase();
    if (renderer.hasSelection()) { renderer.recolorSelection(color); return; }
    const tool = renderer.activeTool;
    const kind: Kind = (tool === "pen" || tool === "shape") && isHighlighter() ? "hl" : "ink";
    penColors[kind] = color;
    if (inl.on) { inl.color = color; renderer.updateTextDraft({ color }); }
    pref.set(kind === "hl" ? "sn.hl" : "sn.ink", color);
    if (!colorOrder[kind].includes(color)) { colorOrder[kind][QUICK_COLORS - 1] = color; saveColorOrder(); } // a new color takes the last slot
    applyPenColor();
    renderToolOptions();
  }
  let swatchDragged = false;
  /** Drag a color swatch sideways to a new place; the order is kept for that pen kind. */
  function dragSwatch(e: PointerEvent, b: HTMLElement, index: number, all: HTMLElement[], kind: Kind) {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const centers = all.map((s) => { const r = s.getBoundingClientRect(); return r.left + r.width / 2; });
    let dragging = false;
    b.setPointerCapture(e.pointerId); // from the press on, so a quick sideways move is not lost when the pointer leaves the swatch
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!dragging && Math.abs(dx) > 8) { dragging = true; b.classList.add("dragging"); }
      if (dragging) b.style.transform = `translateX(${dx}px)`;
    };
    const up = (ev: PointerEvent) => {
      b.removeEventListener("pointermove", move);
      b.removeEventListener("pointerup", up);
      b.removeEventListener("pointercancel", up);
      if (!dragging) return;
      swatchDragged = true; // the click that follows the drop must not pick the color
      setTimeout(() => (swatchDragged = false), 0);
      const here = centers[index] + (ev.clientX - x0);
      let to = 0;
      centers.forEach((c, i) => { if (Math.abs(c - here) < Math.abs(centers[to] - here)) to = i; });
      if (to !== index) {
        const next = [...colorOrder[kind]];
        next.splice(to, 0, ...next.splice(index, 1));
        colorOrder[kind] = next;
        saveColorOrder();
      }
      renderToolOptions();
    };
    b.addEventListener("pointermove", move);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
  }

  function positionOptions(anchor: HTMLElement) {
    const host = $("view-editor").getBoundingClientRect(), a = anchor.getBoundingClientRect();
    const w = optBox.offsetWidth, h = optBox.offsetHeight;
    const left = compact.matches ? a.right - host.left + 6 : a.left - host.left;
    const top = compact.matches ? a.top - host.top - 4 : a.bottom - host.top + 6;
    optBox.style.left = `${Math.max(8, Math.min(left, host.width - w - 8))}px`;
    optBox.style.top = `${Math.max(8, Math.min(top, host.height - h - 8))}px`;
  }

  function renderToolOptions() {
    const tool = renderer.activeTool, sel = renderer.hasSelection();
    optBox.innerHTML = "";
    const colorsWanted = sel || tool === "pen" || tool === "shape" || tool === "text";
    const open = sel || (optionsOpen && (colorsWanted || tool === "eraser"));
    setShown(optBox, open);
    if (!open) return;
    if (sel) group().appendChild(el("span", "opt-label", "Selection: pick a color or size to change it"));
    if (!sel && tool === "pen") {
      const g = group();
      for (const k of PEN_KINDS) {
        const b = el("button", `icon-btn tool${renderer.penType.id === k.id ? " active" : ""}`);
        b.title = k.label;
        b.setAttribute("aria-label", k.label);
        b.innerHTML = `<i data-icon="${k.id}"></i>`;
        b.addEventListener("click", () => setPenType(k.id));
        longPressName(b, k.label);
        g.appendChild(b);
      }
      hydrateIcons(g);
    }
    if (!sel && tool === "shape") {
      const g = group("Shape");
      for (const k of SHAPE_KINDS) chipButton(g, k.label, renderer.shapeKind === k.id, () => setShapeKind(k.id));
    }
    if (!sel && tool === "text") {
      const g = group("Text");
      chipButton(g, "A−", false, () => styleText({ size: Math.max(20, inl.size - 8) }));
      chipButton(g, "A+", false, () => styleText({ size: Math.min(160, inl.size + 8) }));
      chipButton(g, "B", inl.bold, () => styleText({ bold: !inl.bold }));
      chipButton(g, "I", inl.italic, () => styleText({ italic: !inl.italic }));
      chipButton(group(), "Math", inl.pendingMath, () => { inl.pendingMath = !inl.pendingMath; if (inl.pendingMath) showToast("Tap the page where the formula goes", "info"); renderToolOptions(); });
      if (inl.on && inl.box) chipButton(group(), "Delete text", false, () => { ghost.value = ""; commitInline(); }, "danger");
    }
    if (!sel && tool === "eraser") {
      const g = group("Eraser size");
      for (const [label, px] of [["Small", 8], ["Medium", 14], ["Large", 30]] as const) chipButton(g, label, renderer.eraserReach === px, () => { renderer.eraserReach = px; pref.set("sn.eraser", String(px)); renderToolOptions(); });
      chipButton(group(), "Clear page", false, clearCurrentPage, "danger");
      group().appendChild(el("span", "opt-label", "or double-tap the eraser"));
    }
    if (colorsWanted) {
      const kind: Kind = !sel && (tool === "pen" || tool === "shape") && isHighlighter() ? "hl" : "ink";
      const g = group(sel ? undefined : kind === "hl" ? "Highlighter colors" : "Colors");
      g.classList.add("swatches");
      const current = (kind === "hl" ? penColors.hl : penColors.ink).toLowerCase();
      const buttons: HTMLElement[] = [];
      colorOrder[kind].forEach((c, i) => {
        const b = el("button", `swatch${!sel && c === current ? " active" : ""}`);
        b.style.setProperty("--c", c);
        b.title = sel ? c : `${c} (drag to reorder)`;
        b.addEventListener("click", () => { if (!swatchDragged) chooseColor(c); });
        if (!sel) b.addEventListener("pointerdown", (e) => dragSwatch(e, b, i, buttons, kind));
        g.appendChild(b);
        buttons.push(b);
      });
    }
    if (sel || tool === "pen" || tool === "shape") {
      const g = group("Size");
      g.classList.add("widths");
      const scale = sel ? 1 : renderer.penType.widthScale;
      for (const [w, d] of [[2.5, 4], [3.5, 5], [5.9, 9], [10, 14], [16, 20]] as const) {
        const b = el("button", `wdot${!sel && Math.abs(renderer.penWidth - w) < 0.01 ? " active" : ""}`);
        b.title = ["Extra thin", "Thin", "Medium", "Thick", "Extra thick (marker)"][[2.5, 3.5, 5.9, 10, 16].indexOf(w)];
        const dot = document.createElement("i");
        dot.style.setProperty("--s", `${Math.min(24, Math.round(d * Math.sqrt(scale)))}px`);
        b.appendChild(dot);
        b.addEventListener("click", () => {
          if (renderer.hasSelection()) { renderer.resizeSelection(w); return; }
          renderer.penWidth = w;
          pref.set("sn.width", String(w));
          renderToolOptions();
        });
        g.appendChild(b);
      }
    }
    positionOptions(sel ? $("tool-lasso") : $(`tool-${tool}`));
  }

  // ----- pen settings: the less-used controls live in their own popover, opened from the small button next to the pen
  $("btn-pen-detail").dataset.pop = "1";
  $("btn-pen-detail").addEventListener("click", (e) => {
    const anchor = e.currentTarget as HTMLElement;
    optionsOpen = false;
    renderToolOptions();
    openPopover(anchor, (root) => {
      const hl = isHighlighter();
      root.append(el("div", "pop-title", `${renderer.penType.label} settings`));
      const row = el("div", "pop-row");
      row.appendChild(el("span", "", hl ? "Opacity" : "Pressure"));
      const range = el("input");
      range.type = "range";
      range.min = hl ? "15" : "0";
      range.max = hl ? "70" : "100";
      range.value = String(Math.round((hl ? renderer.penType.alpha : renderer.penType.sensitivity) * 100));
      range.setAttribute("aria-label", hl ? "Opacity" : "Pressure: steady to sensitive");
      range.addEventListener("input", () => {
        const v = Number(range.value) / 100;
        penSetting[renderer.penType.id] = v;
        pref.set(`sn.pen.${renderer.penType.id}`, String(v));
        renderer.penType = penFor(renderer.penType.id, v);
      });
      row.appendChild(range);
      root.appendChild(row);
      root.appendChild(el("div", "pop-hint", hl ? "from clear to solid" : "from steady (ballpoint, marker) to pressure-sensitive (fountain pen)"));
      const crow = el("label", "pop-row");
      crow.appendChild(el("span", "", "Custom color"));
      const color = el("input");
      color.type = "color";
      color.value = (hl ? penColors.hl : penColors.ink).toLowerCase();
      color.addEventListener("change", () => chooseColor(color.value));
      crow.appendChild(color);
      root.appendChild(crow);
    });
  });

  function clearCurrentPage() {
    const cleared = renderer.clearPage() > 0;
    showToast(cleared ? "Page cleared. Undo brings it back until the note autosaves." : "This page has no drawings.", cleared ? "success" : "info");
  }

  function setTool(tool: Tool) {
    const changed = renderer.activeTool !== tool;
    if (tool !== "text") { void commitTextEditor(true); commitInline(); inl.pendingMath = false; }
    renderer.activeTool = tool;
    if (tool !== "lasso" && renderer.hasSelection()) { renderer.clearSelection(); renderer.render(); }
    for (const t of TOOLS) $(`tool-${t}`).classList.toggle("active", t === tool);
    $("canvas-container").style.cursor = tool === "pan" ? "grab" : tool === "eraser" ? "cell" : "crosshair";
    if (changed) optionsOpen = true; // choosing a tool shows its options
    renderToolOptions();
  }
  let lastEraserTap = 0;
  for (const t of TOOLS) {
    $(`tool-${t}`).addEventListener("click", () => {
      if (t !== renderer.activeTool) { lastEraserTap = t === "eraser" ? Date.now() : 0; setTool(t); return; }
      if (t === "eraser" && Date.now() - lastEraserTap < 450) { lastEraserTap = 0; clearCurrentPage(); return; } // double tap
      lastEraserTap = t === "eraser" ? Date.now() : 0;
      optionsOpen = !optionsOpen; // tapping the tool in use shows or hides its options
      renderToolOptions();
    });
  }

  // ----- pen types and shapes
  const penSetting: Partial<Record<PenType["id"], number>> = {}; // pressure response (pen, brush) or opacity (highlighter) the user chose
  for (const k of PEN_KINDS) { const v = pref.get(`sn.pen.${k.id}`, ""); if (v !== "") penSetting[k.id] = Number(v); }
  /** A tiny tooltip for touch screens, where hovering doesn't exist: hold the button to see its name. */
  function longPressName(b: HTMLElement, name: string) {
    let t = 0;
    b.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") t = window.setTimeout(() => showToast(name, "info"), 450); });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => clearTimeout(t));
  }
  function setPenType(id: string) {
    renderer.penType = penFor(penById(id).id, penSetting[penById(id).id]);
    applyPenColor();
    syncPenButton();
    pref.set("sn.pen", id);
    setTool("pen");
    renderToolOptions();
  }
  function setShapeKind(kind: ShapeKind) {
    renderer.shapeKind = kind;
    pref.set("sn.shape", kind);
    setTool("shape");
    renderToolOptions();
  }
  // ---------- page format dialog
  const pmEl = $("page-modal");
  const lastFormat = (): PageFormat => {
    try { const f = JSON.parse(pref.get("sn.format", "")); if (f && f.w && f.h && TEMPLATES.some((t) => t.id === f.template)) return f; } catch { /* default */ }
    return DEFAULT_FORMAT;
  };
  const lastKind = (): NoteKind => { const k = pref.get("sn.kind", "pages"); return k === "infinite" ? k : "pages"; };
  type NewKind = NoteKind | "notebook"; // a notebook is not a note: choosing it makes a folder
  const KINDS: { id: NewKind; label: string; note: string }[] = [
    { id: "pages", label: "Pages", note: "Finite pages (A4, A5, ...), one under the other." },
    { id: "infinite", label: "Infinite", note: "No page edges: write anywhere and pan as far as you like." },
    { id: "notebook", label: "Notebook", note: "A folder that holds notes and other notebooks." },
  ];
  /** Shows the type / paper / orientation / style / spacing chooser. Resolves with the chosen format, or null when cancelled. */
  function askPageFormat(o: { title: string; ok: string; initial: PageFormat; scope?: boolean; sizeLocked?: boolean; kind?: NewKind }): Promise<{ format: PageFormat; all: boolean; kind: NewKind; name: string } | null> {
    return new Promise((resolve) => {
      const start = paperOf(o.initial.w, o.initial.h);
      const spacingId = SPACINGS.find((x) => Math.abs(x.v - (o.initial.spacing ?? NaN)) < 0.01)?.id ?? (o.kind ? "medium" : "keep"); // a new note starts at Medium; an older page's own spacing stays unless one is picked
      const st = { kind: (o.kind ?? "pages") as string, paper: start?.paper ?? "a4", orient: (start?.landscape ?? o.initial.w > o.initial.h) ? "landscape" : "portrait", template: o.initial.template as string, spacing: spacingId, scope: "this" };
      $("pm-kind-row").classList.toggle("hidden", !o.kind);
      $("pm-title").textContent = o.title;
      $("pm-ok").textContent = o.ok;
      $("pm-scope-row").classList.toggle("hidden", !o.scope);
      $("pm-note").classList.toggle("hidden", !o.sizeLocked);
      // each chooser: the box it fills, what it offers, and which field of `st` it sets (the style stays editable on a PDF page)
      const choosers: [string, { id: string; label: string }[], keyof typeof st][] = [
        ["pm-paper", PAPERS, "paper"], ["pm-orient", [{ id: "portrait", label: "Portrait" }, { id: "landscape", label: "Landscape" }], "orient"],
        ["pm-template", TEMPLATES, "template"], ["pm-scope", [{ id: "this", label: "This page" }, { id: "all", label: "All pages" }], "scope"],
        ["pm-kind", KINDS, "kind"], ["pm-spacing", SPACINGS, "spacing"],
      ];
      const spacing = () => SPACINGS.find((x) => x.id === st.spacing)?.v ?? o.initial.spacing ?? DEFAULT_SPACING;
      const fmt = (): PageFormat => (o.sizeLocked ? { ...o.initial, template: st.template as PageTemplate, spacing: spacing() } : pageFormat(st.paper, st.orient === "landscape", st.template as PageTemplate, spacing()));
      const paint = () => {
        for (const [id, , key] of choosers) {
          $(id).querySelectorAll<HTMLButtonElement>("button").forEach((b) => { b.classList.toggle("active", b.dataset.v === st[key]); b.disabled = !!o.sizeLocked && key !== "template" && key !== "scope"; });
        }
        const f = fmt(), pv = $("pm-preview"), line = "#dfe4ea", paged = st.kind === "pages";
        const book = st.kind === "notebook";
        $("pm-size-rows").classList.toggle("hidden", !paged);
        $("pm-style-rows").classList.toggle("hidden", book);
        $("pm-name-row").classList.toggle("hidden", !book);
        document.querySelector(".pm-preview-wrap")?.classList.toggle("hidden", book);
        $("pm-spacing-row").classList.toggle("hidden", st.template === "blank");
        $("pm-kind-note").textContent = KINDS.find((k) => k.id === st.kind)?.note ?? "";
        pv.style.aspectRatio = paged ? `${f.w} / ${f.h}` : "1 / 1";
        pv.style.width = `${f.w >= f.h || !paged ? 150 : Math.round(150 * f.w / f.h)}px`;
        const cell = Math.max(8, Math.round((f.spacing ?? DEFAULT_SPACING) / 3.5)); // preview scale: 150px for a 2100-unit tile is 1/14, doubled so the lines stay visible
        pv.style.backgroundImage = f.template === "ruled" ? `repeating-linear-gradient(#fff 0 ${cell - 1}px, ${line} ${cell - 1}px ${cell}px)`
          : f.template === "grid" ? `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
          : f.template === "dots" ? "radial-gradient(#b8c0cc 1.2px, transparent 1.6px)" : "none";
        pv.style.backgroundSize = f.template === "ruled" ? "auto" : `${cell}px ${cell}px`;
        $("pm-size").textContent = o.sizeLocked ? "Fixed size" : paged ? `${PAPERS.find((x) => x.id === st.paper)?.label} · ${st.orient}` : KINDS.find((k) => k.id === st.kind)?.label ?? "";
      };
      for (const [id, items, key] of choosers) {
        const box = $(id);
        box.innerHTML = "";
        for (const it of items) {
          const b = el("button", "", it.label);
          b.dataset.v = it.id;
          b.addEventListener("click", () => { st[key] = it.id; paint(); if (key === "kind" && it.id === "notebook") $("pm-name").focus(); });
          box.appendChild(b);
        }
      }
      const done = (v: { format: PageFormat; all: boolean; kind: NewKind; name: string } | null) => {
        setShown(pmEl, false);
        $("pm-ok").onclick = $("pm-cancel").onclick = $("pm-close").onclick = null;
        resolve(v);
      };
      const nameBox = $<HTMLInputElement>("pm-name");
      nameBox.value = "";
      nameBox.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("pm-ok").click(); } };
      $("pm-ok").onclick = () => done({ format: fmt(), all: st.scope === "all", kind: st.kind as NewKind, name: nameBox.value.trim() });
      $("pm-cancel").onclick = $("pm-close").onclick = () => done(null);
      paint();
      setShown(pmEl, true);
      if (st.kind === "notebook") setTimeout(() => $("pm-name").focus(), 50);
    });
  }

  /** The one Create: a note (pages or infinite) or a notebook (a folder), chosen by Type. `kind` preselects the type. */
  async function createNote(kind: NewKind = lastKind(), parent: string | null = ui.folder) {
    const r = await askPageFormat({ title: kind === "notebook" && parent && sectionsCtx() ? "New section" : "Create", ok: "Create", initial: lastFormat(), kind });
    if (!r) return;
    if (r.kind === "notebook") { await newFolder(r.name || "Notebook", parent); return; }
    pref.set("sn.format", JSON.stringify(r.format));
    pref.set("sn.kind", r.kind);
    newNote(r.format, r.kind);
  }

  // ---------- pages: add / delete / move / format
  function addNewPage(after: number) {
    const ref = renderer.pageFormatAt(after) ?? lastFormat();
    renderer.addPage({ w: ref.w, h: ref.h, template: ref.template, spacing: ref.spacing }, after); // the new page looks like its neighbour, line spacing included
  }
  $("add-page-pill").addEventListener("click", () => addNewPage(renderer.pageInfo().total - 1));
  // ---------- page browser: tap the page number ("2 / 3") to see every page of the note; tap one to go there, drag to reorder
  $("page-here").addEventListener("click", () => {
    if (!renderer.isStack()) { renderer.fit("width"); return; } // a free-form canvas has no pages to browse
    openPageBrowser();
  });
  $("pb-close").addEventListener("click", () => closePageBrowser());
  let pbFrom = -1;
  function openPageBrowser() { renderPageBrowser(); setShown($("page-browser"), true); }
  function closePageBrowser() { setShown($("page-browser"), false); }
  const pageBrowserOpen = () => !$("page-browser").classList.contains("hidden") && !$("page-browser").classList.contains("leaving");
  function renderPageBrowser() {
    const grid = $("pb-grid"), tiles = renderer.pageTiles(), cur = renderer.pageInfo().index, total = tiles.length;
    $("pb-title").textContent = `${active?.item.title ?? "Note"} · ${total} page${total === 1 ? "" : "s"}`;
    grid.innerHTML = "";
    const extra = renderer.getUserStrokes();
    tiles.forEach((t, i) => {
      const card = el("div", `pb-card${i === cur ? " current" : ""}`);
      const img = el("img");
      img.src = renderPageThumbnail(t, 180, extra);
      img.alt = `Page ${i + 1}`;
      img.draggable = false;
      const num = el("div", "pb-num");
      num.appendChild(el("span", "", String(i + 1)));
      const menu = el("button");
      menu.dataset.pop = "1";
      menu.title = "Page actions";
      menu.innerHTML = '<i data-icon="more"></i>';
      menu.addEventListener("click", (e) => {
        e.stopPropagation();
        openPopover(menu, (root) => {
          root.append(el("div", "pop-title", `Page ${i + 1} of ${total}`));
          if (i > 0) root.append(popItem("Move up", "undo", () => { renderer.movePage(i, -1); renderPageBrowser(); }));
          if (i < total - 1) root.append(popItem("Move down", "redo", () => { renderer.movePage(i, 1); renderPageBrowser(); }));
          root.append(popItem("Add page after", "plus", () => { addNewPage(i); renderPageBrowser(); }));
          if (total > 1) root.append(popItem("Delete page", "trash", () => {
            if (confirm(`Delete page ${i + 1}?\n\nIts drawings and text are removed from the note. This can't be undone.`)) { renderer.deletePage(i); renderPageBrowser(); }
          }, { danger: true }));
        });
      });
      num.appendChild(menu);
      card.append(img, num);
      card.addEventListener("click", () => { closePageBrowser(); renderer.showPage(i); });
      // drag a page onto another to put it there (mouse and pen; on touch use the ⋯ menu)
      card.draggable = true;
      card.addEventListener("dragstart", (e) => { pbFrom = i; e.dataTransfer?.setData("text/x-starnote-page", String(i)); });
      card.addEventListener("dragend", () => { pbFrom = -1; });
      const after = (e: DragEvent) => e.clientX - card.getBoundingClientRect().left > card.offsetWidth / 2;
      card.addEventListener("dragover", (e) => { if (pbFrom < 0 || pbFrom === i) return; e.preventDefault(); card.classList.toggle("drop-after", after(e)); card.classList.toggle("drop-before", !after(e)); });
      card.addEventListener("dragleave", () => card.classList.remove("drop-before", "drop-after"));
      card.addEventListener("drop", (e) => {
        card.classList.remove("drop-before", "drop-after");
        if (pbFrom < 0 || pbFrom === i) return;
        e.preventDefault();
        let to = i + (after(e) ? 1 : 0);
        if (pbFrom < to) to--; // the page leaves its old place first
        if (to !== pbFrom) renderer.movePage(pbFrom, to - pbFrom);
        pbFrom = -1;
        renderPageBrowser();
      });
      card.style.setProperty("--i", String(Math.min(i, 12)));
      grid.appendChild(card);
    });
    const add = el("button", "pb-add", "+ Page at end");
    add.addEventListener("click", () => { addNewPage(total - 1); renderPageBrowser(); });
    grid.appendChild(add);
    hydrateIcons(grid);
  }

  // ---------- Find in note: typed and PDF text always; handwriting once the AI has read it (only when asked: "Read handwriting")
  const find = { hits: [] as { page: string; box: Box }[], i: -1, index: null as InkIndex | null, noteId: "", run: 0, pdf: null as Record<string, PdfRun[]> | null, pdfLines: {} as Record<string, { text: string; box: Box }[]>, pdfNote: "", pdfLoad: Promise.resolve() };
  /** A PDF page's text, placed on the page's picture as it is laid out now (pages can move). */
  const toWorld = (page: Box, b: Box): Box => { const w = page.r - page.l, hh = page.b - page.t; return { l: page.l + b.l * w, r: page.l + b.r * w, t: page.t + b.t * hh, b: page.t + b.b * hh }; };
  function loadPdfText(): Promise<void> {
    if (!active || find.pdfNote === active.item.id) return find.pdfLoad; // one load per note, shared by everyone waiting
    const item = active.item;
    find.pdfNote = item.id;
    return (find.pdfLoad = (async () => {
      find.pdf = item.kind === "pdf" ? (await library.getPdfText(item.id).catch(() => undefined)) ?? null : null;
      find.pdfLines = Object.fromEntries(Object.entries(find.pdf ?? {}).map(([tag, runs]) => [tag, pdfLines(runs)]));
    })());
  }
  /** What the status line adds for a PDF: its text is searched, or why it can't be. */
  const pdfStatus = () => active?.item.kind !== "pdf" ? "" : find.pdf ? " PDF text is searched too." : " This PDF's text was not kept (imported before text search, or a scan): import the PDF again to search it.";
  const findInput = $<HTMLInputElement>("find-input"), findStatus = $("find-status");
  const findOpen = () => !$("find-bar").classList.contains("hidden") && !$("find-bar").classList.contains("leaving");
  function openFind() {
    setShown($("find-bar"), true);
    $("btn-find").classList.add("on");
    findInput.focus(); findInput.select();
    void loadPdfText().then(() => { runFind(false); renderFindRead(); });
    void loadInk();
  }
  function closeFind() {
    find.run++; // stops a reading in progress
    setShown($("find-bar"), false);
    $("btn-find").classList.remove("on");
    renderer.setFindMarks([], -1);
  }
  /** The handwriting already read for this note (kept by the app), and which pages still need reading (new or changed ink). */
  async function loadInk(): Promise<{ tag: string; strokes: InkStroke[] }[]> {
    if (!active) return [];
    const id = active.item.id;
    let idx = find.noteId === id ? find.index : null;
    idx ??= (await library.getInk(id).catch(() => undefined)) ?? { lang: "ai", pages: {} };
    if (active?.item.id !== id) return [];
    find.index = idx; find.noteId = id;
    const pages = renderer.inkByPage();
    for (const tag of Object.keys(idx.pages)) if (!pages.some((p) => p.tag === tag)) delete idx.pages[tag]; // a page without ink now
    const todo = pages.filter((p) => idx!.pages[p.tag]?.sig !== inkSignature(p.strokes));
    const read = Object.values(idx.pages).reduce((k, pg) => k + new Set(pg.lines.map((l) => `${l.box.t},${l.box.l}`)).size, 0);
    $("find-ai").classList.toggle("hidden", !todo.length);
    $("find-ai").textContent = `Read handwriting (AI)${todo.length > 1 ? `: ${todo.length} pages` : ""}`;
    await loadPdfText();
    findStatus.textContent = (!pages.length ? "No handwriting on these pages."
      : todo.length ? `${todo.length} page${todo.length === 1 ? "" : "s"} of handwriting not read yet${read ? ` (${read} lines read)` : ""}: typed text is searched; the AI reads handwriting when you ask.`
      : `Handwriting read by the AI: ${read} line${read === 1 ? "" : "s"}.`) + pdfStatus();
    renderFindRead();
    return todo;
  }
  /** Reads the pages not read yet with the AI (a picture of each page's ink, lines numbered), only when the user asks. */
  async function readInkWithAi() {
    if (!active) return;
    const todo = await loadInk(), id = active.item.id, idx = find.index!, run = ++find.run;
    if (!todo.length) return;
    if (!aiReady() && !(await openAiSettings())) return;
    if (!confirm(`Read handwriting sends a picture of the handwriting on ${todo.length} page${todo.length === 1 ? "" : "s"} to OpenRouter and the model you chose, using your key (one request per page).\n\nSend it?`)) return;
    let n = 0;
    for (const p of todo) {
      if (run !== find.run || active?.item.id !== id) return;
      findStatus.textContent = `The AI is reading handwriting… page ${++n} of ${todo.length}`;
      const lines = groupIntoLines(p.strokes), png = numberedInkImage(lines);
      if (!png) continue;
      try {
        const texts = await readHandwritingLines(png, lines.length);
        idx.pages[p.tag] = { sig: inkSignature(p.strokes), lines: lines.map((l, i) => ({ text: texts[i], lang: "ai", box: l.box })).filter((l) => l.text) };
        await library.putInk(id, idx).catch(() => undefined); // kept by the app (never in the .note): a page is read once
      } catch (e: any) { findStatus.textContent = `Could not read handwriting: ${e?.message ?? e}`; return; }
      if (run === find.run) runFind(false);
    }
    if (run === find.run) await loadInk();
  }
  $("find-ai").addEventListener("click", () => void readInkWithAi());
  /** The passages of each PDF page that the highlighter covers (worked out from the strokes and the page's words). */
  function pdfHighlights(): Record<string, { text: string; box: Box }[]> {
    if (!find.pdf || find.pdfNote !== active?.item.id) return {};
    const pages = renderer.pageBoxes(), out: Record<string, { text: string; box: Box }[]> = {};
    for (const { tag, strokes } of renderer.inkByPage(true)) {
      const runs = find.pdf[tag], page = pages[tag];
      if (!runs?.length || !page) continue;
      const found = highlightedPassages(pdfWords(runs).map((w) => ({ text: w.text, box: toWorld(page, w.box) })), strokes);
      if (found.length) out[tag] = found;
    }
    return out;
  }
  /** "What was read": the recognizers' text per line and the highlighted PDF passages, page by page, so a miss can be told
   * from a misreading (and the passages are what an assistant would be given). */
  function renderFindRead() {
    const list = $("find-read-list"), order = renderer.pageOrder(), hl = pdfHighlights();
    const ink = find.noteId === active?.item.id ? find.index?.pages ?? {} : {};
    const tags = [...new Set([...Object.keys(ink).filter((t) => ink[t].lines.length), ...Object.keys(hl)])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    list.replaceChildren();
    $("find-read").classList.toggle("hidden", !tags.length);
    for (const tag of tags) {
      list.append(el("div", "fr-page", `Page ${order.indexOf(tag) + 1}`));
      const rows = [...(ink[tag]?.lines ?? []).map((l) => ({ ...l, lang: l.lang ?? "" })), ...(hl[tag] ?? []).map((p) => ({ ...p, lang: "hl" }))];
      for (const l of rows.sort((a, b) => a.box.t - b.box.t || a.box.l - b.box.l)) {
        const row = el("div", "fr-line");
        row.append(el("span", "fr-lang", l.lang), document.createTextNode(l.text));
        list.append(row);
      }
    }
  }
  /** Finds the query in typed text and in the handwriting read so far; `jump` moves to the first hit. */
  function runFind(jump: boolean) {
    const q = findInput.value;
    const hits: { page: string; box: Box }[] = [];
    if (q.trim()) {
      for (const t of renderer.textByPage()) if (findIn(t.text, q).length) hits.push({ page: t.tag, box: t.box });
      if (find.pdf && find.pdfNote === active?.item.id) { // an imported PDF's own text, mark narrowed to the match
        const pages = renderer.pageBoxes();
        for (const [tag, lines] of Object.entries(find.pdfLines)) {
          if (!pages[tag]) continue;
          for (const line of lines) for (const m of findIn(line.text, q)) {
            const b = toWorld(pages[tag], line.box), w = b.r - b.l;
            hits.push({ page: tag, box: { ...b, l: b.l + w * m.from, r: b.l + w * m.to } });
          }
        }
      }
      for (const [tag, pg] of Object.entries(find.noteId === active?.item.id ? find.index?.pages ?? {} : {})) {
        for (const line of pg.lines) for (const m of findIn(line.text, q)) {
          const w = line.box.r - line.box.l; // narrow the mark to the part of the line that matched
          const box = { l: line.box.l + w * m.from, r: line.box.l + w * m.to, t: line.box.t, b: line.box.b };
          // the same word read in both languages is one hit: skip a mark that mostly overlaps one already there
          const dup = hits.some((h) => h.page === tag && h.box.t === box.t && Math.min(h.box.r, box.r) - Math.max(h.box.l, box.l) > 0.5 * Math.min(h.box.r - h.box.l, box.r - box.l));
          if (!dup) hits.push({ page: tag, box });
        }
      }
    }
    const order = renderer.pageOrder();
    hits.sort((a, b) => order.indexOf(a.page) - order.indexOf(b.page) || a.box.t - b.box.t || a.box.l - b.box.l);
    find.hits = hits;
    if (find.i >= hits.length || jump) find.i = hits.length ? 0 : -1;
    if (find.i < 0 && hits.length) find.i = 0;
    $("find-count").textContent = !q.trim() ? "" : hits.length ? `${find.i + 1} of ${hits.length}` : "No matches";
    renderer.setFindMarks(hits.map((h) => h.box), find.i);
    if (jump && hits.length) renderer.showBox(hits[find.i].box);
  }
  function stepFind(d: number) {
    if (!find.hits.length) return;
    find.i = (find.i + d + find.hits.length) % find.hits.length;
    $("find-count").textContent = `${find.i + 1} of ${find.hits.length}`;
    renderer.setFindMarks(find.hits.map((h) => h.box), find.i);
    renderer.showBox(find.hits[find.i].box);
  }
  $("btn-find").addEventListener("click", () => (findOpen() ? closeFind() : openFind()));
  $("find-close").addEventListener("click", closeFind);
  $("find-next").addEventListener("click", () => stepFind(1));
  $("find-prev").addEventListener("click", () => stepFind(-1));
  findInput.addEventListener("input", () => runFind(true));
  findInput.addEventListener("keydown", (e) => {
    e.stopPropagation(); // typing here is not a shortcut
    if (e.key === "Enter") { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
  });
  // ink written while Find is open: the status says a moment later that it is not read yet
  let findIdle = 0;
  const onChangeBeforeFind = renderer.onChange;
  renderer.onChange = () => {
    onChangeBeforeFind?.();
    if (findOpen()) { clearTimeout(findIdle); findIdle = window.setTimeout(() => { if (findOpen()) void loadInk(); }, 1500); } // shows what is not read yet; reading costs AI use, so only on request
  };

  // ---------- page panel (right): the page's format, live, and the page actions; toggled from the top bar
  const panelOn = () => pref.get("sn.pagepanel", "0") === "1";
  let panelScope: "this" | "all" = "this", panelAt = "";
  $("btn-page-panel").addEventListener("click", () => { pref.set("sn.pagepanel", panelOn() ? "0" : "1"); renderPagePanel(); });
  function renderPagePanel() {
    const box = $("page-panel");
    $("btn-page-panel").classList.toggle("on", panelOn());
    setShown(box, panelOn() && inEditor());
    if (!panelOn() || !inEditor()) return;
    box.innerHTML = "";
    const head = el("div", "pp-head");
    const close = el("button", "icon-btn");
    close.title = "Close";
    close.innerHTML = '<i data-icon="close"></i>';
    close.addEventListener("click", () => { pref.set("sn.pagepanel", "0"); renderPagePanel(); });
    const chips = (label: string, list: { id: string; label: string }[], current: string | null, pick: (id: string) => void, disabled = false) => {
      box.appendChild(el("div", "pm-label", label));
      const g = el("div", "pm-chips");
      for (const it of list) {
        const b = el("button", it.id === current ? "active" : "", it.label);
        b.disabled = disabled;
        b.addEventListener("click", () => pick(it.id));
        g.appendChild(b);
      }
      box.appendChild(g);
    };
    const spacingId = (v?: number) => SPACINGS.find((x) => Math.abs(x.v - (v ?? -1)) < 0.01)?.id ?? null;

    const canvas = renderer.canvasStyle();
    if (canvas) { // an infinite canvas: one style for the whole sheet
      head.append(el("span", "", "Infinite canvas"), close);
      box.appendChild(head);
      chips("Page style", TEMPLATES, canvas.template, (t) => { renderer.setCanvasStyle(t as PageTemplate, canvas.spacing); renderPagePanel(); });
      if (canvas.template !== "blank") chips("Line spacing", SPACINGS, spacingId(canvas.spacing), (id) => { renderer.setCanvasStyle(canvas.template, SPACINGS.find((x) => x.id === id)!.v); renderPagePanel(); });
      hydrateIcons(box);
      return;
    }
    if (!renderer.isStack()) {
      head.append(el("span", "", "Page"), close);
      box.append(head, el("p", "pp-note", "This note is a free-form StarNote canvas: its pages can't be changed here."));
      hydrateIcons(box);
      return;
    }
    const { index: i, total } = renderer.pageInfo();
    panelAt = `${i}/${total}`;
    const f = renderer.pageFormatAt(i)!, locked = renderer.hasBackgroundAt(i), paper = paperOf(f.w, f.h);
    head.append(el("span", "", `Page ${i + 1} of ${total}`), close);
    box.appendChild(head);
    const apply = (next: Partial<PageFormat>) => {
      const idx = panelScope === "all" ? [...Array(total).keys()] : [i];
      renderer.setPageFormat(idx, next);
      pref.set("sn.format", JSON.stringify({ ...f, ...next }));
      renderPagePanel();
    };
    chips("Apply to", [{ id: "this", label: "This page" }, { id: "all", label: "All pages" }], panelScope, (id) => { panelScope = id as "this" | "all"; renderPagePanel(); });
    const land = paper ? paper.landscape : f.w > f.h;
    chips("Paper", PAPERS, paper?.paper ?? null, (id) => { const n = pageFormat(id, land, f.template); apply({ w: n.w, h: n.h }); }, locked);
    chips("Orientation", [{ id: "portrait", label: "Portrait" }, { id: "landscape", label: "Landscape" }], land ? "landscape" : "portrait", (id) => { if ((id === "landscape") !== land) apply({ w: f.h, h: f.w }); }, locked);
    chips("Page style", TEMPLATES, f.template, (t) => apply({ template: t as PageTemplate }));
    if (f.template !== "blank") chips("Line spacing", SPACINGS, spacingId(f.spacing), (id) => apply({ spacing: SPACINGS.find((x) => x.id === id)!.v }));
    if (locked) box.appendChild(el("p", "pp-note", "A PDF page keeps its size; only its style can change."));
    box.appendChild(el("div", "pm-label", "Pages"));
    const acts = el("div", "pp-actions");
    const act = (label: string, run: () => void, cls = "", off = false) => { const b = el("button", `btn btn-sm ${cls}`, label); b.disabled = off; b.addEventListener("click", () => { run(); renderPagePanel(); }); acts.appendChild(b); };
    act("+ Page after", () => addNewPage(i));
    act("+ Page at end", () => addNewPage(total - 1));
    act("Move up", () => renderer.movePage(i, -1), "", i === 0);
    act("Move down", () => renderer.movePage(i, 1), "", i === total - 1);
    act("Delete page", () => {
      if (total <= 1) { showToast("A note needs at least one page.", "info"); return; }
      if (confirm(`Delete page ${i + 1}?\n\nIts drawings and text are removed from the note. This can't be undone.`)) renderer.deletePage(i);
    }, "btn-danger wide", total <= 1);
    box.appendChild(acts);
    hydrateIcons(box);
  }

  // ---------- text & math editor
  const MATH_SNIPPETS: [string, string][] = [
    ["a/b", "\\frac{a}{b}"], ["√", "\\sqrt{x}"], ["xⁿ", "x^{n}"], ["xₙ", "x_{n}"], ["Σ", "\\sum_{i=1}^{n}"], ["∫", "\\int_{a}^{b}"],
    ["lim", "\\lim_{x\\to\\infty}"], ["α", "\\alpha"], ["β", "\\beta"], ["π", "\\pi"], ["θ", "\\theta"], ["∞", "\\infty"],
    ["≤", "\\leq"], ["≠", "\\neq"], ["×", "\\times"], ["→", "\\to"], ["( )", "\\left( \\right)"], ["matrix", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"],
  ];
  // The formula editor: a docked panel with the LaTeX source. The typeset formula is drawn on the page itself, live,
  // at the place it will end up. Esc / Ctrl+Enter / Done commit (a formula with an error is refused); Cancel discards.
  const te = {
    at: { x: 0, y: 0 }, box: null as ParsedTextBox | null, size: 40, color: "#000000", timer: 0, seq: 0, open: false,
    replacing: [] as ParsedStroke[], // Convert to LaTeX: the ink this formula replaces when it is committed (one undo step)
    el: $("text-editor"), input: $<HTMLTextAreaElement>("te-input"), error: $("te-error"), snips: $("te-snips"),
  };
  for (const [label, tex] of MATH_SNIPPETS) {
    const b = el("button", "", label);
    b.title = tex;
    b.addEventListener("click", () => {
      const i = te.input;
      i.setRangeText(tex, i.selectionStart, i.selectionEnd, "end");
      i.focus();
      refreshPreview();
    });
    te.snips.appendChild(b);
  }
  function closeTextEditor() {
    te.open = false; setShown(te.el, false); te.box = null; te.seq++; te.replacing = [];
    renderer.setTextDraft(null);
  }
  /** Typeset the source and show it on the page; an error keeps the last good picture and is written under the code. */
  async function refreshPreview() {
    const mine = ++te.seq;
    const latex = te.input.value.trim();
    if (!latex) { te.error.classList.add("hidden"); renderer.updateTextDraft({ math: { img: null, w: te.size * 2, h: te.size } }); return; }
    try {
      const r = await renderMath(latex, te.size, te.color);
      if (mine !== te.seq) return;
      te.error.classList.toggle("hidden", !r.error);
      if (r.error) { te.error.textContent = r.error; return; }
      const img = new Image();
      img.onload = () => { if (mine === te.seq) renderer.updateTextDraft({ math: { img, w: r.width, h: r.height } }); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.svg);
    } catch (err: any) {
      te.error.classList.remove("hidden");
      te.error.textContent = `Could not typeset: ${err.message}`;
    }
  }
  const schedulePreview = () => { clearTimeout(te.timer); te.timer = window.setTimeout(refreshPreview, 150); };
  function openTextEditor(req: { x: number; y: number; clientX: number; clientY: number; box: ParsedTextBox | null }) {
    const b = req.box;
    te.open = true;
    te.at = { x: req.x, y: req.y };
    te.box = b;
    te.size = b?.fontSize ?? Number(pref.get("sn.mathsize", "40"));
    te.color = b?.color ?? penColors.ink; // text uses the pen colour, never the highlighter's
    te.input.value = b ? latexOf(b.text) : "";
    te.error.classList.add("hidden");
    $("te-delete").classList.toggle("hidden", !b);
    setShown(te.el, true);
    const o = b ? renderer.textBoxOrigin(b) : te.at;
    renderer.setTextDraft({ x: o.x, y: o.y, box: b, text: "", caret: 0, caretOn: false, size: te.size, bold: false, italic: false, color: te.color, math: { img: null, w: te.size * 2, h: te.size } });
    const panel = te.el.getBoundingClientRect(), bottomSheet = te.el.offsetWidth >= $("canvas-container").clientWidth - 2;
    const r = renderer.textDraftRect()!;
    renderer.revealRect(r, bottomSheet ? { right: 0, bottom: panel.height } : { right: panel.width, bottom: 0 }); // keep the formula clear of the panel
    refreshPreview();
    te.input.focus();
  }
  /** Commits the formula. Returns false (panel stays open) when the source has an error; `force` closes anyway. */
  async function commitTextEditor(force = false): Promise<boolean> {
    if (!te.open) return true;
    const raw = te.input.value.replace(/\s+$/, "");
    if (!raw.trim()) { // emptied: that deletes an existing formula, or just closes
      const box = te.box;
      closeTextEditor();
      if (box) renderer.commitTextBox(box, null, te.at);
      return true;
    }
    const r = await renderMath(raw.trim(), te.size, te.color);
    if (r.error) {
      showToast(`Fix the formula first: ${r.error}`, "error");
      if (!force) return false;
      closeTextEditor();
      return true;
    }
    const box = te.box;
    const replacing = te.replacing; // read before closing: closing forgets it
    closeTextEditor();
    if (renderer.commitTextBox(box, { text: wrapLatex(raw), color: te.color, fontSize: te.size, size: { width: r.width, height: r.height } }, te.at, replacing)) pref.set("sn.mathsize", String(te.size));
    return true;
  }
  const resizeMath = (d: number) => { te.size = Math.max(20, Math.min(160, te.size + d)); renderer.updateTextDraft({ size: te.size }); refreshPreview(); };

  // ---------- typing right on the page (Text tool): a hidden textarea takes the keys (and the phone keyboard / IME),
  // the renderer draws the text and caret live where it will end up. Tap elsewhere, switch tool, or Esc commits.
  const ghost = $<HTMLTextAreaElement>("text-ghost");
  const inl = { on: false, box: null as ParsedTextBox | null, at: { x: 0, y: 0 }, size: Number(pref.get("sn.textsize", "40")), bold: false, italic: false, color: "#000000", blink: 0, pendingMath: false };
  const syncDraft = () => renderer.updateTextDraft({ text: ghost.value, caret: ghost.selectionStart, caretOn: true, size: inl.size, bold: inl.bold, italic: inl.italic, color: inl.color });
  function styleText(p: { size?: number; bold?: boolean; italic?: boolean }) {
    Object.assign(inl, p);
    if (p.size) pref.set("sn.textsize", String(inl.size));
    if (inl.on) { syncDraft(); ghost.focus({ preventScroll: true }); }
    renderToolOptions();
  }
  function openInline(req: { x: number; y: number; clientX: number; clientY: number; box: ParsedTextBox | null }) {
    const b = req.box;
    if (!b && !renderer.isOnPage(req.x, req.y)) { showToast("Tap on a page to place text.", "info"); return; }
    inl.on = true; inl.box = b;
    inl.at = { x: req.x, y: req.y };
    if (b) { inl.size = b.fontSize; inl.bold = !!b.isBold; inl.italic = !!b.isItalic; }
    inl.color = b?.color ?? penColors.ink; // text uses the pen colour, never the highlighter's
    ghost.value = b ? b.text : "";
    const o = b ? renderer.textBoxOrigin(b) : inl.at;
    renderer.setTextDraft({ x: o.x, y: o.y, box: b, text: ghost.value, caret: ghost.value.length, caretOn: true, size: inl.size, bold: inl.bold, italic: inl.italic, color: inl.color });
    const host = $("canvas-container").getBoundingClientRect(); // the IME / keyboard anchors where the text is
    ghost.style.left = `${Math.max(0, req.clientX - host.left)}px`;
    ghost.style.top = `${Math.max(0, req.clientY - host.top)}px`;
    ghost.focus({ preventScroll: true });
    ghost.setSelectionRange(ghost.value.length, ghost.value.length);
    optionsOpen = true; // the size / bold / italic chips stay in reach while editing (touching the page closed them)
    clearInterval(inl.blink);
    inl.blink = window.setInterval(() => renderer.blinkCaret(), 530);
    renderToolOptions();
  }
  function commitInline() {
    if (!inl.on) return;
    const { box, at, size, bold, italic, color } = inl;
    const raw = ghost.value.replace(/\s+$/, "");
    inl.on = false; inl.box = null;
    clearInterval(inl.blink);
    ghost.blur();
    renderer.setTextDraft(null);
    if (!raw.trim()) { if (box) renderer.commitTextBox(box, null, at); }
    else if (!box || raw !== box.text || size !== box.fontSize || bold !== !!box.isBold || italic !== !!box.isItalic || color !== box.color) {
      renderer.commitTextBox(box, { text: raw, color, fontSize: size, isBold: bold, isItalic: italic, size: renderer.measureText(raw, size, bold, italic) }, at);
    }
    renderToolOptions();
  }
  renderer.onTextRequest = async (req) => {
    if (inl.on || te.open) {
      const r = renderer.textDraftRect();
      if (r && req.x >= r.l && req.x <= r.r && req.y >= r.t && req.y <= r.b) { const f = te.open ? te.input : ghost; f.blur(); f.focus({ preventScroll: true }); return; } // tap on what is being edited: keep editing
      commitInline();
      if (!(await commitTextEditor())) return; // a formula with an error stays open
    }
    if (inl.pendingMath || (req.box && isMathText(req.box.text))) { inl.pendingMath = false; openTextEditor(req); return; }
    openInline(req);
  };
  // the soft keyboard (Android) shrinks the view: keep what is being edited on screen
  let revealTimer = 0;
  window.addEventListener("resize", () => {
    if (!inl.on && !te.open) return;
    clearTimeout(revealTimer);
    revealTimer = window.setTimeout(() => {
      const r = renderer.textDraftRect();
      if (!r) return;
      const panel = te.open ? te.el.getBoundingClientRect() : null, sheet = !!panel && te.el.offsetWidth >= $("canvas-container").clientWidth - 2;
      renderer.revealRect(r, { right: panel && !sheet ? panel.width : 0, bottom: panel && sheet ? panel.height : 0 });
    }, 200);
  });
  ghost.addEventListener("input", syncDraft);
  ghost.addEventListener("keyup", syncDraft);
  ghost.addEventListener("click", syncDraft);
  ghost.addEventListener("keydown", (e) => {
    e.stopPropagation(); // keys typed on the page are not shortcuts
    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitInline(); }
    else requestAnimationFrame(syncDraft);
  });
  te.input.addEventListener("input", schedulePreview);
  te.input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); void commitTextEditor(); }
  });
  $("te-ok").addEventListener("click", () => void commitTextEditor());
  $("te-cancel").addEventListener("click", closeTextEditor);
  $("te-delete").addEventListener("click", () => { const box = te.box; closeTextEditor(); if (box) renderer.commitTextBox(box, null, te.at); });
  $("te-smaller").addEventListener("click", () => resizeMath(-8));
  $("te-bigger").addEventListener("click", () => resizeMath(8));

  // ---------- selection: copy / delete / paste buttons
  // ---------- Convert to LaTeX: the selected handwriting goes to an AI model (OpenRouter, the user's key) and comes back as a
  // formula in the Math panel, where it can be checked; Done swaps the ink for it (one undo step), Cancel keeps the ink
  async function openAiSettings(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = $("ai-modal"), key = $<HTMLInputElement>("ai-key"), sel = $<HTMLSelectElement>("ai-model"), custom = $<HTMLInputElement>("ai-model-id"), status = $("ai-status");
      key.value = aiKey(); custom.value = ""; status.textContent = "Loading the models that can read images…";
      sel.innerHTML = "";
      const current = aiModel();
      if (current) sel.appendChild(new Option(current, current, true, true));
      visionModels().then((list) => {
        sel.innerHTML = "";
        for (const m of list) sel.appendChild(new Option(`${m.free ? "Free · " : ""}${m.name}`, m.id, false, m.id === current));
        if (current && !list.some((m) => m.id === current)) sel.prepend(new Option(current, current, true, true));
        status.textContent = `${list.filter((m) => m.free).length} free and ${list.filter((m) => !m.free).length} paid models read images. Free ones are listed first.`;
      }).catch((e) => { status.textContent = `Could not load the model list (${e.message}); you can type a model id.`; });
      const done = (ok: boolean) => { setShown(modal, false); resolve(ok); };
      $("ai-save").onclick = () => { setAiKey(key.value); setAiModel(custom.value.trim() || sel.value); done(aiReady()); };
      $("ai-cancel").onclick = $("ai-close").onclick = () => done(false);
      $("ai-forget").onclick = () => { setAiKey(""); key.value = ""; showToast("The OpenRouter key was removed from this device", "info"); };
      setShown(modal, true);
      setTimeout(() => key.focus(), 30);
    });
  }
  async function convertSelection() {
    const strokes = renderer.selectedStrokes(), box = renderer.selectionBounds(), png = renderer.selectionImage();
    if (!strokes.length || !box || !png) return;
    if (!aiReady() && !(await openAiSettings())) return;
    if (pref.get("sn.ai.ok", "") !== "1") {
      if (!confirm("Convert to LaTeX sends the selected handwriting (as a picture) to OpenRouter and the model you chose, using your key.\n\nSend it?")) return;
      pref.set("sn.ai.ok", "1");
    }
    showToast("Reading the handwriting…", "info");
    let latex: string;
    try { latex = await readMath(png); } catch (e: any) { showToast(e.message, "error"); return; }
    // the Math panel opens where the ink is, with the formula to check; Done replaces the ink
    const host = $("canvas-container").getBoundingClientRect();
    openTextEditor({ x: box.l, y: box.t, clientX: host.left + host.width / 2, clientY: host.top + host.height / 2, box: null });
    te.replacing = strokes;
    te.input.value = latex;
    void refreshPreview();
  }
  $("sel-latex").addEventListener("click", () => void convertSelection());

  const syncSelectionButtons = () => {
    const sel = renderer.hasSelection();
    $("sel-copy").classList.toggle("hidden", !sel);
    $("sel-delete").classList.toggle("hidden", !sel);
    $("sel-latex").classList.toggle("hidden", !sel);
    $("sel-paste").classList.toggle("hidden", !renderer.hasClipboard());
  };
  renderer.onSelectionChange = () => { syncSelectionButtons(); renderToolOptions(); };
  renderer.onClipboardChange = syncSelectionButtons;
  renderer.onNotice = (m) => showToast(m, "info");
  $("sel-copy").addEventListener("click", () => { if (renderer.copySelection()) showToast("Copied. Open any note and paste.", "success"); });
  $("sel-delete").addEventListener("click", () => renderer.deleteSelection());
  $("sel-paste").addEventListener("click", () => renderer.pasteClipboard());

  renderer.penWidth = Number(pref.get("sn.width", "5.9"));
  renderer.eraserReach = Number(pref.get("sn.eraser", "14"));
  renderer.shapeKind = (SHAPE_KINDS.find((k) => k.id === pref.get("sn.shape", "rect"))?.id ?? "rect") as ShapeKind;
  renderer.penType = penFor(penById(pref.get("sn.pen", "pen")).id, penSetting[penById(pref.get("sn.pen", "pen")).id]);
  applyPenColor();
  syncPenButton();
  setTool("pan"); // the app opens with the Hand tool: looking around a note never leaves a stray mark; pick a pen to write

  $("btn-pen-settings").dataset.pop = "1";
  $("btn-pen-settings").addEventListener("click", (e) => {
    const anchor = e.currentTarget as HTMLElement;
    const build = (root: HTMLElement) => {
      root.append(el("div", "pop-title", "Touch & pen"));
      root.appendChild(popItem("Stylus only (palm rejection)", "pen", () => { renderer.stylusOnly = !renderer.stylusOnly; pref.set("sn.stylus", renderer.stylusOnly ? "1" : "0"); openPopover(anchor, build); }, { checked: renderer.stylusOnly }));
      root.appendChild(popItem("E-Ink mode (high contrast)", "image", () => {
        renderer.eInkMode = !renderer.eInkMode;
        document.body.classList.toggle("eink-mode", renderer.eInkMode);
        renderer.render();
        openPopover(anchor, build);
      }, { checked: renderer.eInkMode }));
      root.appendChild(el("div", "pop-sep"));
      root.appendChild(el("div", "pop-title", "Brush"));
      const slider = (label: string, min: number, max: number, step: number, val: number, set: (v: number) => void, digits: number) => {
        const row = el("div", "pop-row");
        row.appendChild(el("span", "", label));
        const input = el("input");
        input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(val);
        const out = el("span", "val", val.toFixed(digits));
        input.addEventListener("input", () => { const v = parseFloat(input.value); out.textContent = v.toFixed(digits); set(v); renderer.render(); });
        row.append(input, out);
        return row;
      };
      root.appendChild(slider("Smoothing", 0, 1, 0.05, renderer.smoothLevel, (v) => (renderer.smoothLevel = v), 2));
      root.appendChild(slider("Pressure", 0, 1, 0.025, renderer.pressureSensitivity, (v) => (renderer.pressureSensitivity = v), 3));
      root.appendChild(el("div", "pop-sep"));
      root.appendChild(popItem("Toggle fullscreen", "fit", () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      }));
    };
    openPopover(anchor, build);
  });

  $("btn-more").dataset.pop = "1";
  $("btn-more").addEventListener("click", (e) => {
    if (!active) return;
    const s = active;
    openPopover(e.currentTarget as HTMLElement, (root) => {
      root.append(
        popItem("Rename", "pen", () => renameItem(s.item)),
        popItem("Download .note", "download", () => downloadItem(s.item)),
        popItem("Export SVG", "image", () => {
          const svg = exportCanvasAsSvg(s.doc, renderer.getUserStrokes(), { smoothLevel: renderer.smoothLevel, pressureSensitivity: renderer.pressureSensitivity });
          downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${s.item.title}.svg`);
        }),
        popItem("Export annotated PDF", "download", () => exportPdfDownload(s)),
        popItem("AI settings (OpenRouter)…", "sigma", () => void openAiSettings()),
        ...(zotero.isConnected() ? [popItem("Save annotated PDF to Zotero", "book", () => sendPdfToZotero(s))] : []),
        popItem("Google Drive…", "cloud", openDriveModal)
      );
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePopover(); if (optionsOpen) { optionsOpen = false; renderToolOptions(); } setShown(modal, false); setShown($("zotero-modal"), false); if (!pmEl.classList.contains("hidden")) $("pm-cancel").click(); if (pageBrowserOpen()) closePageBrowser();
      const mv = $("move-modal");
      if (!mv.classList.contains("hidden") && !mv.classList.contains("leaving")) $("move-cancel").click(); // resolves the chooser as cancelled; the selection stays
      else if (sel.on && !inEditor()) setSelecting(false); }
    if (!inEditor() || (e.target as HTMLElement).closest("input,textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? renderer.redo() : renderer.undo(); }
    else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); renderer.redo(); }
    else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (active) saveSession(active); }
    else if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(); }
    else if (mod && e.key.toLowerCase() === "c") { if (renderer.copySelection()) { e.preventDefault(); showToast("Copied. Open any note and paste.", "success"); } }
    else if (mod && e.key.toLowerCase() === "x") { if (renderer.cutSelection()) e.preventDefault(); }
    else if (mod && e.key.toLowerCase() === "v") { if (renderer.hasClipboard()) { e.preventDefault(); renderer.pasteClipboard(); } }
    else if ((e.key === "Delete" || e.key === "Backspace") && renderer.hasSelection()) { e.preventDefault(); renderer.deleteSelection(); }
    else if (e.key === "Escape" && renderer.hasSelection()) { renderer.clearSelection(); renderer.render(); }
  });

  window.addEventListener("paste", (e) => { // pictures can't be placed in a note yet: say so instead of doing nothing
    if (!inEditor() || (e.target as HTMLElement | null)?.closest?.("input,textarea")) return;
    if ([...(e.clipboardData?.items ?? [])].some((i) => i.type.startsWith("image/"))) {
      e.preventDefault();
      showToast("Pasting pictures isn't supported yet. You can paste drawings copied with the lasso.", "info");
    }
  });

  // unsaved work: flush when the window is hidden; a browser tab also warns when it is closed
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    if (active) park();
    sessions.forEach((s) => { if (isDirty(s)) saveSession(s); });
  });
  // the desktop app: closing the window waits for the save (the process would otherwise end before IndexedDB finished)
  if (isDesktopApp()) {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      void win.onCloseRequested(async (e) => {
        e.preventDefault();
        try {
          park();
          await Promise.race([Promise.all(sessions.filter(isDirty).map((x) => saveSession(x))), new Promise((r) => setTimeout(r, 5000))]);
        } finally { await win.destroy(); }
      });
    });
  }
  window.addEventListener("beforeunload", (e) => {
    if (!isDesktopApp() && sessions.some(isDirty)) e.preventDefault(); // the apps just close: autosave and the hidden-flush above keep the work
  });

  // ============================================================ library chrome
  const libView = $("view-library");
  const collapsed = () => libView.classList.contains("side-collapsed");
  const setCollapsed = (v: boolean) => {
    pref.set("sn.side", v ? "1" : "0");
    const side = $("lib-sidebar");
    if (!v || window.innerWidth >= 820 || collapsed()) { libView.classList.toggle("side-collapsed", v); return; } // only the overlay drawer slides out
    side.classList.add("leaving");
    setTimeout(() => { side.classList.remove("leaving"); libView.classList.add("side-collapsed"); }, 160);
  };
  setCollapsed(window.innerWidth < 820 || pref.get("sn.side", "0") === "1"); // phones always start with the sidebar hidden
  let wasNarrow = window.innerWidth < 820;
  window.addEventListener("resize", () => { // turning a phone to portrait: the sidebar would cover half the library
    const narrow = window.innerWidth < 820;
    if (narrow && !wasNarrow && !collapsed()) libView.classList.add("side-collapsed"); // not remembered: wide again, it is as before
    wasNarrow = narrow;
  });
  $("btn-sidebar-toggle").addEventListener("click", () => setCollapsed(true));
  $("btn-sidebar-open").addEventListener("click", () => setCollapsed(false));
  $("lib-main").addEventListener("pointerdown", () => { if (window.innerWidth < 820 && !collapsed()) setCollapsed(true); });

  document.querySelectorAll<HTMLElement>(".side-item").forEach((b) =>
    b.addEventListener("click", () => { ui.filter = b.dataset.filter as typeof ui.filter; if (ui.filter !== "all") ui.folder = null; renderLibrary(); })
  );
  document.querySelectorAll<HTMLElement>("#lib-tabs button").forEach((b) =>
    b.addEventListener("click", () => { ui.kind = b.dataset.kind as typeof ui.kind; renderLibrary(); })
  );
  $<HTMLInputElement>("lib-search").addEventListener("input", (e) => { ui.query = (e.target as HTMLInputElement).value; renderLibrary(); });

  $("btn-new-folder").addEventListener("click", () => void createNote("notebook"));
  $("btn-sort").dataset.pop = "1";
  $("btn-sort").addEventListener("click", (e) => {
    openPopover(e.currentTarget as HTMLElement, (root) => {
      for (const [key, label] of [["modified", "Last modified"], ["created", "Date created"], ["title", "Title (A–Z)"], ["manual", "Manual (drag to reorder)"]] as const) {
        root.appendChild(popItem(label, "sort", () => { ui.sort = key; pref.set("sn.sort", key); renderLibrary(); }, { checked: ui.sort === key }));
      }
    });
  });

  // ============================================================ annotated PDF + Zotero
  /** Writes pending strokes into the note first, so the PDF shows exactly what the note contains. */
  async function buildAnnotatedPdf(s: Session): Promise<{ bytes: Uint8Array; title: string; filename: string }> {
    await saveSession(s);
    const title = `${s.item.title} (annotated)`;
    return { bytes: await exportAnnotatedPdf(s.doc, title), title, filename: `${safeFileName(title)}.pdf` };
  }

  async function exportPdfDownload(s: Session) {
    try {
      showToast("Building the PDF…", "info");
      const { bytes, filename } = await buildAnnotatedPdf(s);
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), filename);
      showToast(`Saving "${filename}" to your Downloads folder…`, "info");
    } catch (err: any) {
      showToast(`PDF export failed: ${err.message}`, "error");
      console.error(err);
    }
  }

  const zotero = new ZoteroClient();
  const zmodal = $("zotero-modal");
  const zs = { collection: "", query: "", shown: 0, fetched: 0, total: 0, seq: 0, started: false };

  async function sendPdfToZotero(s: Session) {
    try {
      showToast("Building the PDF…", "info");
      const { bytes, title, filename } = await buildAnnotatedPdf(s);
      showToast("Uploading to Zotero…", "info");
      await zotero.uploadPdf({ parentKey: s.item.zotero?.parentKey ?? null, title, filename, bytes });
      showToast(`Saved to Zotero as "${title}"`, "success");
    } catch (err: any) {
      showToast(`Zotero: ${err.message}`, "error");
      console.error(err);
    }
  }

  function zoteroStatusUI(info?: { username: string; canWrite: boolean; canRead: boolean }) {
    const on = zotero.isConnected();
    $("zotero-dot").className = on ? "on" : "";
    $("z-user").textContent = on ? (info ? `Connected as ${info.username || "your account"}` : "Connected") : "Not connected";
    $("z-perms").textContent = !on
      ? "Paste a Zotero API key to browse your library and import PDFs."
      : info
        ? info.canWrite ? "Can read your library and save annotated PDFs back." : "Read-only key: you can import PDFs, but not save annotated PDFs back."
        : "Key saved in this browser.";
    $("z-disconnect").classList.toggle("hidden", !on);
  }

  async function zoteroLoadCollections() {
    const sel = $<HTMLSelectElement>("z-collection");
    try {
      const cols = await zotero.listCollections();
      const byParent = new Map<string | null, ZoteroCollection[]>();
      for (const c of cols) byParent.set(c.parent, [...(byParent.get(c.parent) ?? []), c]);
      sel.length = 1; // keep "All items"
      const walk = (parent: string | null, depth: number) => {
        for (const c of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
          const o = el("option", "", `${" ".repeat(depth)}${c.name}`);
          o.value = c.key;
          sel.appendChild(o);
          walk(c.key, depth + 1);
        }
      };
      walk(null, 0);
    } catch (err: any) {
      showToast(`Zotero: ${err.message}`, "error");
    }
  }

  async function zoteroLoadItems(reset: boolean) {
    if (!zotero.isConnected()) return;
    const seq = ++zs.seq;
    const list = $("z-list"), loading = $("z-loading"), more = $("z-more");
    if (reset) { list.innerHTML = ""; zs.shown = 0; zs.fetched = 0; zs.total = 0; }
    loading.classList.remove("hidden");
    more.classList.add("hidden");
    try {
      const { items: rows, total, fetched } = await zotero.listItems({ collection: zs.collection || null, query: zs.query, start: zs.fetched });
      if (seq !== zs.seq) return; // superseded by a newer search
      zs.fetched += fetched; zs.total = total; zs.shown += rows.length;
      for (const it of rows) list.appendChild(zoteroRow(it));
      if (zs.shown === 0) list.appendChild(el("div", "empty-cloud-hint", zs.query ? "Nothing matches that search." : "No items here."));
      more.classList.toggle("hidden", zs.fetched >= zs.total);
    } catch (err: any) {
      if (seq !== zs.seq) return;
      list.appendChild(el("div", "empty-cloud-hint", `Error: ${err.message}`));
    } finally {
      if (seq === zs.seq) loading.classList.add("hidden");
    }
  }

  function zoteroRow(item: ZoteroItem): HTMLElement {
    const wrap = el("div");
    const row = el("div", "drive-file-row");
    const info = el("div", "drive-file-info");
    info.appendChild(el("span", "file-icon", item.isPdfAttachment ? "📄" : item.type === "book" ? "📕" : "📝"));
    const text = el("div");
    text.appendChild(el("div", "file-name", item.title)); // textContent: titles are untrusted
    text.appendChild(el("div", "file-meta", [item.creators, item.year].filter(Boolean).join(" · ") || item.type));
    info.appendChild(text);
    const buttons = el("div", "drive-file-buttons");
    if (item.isPdfAttachment) {
      const b = el("button", "btn btn-sm btn-primary", "Import");
      if (!item.fileStored) { b.title = "Zotero does not report a cloud copy of this file; the import may fail"; text.appendChild(el("div", "file-meta", "⚠ file may not be in Zotero cloud")); }
      b.addEventListener("click", () => zoteroImport(item, { key: item.key, title: item.title, filename: item.title, parentKey: null, stored: item.fileStored }, false));
      buttons.appendChild(b);
    } else if (item.numChildren > 0) {
      const b = el("button", "btn btn-sm", "PDFs");
      let sub: HTMLElement | null = null;
      b.addEventListener("click", async () => {
        if (sub) { sub.remove(); sub = null; return; }
        sub = el("div", "z-sub");
        sub.appendChild(el("div", "file-meta", "Loading…"));
        wrap.appendChild(sub);
        try {
          const pdfs = await zotero.listPdfs(item);
          sub.innerHTML = "";
          if (pdfs.length === 0) sub.appendChild(el("div", "file-meta", "No stored PDF attachments on this item."));
          for (const pdf of pdfs) {
            const r = el("div", "z-pdf");
            r.appendChild(el("span", "", pdf.stored ? pdf.title : `${pdf.title}  ⚠ not in Zotero cloud`));
            const imp = el("button", "btn btn-sm btn-primary", "Import");
            imp.addEventListener("click", () => zoteroImport(item, pdf, pdfs.length > 1));
            r.appendChild(imp);
            sub.appendChild(r);
          }
        } catch (err: any) {
          if (sub) { sub.innerHTML = ""; sub.appendChild(el("div", "file-meta", `Error: ${err.message}`)); }
        }
      });
      buttons.appendChild(b);
    }
    row.append(info, buttons);
    wrap.appendChild(row);
    return wrap;
  }

  async function zoteroImport(item: ZoteroItem, pdf: ZoteroPdf, many: boolean) {
    try {
      const existing = items.find((i) => i.zotero?.attachmentKey === pdf.key && !i.trashed);
      if (existing) {
        setShown(zmodal, false);
        await openItem(existing.id);
        showToast("That PDF is already in your library: opened it.", "info");
        return;
      }
      showToast(`Downloading "${item.title}" from Zotero…`, "info");
      const data = await zotero.downloadPdf(pdf.key);
      const title = many ? `${item.title} – ${pdf.title}` : item.title;
      const imported = await importBuffer(`${safeFileName(title)}.pdf`, data, undefined, { title, zotero: { attachmentKey: pdf.key, parentKey: pdf.parentKey, title: item.title } });
      setShown(zmodal, false);
      await refreshLibrary();
      scheduleSync();
      await openItem(imported.id);
    } catch (err: any) {
      showToast(`Zotero: ${err.message}`, "error");
      console.error(err);
    }
  }

  function openZotero() {
    setShown(zmodal, true);
    zoteroStatusUI();
    if (zotero.isConnected() && !zs.started) { zs.started = true; zoteroLoadCollections(); zoteroLoadItems(true); }
  }
  $("side-zotero").addEventListener("click", openZotero);
  $("z-close").addEventListener("click", () => setShown(zmodal, false));
  zmodal.addEventListener("pointerdown", (e) => { if (e.target === zmodal) setShown(zmodal, false); });
  document.querySelectorAll<HTMLElement>(".z-tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".z-tab").forEach((o) => o.classList.toggle("active", o === t));
      document.querySelectorAll(".z-pane").forEach((p) => p.classList.toggle("active", p.id === t.dataset.ztab));
    })
  );
  $("z-connect").addEventListener("click", async () => {
    const input = $<HTMLInputElement>("z-key");
    try {
      const info = await zotero.connect(input.value);
      input.value = "";
      zoteroStatusUI(info);
      showToast("Connected to Zotero", "success");
      zs.started = true;
      document.querySelector<HTMLElement>('.z-tab[data-ztab="z-lib"]')!.click();
      zoteroLoadCollections();
      zoteroLoadItems(true);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  });
  $("z-disconnect").addEventListener("click", () => {
    zotero.disconnect();
    zs.started = false;
    $("z-list").innerHTML = "";
    zoteroStatusUI();
    showToast("Disconnected from Zotero", "info");
  });
  $("z-search").addEventListener("input", debounce((e: Event) => { zs.query = (e.target as HTMLInputElement).value; zoteroLoadItems(true); }, 400));
  $("z-collection").addEventListener("change", (e) => { zs.collection = (e.target as HTMLSelectElement).value; zoteroLoadItems(true); });
  $("z-more").addEventListener("click", () => zoteroLoadItems(false));
  zoteroStatusUI();

  // ============================================================ auto-sync
  const TOMBSTONES = "sn.tombstones";
  const readTombstones = (): string[] => { try { return JSON.parse(pref.get(TOMBSTONES, "[]")); } catch { return []; } };
  function addTombstone(fileId: string) { pref.set(TOMBSTONES, JSON.stringify([...new Set([...readTombstones(), fileId])])); }
  const autoSyncOn = () => pref.get("sn.autosync", "1") === "1";
  const SOURCES = "sn.importedSources"; // foreign Drive files already turned into notes
  const readSources = (): string[] => { try { return JSON.parse(pref.get(SOURCES, "[]")); } catch { return []; } };

  /**
   * First sign-in only: nothing is uploaded until the user says so. Declining turns auto-sync off (it can be turned on in
   * Drive -> Settings). Resolves true when a sync should start now.
   */
  async function confirmFirstSync(): Promise<boolean> {
    if (pref.get("sn.autosync.asked", "0") === "1") return autoSyncOn();
    pref.set("sn.autosync.asked", "1");
    const n = items.filter((i) => !i.trashed).length;
    if (n === 0) return autoSyncOn();
    const ok = confirm(
      `Sync your ${n} note${n > 1 ? "s" : ""} to a "StarNote" folder in your Google Drive now?\n\n` +
      `OK = upload them and keep them in sync.\nCancel = connect only (nothing is uploaded; you can turn Auto-sync on later in Drive → Settings).`
    );
    pref.set("sn.autosync", ok ? "1" : "0");
    const box = document.getElementById("cfg-autosync") as HTMLInputElement | null;
    if (box) box.checked = ok;
    if (!ok) setSyncStatus("Auto-sync off");
    return ok;
  }

  const sync = { running: false, again: false };
  function setSyncStatus(text: string, cls = "") {
    const e = $("sync-status");
    e.textContent = text;
    e.className = `sync-status ${cls}${text ? "" : " hidden"}`;
  }

  async function runSync(manual = false) {
    if (drive.isMockMode()) { if (manual) showToast("Sync is off in demo mode.", "info"); return; }
    if (!drive.isConnected()) {
      setSyncStatus(drive.getUser() ? "Session expired — sign in to resume sync" : "", "error");
      return;
    }
    if (!manual && !autoSyncOn()) return;
    if (sync.running) { sync.again = true; return; }
    sync.running = true;
    setSyncStatus("Syncing…", "busy");
    try {
      const rep = await syncLibrary(
        drive.syncRemote(),
        {
          list: library.list,
          getBytes: library.getBytes,
          create: (item, bytes) => library.put(item, bytes),
          update: library.update,
        },
        {
          // Busy = on screen, unsaved, or mid-save. A clean tab that is not showing is released and reloads fresh next time.
          isBusy: (id) => {
            const x = sessions.find((t) => t.item.id === id);
            return !!x && ((!!shownIn(x) && inEditor()) || isDirty(x) || x.inFlight > 0);
          },
          release: (id) => {
            const i = sessions.findIndex((t) => t.item.id === id);
            if (i < 0) return;
            if (sessions[i] === active) active = null;
            sessions.splice(i, 1);
            renderTabs();
          },
          tombstones: new Set(readTombstones()),
          sourceDone: (fileId) => readSources().includes(fileId),
          importSource: async (file, data, parentId) => {
            await importBuffer(file.name, toBuffer(data), undefined, { parentId }); // becomes a normal note; it uploads as its own file next round
            pref.set(SOURCES, JSON.stringify([...readSources(), file.id]));
          },
          inspect: async (bytes) => ({ thumb: renderThumbnail(await loadStarNoteArchive(toBuffer(bytes))) }),
          newId: () => crypto.randomUUID(),
          now: () => Date.now(),
        }
      );
      await refreshLibrary();
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (rep.errors.length) {
        setSyncStatus(`Synced ${time} with ${rep.errors.length} problem${rep.errors.length > 1 ? "s" : ""}`, "error");
        console.warn("sync problems:", rep.errors);
        if (manual) showToast(rep.errors[0], "error");
      } else {
        setSyncStatus(`Synced ${time}`);
      }
      if (rep.importedSources || rep.restored) scheduleSync(); // new notes from Drive files / restored notes upload next round
      if (rep.restored) showToast(`Drive folder looked emptied: restored ${rep.restored} notes instead of deleting them.`, "info");
      if (rep.removedLocal) showToast(`${rep.removedLocal} note${rep.removedLocal > 1 ? "s" : ""} deleted in Drive moved to Trash here.`, "info");
      const bits = [rep.uploaded && `${rep.uploaded} uploaded`, rep.importedSources && `${rep.importedSources} added from Drive folder`, rep.trashedRemote && `${rep.trashedRemote} moved to Drive trash`, rep.pulled && `${rep.pulled} updated`, rep.imported && `${rep.imported} downloaded`, rep.conflicts && `${rep.conflicts} conflict copy`].filter(Boolean);
      if (bits.length && (manual || rep.imported || rep.importedSources || rep.conflicts || rep.trashedRemote)) showToast(`Drive sync: ${bits.join(", ")}`, rep.conflicts ? "info" : "success");
      else if (manual && !rep.errors.length) showToast("Everything is up to date.", "success");
    } catch (err: any) {
      setSyncStatus(`Sync failed: ${err.message}`, "error");
      updateDriveStatusUI();
    } finally {
      sync.running = false;
      if (sync.again) { sync.again = false; scheduleSync(); }
    }
  }
  const scheduleSync = debounce(() => runSync(false), 2500);
  setInterval(() => runSync(false), 90_000);
  window.addEventListener("online", () => runSync(false));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") runSync(false); });
  $("btn-sync-now").addEventListener("click", () => runSync(true));

  // ============================================================ Google Drive
  let activeDriveFileId: string | undefined;
  const modal = $("gdrive-modal");
  const btnDriveSaveNew = $<HTMLButtonElement>("btn-drive-save-new");
  const btnDriveOverwrite = $<HTMLButtonElement>("btn-drive-overwrite");

  function updateDriveButtons() {
    const canSave = inEditor() && !!active;
    btnDriveSaveNew.classList.toggle("hidden", !canSave);
    const canOverwrite = canSave && active!.item.kind === "note" && !!active!.item.driveId;
    btnDriveOverwrite.classList.toggle("hidden", !canOverwrite);
    activeDriveFileId = canOverwrite ? active!.item.driveId : undefined;
  }

  function openDriveModal() {
    setShown(modal, true);
    updateDriveButtons();
    loadDriveFiles();
  }
  $("btn-account").addEventListener("click", openDriveModal);
  $("sidebar-btn-connect-drive").addEventListener("click", async () => {
    // Expired token but known account: re-authorise straight from this click (popups need a user gesture).
    if (!drive.isConnected() && drive.getUser() && drive.getClientId()) {
      try {
        await drive.startOAuthFlow();
        updateDriveStatusUI();
        runSync(true);
        return;
      } catch (err: any) { showToast(err.message, "error"); showSignInProblem(err.message); updateDriveStatusUI(); return; }
    }
    openDriveModal();
  });
  $("modal-close").addEventListener("click", () => setShown(modal, false));
  modal.addEventListener("pointerdown", (e) => { if (e.target === modal) setShown(modal, false); });

  const tabs = document.querySelectorAll(".modal-tab");
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      document.getElementById(tab.getAttribute("data-tab")!)?.classList.add("active");
    })
  );

  const searchInput = $<HTMLInputElement>("drive-search-input");
  searchInput.addEventListener("input", debounce(() => loadDriveFiles(searchInput.value), 400));
  $("btn-refresh-drive").addEventListener("click", () => loadDriveFiles(searchInput.value));

  btnDriveSaveNew.addEventListener("click", async () => {
    if (!active) return;
    if (!drive.isConnected()) { showToast("Please connect your Google Drive account first.", "error"); return; }
    try {
      showToast("Saving a copy to Google Drive...", "info");
      await saveSession(active);
      const bytes = await library.getBytes(active.item.id);
      if (!bytes) throw new Error("nothing to upload yet");
      const name = `${active.item.title}_copy_${new Date().toISOString().slice(0, 10)}.note`;
      const uploaded = await drive.uploadNoteFile(name, bytes);
      showToast(`Saved "${name}" to Google Drive`, "success");
      void uploaded;
      loadDriveFiles(searchInput.value);
    } catch (err: any) {
      showToast(`Drive upload failed: ${err.message}`, "error");
    }
  });

  btnDriveOverwrite.addEventListener("click", async () => {
    if (!active || !activeDriveFileId || active.item.kind !== "note") return;
    if (!confirm(`Overwrite "${active.item.title}" in your Google Drive? This replaces the remote file.`)) return;
    try {
      showToast("Overwriting on Google Drive...", "info");
      await saveSession(active);
      const bytes = await library.getBytes(active.item.id);
      if (!bytes) throw new Error("nothing to upload yet");
      await drive.uploadNoteFile(`${active.item.title}.note`, bytes, activeDriveFileId);
      showToast("Google Drive file updated", "success");
      loadDriveFiles(searchInput.value);
    } catch (err: any) {
      showToast(`Drive overwrite failed: ${err.message}`, "error");
    }
  });

  /** A failed sign-in stays visible in the Drive dialog (the toast may pass while you are still in the browser); a secret problem opens Settings. */
  function showSignInProblem(message: string) {
    updateDriveStatusUI();
    openDriveModal();
    const p = $("user-email");
    p.textContent = message;
    p.classList.add("error-text");
    if (/client secret|Client ID/i.test(message)) (document.querySelector('.modal-tab[data-tab="tab-settings"]') as HTMLElement | null)?.click();
  }
  $("btn-google-signin").addEventListener("click", async () => {
    try {
      await drive.startOAuthFlow();
      updateDriveStatusUI();
      loadDriveFiles();
      showToast("Signed in to Google Drive", "success");
      if (await confirmFirstSync()) runSync();
    } catch (err: any) {
      showToast(err.message, "error");
      showSignInProblem(err.message);
    }
  });
  $("btn-google-signout").addEventListener("click", () => {
    drive.logout();
    updateDriveStatusUI();
    loadDriveFiles();
    showToast("Disconnected from Google Drive", "info");
  });

  const cfgClientId = $<HTMLInputElement>("cfg-client-id");
  cfgClientId.value = drive.getClientId();
  cfgClientId.addEventListener("change", () => { drive.setClientId(cfgClientId.value); showToast("Client ID saved", "info"); });
  if (isDesktopApp()) { // the desktop app signs in through the system browser: no web origin, but a client secret
    $("cfg-origin-group").classList.add("hidden");
    $("cfg-secret-group").classList.remove("hidden");
    $("cfg-client-id-label").textContent = "Google OAuth 2.0 Client ID (type: Desktop app):";
    $("cfg-client-id-hint").textContent = "Enable the Drive API and add yourself as a Test user. This must be a Desktop app client, not the Web client the browser version uses.";
  }
  if (androidSignIn()) { // the phone signs in with its own Google account: nothing to type here
    $("cfg-origin-group").classList.add("hidden");
    $("cfg-secret-group").classList.add("hidden");
    cfgClientId.classList.add("hidden");
    $("cfg-client-id-label").textContent = "Google sign-in on Android";
    $("cfg-client-id-hint").textContent = "Uses this phone's Google account; no client ID or secret. Your Google Cloud project needs an OAuth client of type Android for com.starnote.interop with the app's SHA-1 (user guide, Google Drive).";
  }
  const cfgSecret = $<HTMLInputElement>("cfg-client-secret");
  cfgSecret.value = drive.getClientSecret();
  cfgSecret.addEventListener("change", () => { drive.setClientSecret(cfgSecret.value); showToast("Client secret saved on this computer", "info"); });
  const cfgOrigin = $<HTMLInputElement>("cfg-redirect-uri");
  cfgOrigin.value = drive.getRedirectUri();
  $("btn-copy-redirect-uri").addEventListener("click", () => { navigator.clipboard.writeText(cfgOrigin.value); showToast("Origin copied", "success"); });

  const cfgToken = $<HTMLInputElement>("cfg-direct-token");
  $("btn-apply-token").addEventListener("click", async () => {
    if (!cfgToken.value.trim()) return;
    showToast("Verifying access token...", "info");
    const ok = await drive.setAccessToken(cfgToken.value);
    updateDriveStatusUI();
    loadDriveFiles();
    showToast(ok ? "Google Drive connected" : "Invalid token or access denied.", ok ? "success" : "error");
    if (ok && (await confirmFirstSync())) runSync();
  });

  const cfgAuto = $<HTMLInputElement>("cfg-autosync");
  cfgAuto.checked = autoSyncOn();
  cfgAuto.addEventListener("change", () => {
    pref.set("sn.autosync", cfgAuto.checked ? "1" : "0");
    setSyncStatus(cfgAuto.checked ? "" : "Auto-sync off", "");
    if (cfgAuto.checked) runSync();
  });

  const cfgMock = $<HTMLInputElement>("cfg-mock-mode");
  cfgMock.checked = drive.isMockMode();
  cfgMock.addEventListener("change", () => {
    drive.setMockMode(cfgMock.checked);
    updateDriveStatusUI();
    loadDriveFiles();
    showToast(cfgMock.checked ? "Demo cloud mode on" : "Demo cloud mode off", "info");
  });

  let driveLoadSeq = 0; // drop results of superseded loads (rapid refresh / modal reopen)
  async function loadDriveFiles(search?: string) {
    const seq = ++driveLoadSeq;
    const listEl = $("drive-files-list");
    const loadingEl = $("drive-loading");
    const hint = (text: string, color?: string) => {
      const d = el("div", "empty-cloud-hint", text);
      if (color) d.style.color = color;
      listEl.appendChild(d);
    };

    listEl.innerHTML = "";
    if (!drive.isConnected()) {
      hint("Google Drive is not connected. Open the Account tab to sign in, or enable demo mode in Settings.");
      return;
    }
    loadingEl.classList.remove("hidden");
    try {
      const files = await drive.listNoteFiles(search);
      if (seq !== driveLoadSeq) return;
      loadingEl.classList.add("hidden");
      if (files.length === 0) { hint("No .note or .pdf files found in your Google Drive."); return; }
      for (const f of files) listEl.appendChild(driveRow(f));
    } catch (err: any) {
      if (seq !== driveLoadSeq) return;
      loadingEl.classList.add("hidden");
      hint(`Error: ${err.message}`, "#ef4444");
    }
  }

  function driveRow(file: GoogleDriveFile): HTMLElement {
    const row = el("div", "drive-file-row");
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.mimeType === "application/pdf";
    const info = el("div", "drive-file-info");
    info.appendChild(el("span", "file-icon", isPdf ? "📄" : "📝"));
    const text = el("div");
    text.appendChild(el("div", "file-name", file.name)); // textContent: names are untrusted
    const date = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "-";
    text.appendChild(el("div", "file-meta", `${date}${file.size ? ` · ${(file.size / 1024).toFixed(1)} KB` : ""}`));
    info.appendChild(text);

    const buttons = el("div", "drive-file-buttons");
    const open = el("button", "btn btn-sm btn-primary", "Import & open");
    open.addEventListener("click", async () => {
      try {
        showToast(`Downloading "${file.name}"...`, "info");
        const { data, filename } = await drive.downloadFile(file.id);
        const item = await importBuffer(filename, data, isPdf ? undefined : file.id);
        setShown(modal, false);
        await refreshLibrary();
        scheduleSync();
        await openItem(item.id);
      } catch (err: any) {
        showToast(`Failed to import: ${err.message}`, "error");
      }
    });
    const dl = el("button", "btn btn-sm", "Download");
    dl.addEventListener("click", async () => {
      try {
        const { data, filename } = await drive.downloadFile(file.id);
        downloadBlob(new Blob([data]), filename);
      } catch (err: any) {
        showToast(`Download failed: ${err.message}`, "error");
      }
    });
    buttons.append(open, dl);
    row.append(info, buttons);
    return row;
  }

  function updateDriveStatusUI() {
    const connected = drive.isConnected();
    const user = drive.getUser();
    $("sidebar-drive-dot").className = `status-dot ${connected ? "connected" : "disconnected"}`;
    $("sidebar-drive-text").textContent = connected ? user?.email || (drive.isMockMode() ? "Demo Drive" : "Connected") : "Disconnected";
    const expired = !connected && !!user && !drive.isMockMode();
    $("sidebar-btn-connect-drive").textContent = connected ? "Browse" : expired ? "Resume sync" : "Connect Drive";
    $("btn-sync-now").classList.toggle("hidden", !connected || drive.isMockMode());
    if (!connected && !expired) setSyncStatus("");

    const avatar = $("btn-account");
    avatar.innerHTML = "";
    if (connected && user?.picture) {
      const img = el("img");
      img.src = user.picture;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      avatar.appendChild(img);
    } else {
      avatar.textContent = (user?.name || user?.email || "S").trim().charAt(0).toUpperCase();
    }

    const img = $<HTMLImageElement>("user-avatar");
    if (connected && user) {
      if (user.picture) img.src = user.picture;
      $("user-name").textContent = user.name;
      $("user-email").textContent = user.email; $("user-email").classList.remove("error-text");
    } else {
      img.src = "https://www.gstatic.com/images/branding/product/2x/drive_48dp.png";
      $("user-name").textContent = "Not Signed In";
      $("user-email").textContent = "Connect with Google to import notes from Drive and save copies back."; $("user-email").classList.remove("error-text");
    }
    $("btn-google-signin").classList.toggle("hidden", connected && !!user);
    $("btn-google-signout").classList.toggle("hidden", !(connected && user));
  }

  // ============================================================ start
  updateDriveStatusUI();
  showView("library");
  await refreshLibrary();
  if (!autoSyncOn()) setSyncStatus("Auto-sync off");
  runSync(false);
  void refreshThumbnails();

  /**
   * Android's Back button (MainActivity.kt asks this first): close whatever is on top, else go back one place.
   * Returns false only when there is nowhere left to go, and the app then closes as usual.
   */
  (window as any).__reaBack = (): boolean => {
    const open = (id: string) => !$(id).classList.contains("hidden") && !$(id).classList.contains("leaving");
    if (!pop.classList.contains("hidden") && !pop.classList.contains("leaving")) { closePopover(); return true; }
    if (open("move-modal")) { $("move-cancel").click(); return true; }
    if (open("ask-modal")) { $("ask-cancel").click(); return true; }
    if (open("ai-modal")) { $("ai-cancel").click(); return true; }
    if (pageBrowserOpen()) { closePageBrowser(); return true; }
    if (open("page-modal")) { $("pm-cancel").click(); return true; }
    if (open("zotero-modal")) { setShown($("zotero-modal"), false); return true; }
    if (open("gdrive-modal")) { setShown($("gdrive-modal"), false); return true; }
    if (inEditor()) {
      if (te.open) { closeTextEditor(); return true; }  // the Math panel: like Cancel
      if (findOpen()) { closeFind(); return true; }
      if (inl.on) { commitInline(); return true; }      // typing on the page: keep what was typed
      if (optionsOpen) { optionsOpen = false; renderToolOptions(); return true; }
      void leaveToLibrary();
      return true;
    }
    if (sel.on) { setSelecting(false); return true; }
    if (ui.query) { ui.query = ""; $<HTMLInputElement>("lib-search").value = ""; renderLibrary(); return true; }
    if (ui.filter !== "all") { ui.filter = "all"; renderLibrary(); return true; }
    if (ui.folder) {
      const ctx = sectionsCtx(); // in the sections view a section and its notebook are one place: Back leaves the notebook
      openFolder(ctx?.nb && viewOf(ctx.nb) === "sections" ? ctx.nb.parentId ?? null : items.find((i) => i.id === ui.folder)?.parentId ?? null);
      return true;
    }
    return false;
  };

  /**
   * Card pictures are drawn when a note is saved, so older cards keep an older look (raw $$latex$$, wide lines). Redraw them
   * once per THUMB_VERSION, in the background. Only `thumb` changes: no new `modified`, so nothing is re-synced.
   */
  async function refreshThumbnails() {
    const THUMB_VERSION = "2";
    if (pref.get("sn.thumbs", "") === THUMB_VERSION) return;
    for (const it of items.filter((i) => i.kind === "note")) {
      try {
        const bytes = await library.getBytes(it.id);
        if (bytes) await library.update(it.id, { thumb: renderThumbnail(await loadStarNoteArchive(toBuffer(bytes))) });
      } catch { /* a note that does not load keeps its old picture */ }
    }
    pref.set("sn.thumbs", THUMB_VERSION);
    await refreshLibrary();
  }
});
