import { PEN_KINDS, PenType, penById, penFor } from "./pens";
import { SHAPE_KINDS, ShapeKind } from "./shapes";
import { isMathText, latexOf, wrapLatex, renderMath } from "./math";
import { PAPERS, TEMPLATES, DEFAULT_FORMAT, PageFormat, PageTemplate, newPageTile, relayout, pageFormat, paperOf } from "./pages";
import { CanvasRenderer, ViewSnapshot } from "./canvas-renderer";
import { loadStarNoteArchive, StarNoteDocument, ParsedTextBox } from "./note-loader";
import { exportStarNoteArchive, exportCanvasAsSvg } from "./note-serializer";
import { GoogleDriveService, GoogleDriveFile } from "./google-drive";
import { loadPdfDocument, convertPdfToStarNoteDocument } from "./pdf-loader";
import { library, renderThumbnail, LibraryItem } from "./library";
import { isDesktopApp } from "./net";
import { syncLibrary } from "./sync";
import { ZoteroClient, ZoteroItem, ZoteroPdf, ZoteroCollection } from "./zotero";
import { exportAnnotatedPdf, safeFileName } from "./pdf-export";

// ---------------------------------------------------------------- icons
const ICONS: Record<string, string> = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dot: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
  spin: '<path d="M12 3a9 9 0 019 9"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
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
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function downloadBlob(blob: Blob, filename: string) {
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
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
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
  const renderer = new CanvasRenderer(canvas);
  if (new URLSearchParams(location.search).has("debug")) (window as any).__starnote = { renderer }; // for performance tests only
  const drive = new GoogleDriveService();

  let items: LibraryItem[] = [];
  const sessions: Session[] = [];
  let active: Session | null = null;

  const ui = {
    filter: "all" as "all" | "trash",
    kind: "all" as "all" | "note" | "pdf",
    query: "",
    sort: pref.get("sn.sort", "modified") as "modified" | "created" | "title",
  };

  // ============================================================ popover
  const pop = $("popover");
  function closePopover() { pop.classList.add("hidden"); pop.innerHTML = ""; }
  function openPopover(anchor: HTMLElement, fill: (root: HTMLElement) => void) {
    pop.innerHTML = "";
    fill(pop);
    hydrateIcons(pop);
    pop.classList.remove("hidden");
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
  }

  function visibleItems(): LibraryItem[] {
    const q = ui.query.trim().toLowerCase();
    return items
      .filter((i) => (ui.filter === "trash" ? i.trashed : !i.trashed))
      .filter((i) => ui.kind === "all" || i.kind === ui.kind)
      .filter((i) => !q || i.title.toLowerCase().includes(q))
      .sort((a, b) => (ui.sort === "title" ? a.title.localeCompare(b.title) : b[ui.sort] - a[ui.sort]));
  }

  function renderLibrary() {
    $("count-all").textContent = String(items.filter((i) => !i.trashed).length);
    $("count-trash").textContent = String(items.filter((i) => i.trashed).length);
    $("lib-title").textContent = ui.filter === "trash" ? "Trash" : "All notes";
    $("lib-drop-hint").innerHTML = ui.filter === "trash"
      ? "Trashed notes are also moved to Google Drive's trash when sync is on (Drive keeps them 30 days)."
      : "Drop a <b>.note</b> or <b>.pdf</b> file anywhere to import it.";
    document.querySelectorAll<HTMLElement>(".side-item").forEach((b) => b.classList.toggle("active", b.dataset.filter === ui.filter));
    document.querySelectorAll<HTMLElement>("#lib-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.kind === ui.kind));

    const grid = $("lib-grid");
    grid.innerHTML = "";

    if (ui.filter === "all") {
      const create = el("div", "card create");
      const thumb = el("button", "card-thumb");
      thumb.title = "Create a new note";
      thumb.innerHTML = '<i data-icon="plus"></i>';
      thumb.addEventListener("click", () => void createNote());
      const meta = el("div", "card-meta");
      meta.appendChild(el("div", "card-title", "Create"));
      meta.appendChild(el("div", "card-date", "Start a blank note"));
      create.append(thumb, meta);
      grid.appendChild(create);
    }

    const list = visibleItems();
    for (const item of list) grid.appendChild(card(item));
    if (list.length === 0 && ui.filter === "trash") grid.appendChild(el("div", "empty-state", "Trash is empty."));
    if (list.length === 0 && ui.filter === "all" && (ui.query || ui.kind !== "all")) grid.appendChild(el("div", "empty-state", "No notes match."));
    hydrateIcons(grid);
  }

  function card(item: LibraryItem): HTMLElement {
    const c = el("div", "card");
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

  async function setTrashed(item: LibraryItem, trashed: boolean) {
    await library.update(item.id, { trashed });
    if (trashed) closeSession(sessions.find((s) => s.item.id === item.id), true);
    await refreshLibrary();
    showToast(trashed ? "Moved to trash" : "Restored", "info");
    scheduleSync(); // the Drive copy follows (Drive's trash is recoverable for 30 days)
  }

  async function deleteForever(item: LibraryItem) {
    if (!confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return;
    if (item.syncId) addTombstone(item.syncId); // the Drive copy stays; just never re-import it
    await library.remove(item.id);
    closeSession(sessions.find((s) => s.item.id === item.id), true);
    await refreshLibrary();
    scheduleSync();
  }

  async function renameItem(item: LibraryItem) {
    const name = prompt("Rename note", item.title)?.trim();
    if (!name || name === item.title) return;
    const fields = { title: name, modified: Date.now() };
    await library.update(item.id, fields);
    const s = sessions.find((x) => x.item.id === item.id);
    if (s) s.item = { ...s.item, ...fields };
    scheduleSync();
    await refreshLibrary();
    renderEditorChrome();
  }

  async function duplicateItem(item: LibraryItem) {
    const bytes = await library.getBytes(item.id);
    if (!bytes) return;
    const now = Date.now();
    await library.put(
      { ...item, id: crypto.randomUUID(), title: `${item.title} copy`, created: now, modified: now, driveId: undefined, syncId: undefined, syncRemote: undefined, syncLocal: undefined },
      bytes
    );
    await refreshLibrary();
    scheduleSync();
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
  async function importBuffer(filename: string, buf: ArrayBuffer, driveId?: string, extra?: { title?: string; zotero?: LibraryItem["zotero"] }): Promise<LibraryItem> {
    const now = Date.now();
    const id = crypto.randomUUID();
    if (filename.toLowerCase().endsWith(".pdf")) {
      showToast(`Rendering "${filename}"...`, "info");
      const pdf = await loadPdfDocument(buf, filename, 2100);
      const doc = convertPdfToStarNoteDocument(pdf);
      const bytes = await exportStarNoteArchive(doc, []);
      const item: LibraryItem = { id, title: extra?.title ?? baseName(filename), kind: "pdf", created: now, modified: now, trashed: false, thumb: renderThumbnail(doc), zotero: extra?.zotero };
      await library.put(item, bytes);
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
    const item: LibraryItem = { id, title, kind: "note", created: now, modified: now, trashed: false, driveId, thumb: renderThumbnail(doc) };
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
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
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
    return s === active ? renderer.getUserStrokes() : s.view?.strokes ?? [];
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
    if (active) active.view = renderer.snapshot();
  }

  function newNote(format: PageFormat = DEFAULT_FORMAT) {
    const now = Date.now();
    const doc: StarNoteDocument = { uuid: crypto.randomUUID(), title: "Untitled note", tiles: new Map([["Page[0-0]", newPageTile("Page[0-0]", format)]]), layout: "stack" };
    relayout(doc);
    const item: LibraryItem = { id: crypto.randomUUID(), title: "Untitled note", kind: "note", created: now, modified: now, trashed: false };
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

  function activate(s: Session) {
    if (active && active !== s) park();
    active = s;
    showView("editor");
    if (s.view) renderer.restore(s.view);
    else {
      renderer.setDocument(s.doc);
      renderer.fit("width");
    }
    s.view = null;
    renderEditorChrome();
    renderTabs();
  }

  async function leaveToLibrary() {
    if (active) {
      park();
      await saveSession(active);
    }
    showView("library");
    await refreshLibrary();
  }

  async function closeSession(s: Session | undefined, silent = false) {
    if (!s) return;
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
  function saveSession(s: Session): Promise<void> {
    const p = (s.saving ?? Promise.resolve()).then(async () => {
      const pending = [...pendingStrokes(s)];
      const erased = [...erasedSaved(s)];
      if (s.isNew && pending.length === 0 && !textChanged(s) && !pagesChanged(s)) return; // untouched new note: nothing to keep
      if (!s.isNew && pending.length === 0 && erased.length === 0 && !textChanged(s) && !pagesChanged(s) && s.item.thumb) return; // unchanged
      setSaveState("saving");
      try {
        const bytes = await exportStarNoteArchive(s.doc, pending);
        if (s === active) renderer.markSaved(pending, erased);
        else if (s.view) s.view = { ...s.view, strokes: s.view.strokes.filter((x) => !pending.includes(x)), undoStack: [], redoStack: [] };
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
  }

  function renderTabs() {
    const wrap = $("tabs");
    wrap.innerHTML = "";
    for (const s of sessions) {
      const t = el("div", `tab${s === active ? " active" : ""}`);
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

  renderer.onChange = () => {
    if (!active) return;
    renderEditorChrome();
    renderTabs();
  };
  renderer.onZoomChange = (z) => { $("zoom-level").textContent = `${Math.round(z * 100)}%`; };
  let lastPageLabel = "";
  renderer.onRender = () => {
    const { index, total } = renderer.pageInfo();
    const label = `${index + 1} / ${total}`;
    if (label !== lastPageLabel) { lastPageLabel = label; $("page-label").textContent = label; }
    $("add-page-pill").classList.toggle("hidden", !(renderer.isStack() && renderer.endOfNoteVisible() && inEditor()));
  };

  // ---------- editor wiring
  $("btn-back").addEventListener("click", leaveToLibrary);
  $("btn-new-tab").addEventListener("click", () => newNote(lastFormat())); // the "+" tab: a new note in the last-used format, no dialog
  $("save-state").addEventListener("click", async () => { if (active) { await saveSession(active); showToast("Saved", "success"); } });
  $("tool-undo").addEventListener("click", () => renderer.undo());
  $("tool-redo").addEventListener("click", () => renderer.redo());
  $("btn-zoom-reset").addEventListener("click", () => renderer.fit("page"));
  $("btn-fit-width").addEventListener("click", () => renderer.fit("width"));
  $("btn-fit-height").addEventListener("click", () => renderer.fit("height"));
  $("page-prev").addEventListener("click", () => renderer.gotoPage(-1));
  $("page-next").addEventListener("click", () => renderer.gotoPage(1));

  type Tool = "pen" | "eraser" | "pan" | "lasso" | "shape" | "text";
  const TOOLS: Tool[] = ["pen", "eraser", "lasso", "shape", "text", "pan"];

  // ----- colors: pen and highlighter each remember their own color and which colors get used most
  const penColors = { ink: pref.get("sn.ink", "#b33333"), hl: pref.get("sn.hl", penById("highlighter").color!) };
  const DEFAULT_COLORS = {
    ink: ["#000000", "#b33333", "#2f4fd0", "#0b8a5f", "#e6a817", "#7c3aed"],
    hl: ["#f5d742", "#7ee081", "#ff9ecb", "#7cc4ff", "#ffb366", "#c9a7ff"],
  };
  type Kind = "ink" | "hl";
  let use: Record<Kind, Record<string, number>> = { ink: {}, hl: {} };
  try { const u = JSON.parse(pref.get("sn.colorUse", "{}")); use = { ink: u.ink ?? {}, hl: u.hl ?? {} }; } catch { /* start counting afresh */ }
  const bump = (kind: Kind, color: string) => {
    const c = color.toLowerCase();
    use[kind][c] = (use[kind][c] ?? 0) + 1;
    pref.set("sn.colorUse", JSON.stringify(use));
  };
  // A color order the user set by dragging stays as it is (per kind) until "Auto order" is tapped
  let pinned: Partial<Record<Kind, string[]>> = {};
  try { const o = JSON.parse(pref.get("sn.colorOrder", "{}")); pinned = { ink: Array.isArray(o.ink) ? o.ink : undefined, hl: Array.isArray(o.hl) ? o.hl : undefined }; } catch { /* auto order */ }
  const savePinned = () => pref.set("sn.colorOrder", JSON.stringify(pinned));
  /** The colors offered for a pen kind: the order the user set, else the most used first, topped up with the defaults. */
  const quickColors = (kind: Kind): string[] => {
    const fixed = pinned[kind];
    if (fixed) return [...fixed, ...DEFAULT_COLORS[kind].filter((c) => !fixed.includes(c))].slice(0, 6);
    const used = Object.entries(use[kind]).sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 6);
    return [...used, ...DEFAULT_COLORS[kind].filter((c) => !used.includes(c))].slice(0, 6);
  };
  const isHighlighter = () => renderer.penType.alpha < 1;
  const applyPenColor = () => {
    renderer.penColor = isHighlighter() ? penColors.hl : penColors.ink;
    $("tool-pen").style.setProperty("--pen-color", renderer.penColor);
  };

  // ----- the options bar under the toolbar: only what the active tool offers
  const optBox = $("tool-options");
  let optionsOpen = true;
  const group = (label?: string) => { const g = el("div", "opt-group"); if (label) g.appendChild(el("span", "opt-label", label)); optBox.appendChild(g); return g; };
  const chipButton = (parent: HTMLElement, label: string, active: boolean, run: () => void, extra = "") => {
    const b = el("button", `opt-chip${active ? " active" : ""} ${extra}`.trim(), label);
    b.addEventListener("click", run);
    parent.appendChild(b);
  };
  function chooseColor(color: string) {
    color = color.toLowerCase();
    const tool = renderer.activeTool;
    if (renderer.hasSelection()) { renderer.recolorSelection(color); bump("ink", color); return; }
    const kind: Kind = (tool === "pen" || tool === "shape") && isHighlighter() ? "hl" : "ink";
    penColors[kind] = color;
    pref.set(kind === "hl" ? "sn.hl" : "sn.ink", color);
    if (pinned[kind] && !quickColors(kind).includes(color)) { // a new color takes the last slot; the rest of the order stays
      const l = quickColors(kind);
      l[l.length - 1] = color;
      pinned[kind] = l;
      savePinned();
    }
    bump(kind, color);
    applyPenColor();
    renderToolOptions();
  }
  let swatchDragged = false;
  /** Drag a color swatch sideways to a new place; the new order is kept (pinned) for that pen kind. */
  function dragSwatch(e: PointerEvent, b: HTMLElement, index: number, all: HTMLElement[], kind: Kind, list: string[]) {
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
        const next = [...list];
        next.splice(to, 0, ...next.splice(index, 1));
        pinned[kind] = next;
        savePinned();
      }
      renderToolOptions();
    };
    b.addEventListener("pointermove", move);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
  }

  function renderToolOptions() {
    const tool = renderer.activeTool, sel = renderer.hasSelection();
    optBox.innerHTML = "";
    const colorsWanted = sel || tool === "pen" || tool === "shape" || tool === "text";
    const open = sel || (optionsOpen && (colorsWanted || tool === "eraser"));
    optBox.classList.toggle("hidden", !open);
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
      const hl = isHighlighter();
      const sg = group(hl ? "Opacity" : "Pressure");
      const range = document.createElement("input");
      range.type = "range";
      range.className = "opt-range";
      range.min = hl ? "15" : "0";
      range.max = hl ? "70" : "100";
      range.value = String(Math.round((hl ? renderer.penType.alpha : renderer.penType.sensitivity) * 100));
      range.title = hl ? "How transparent the highlighter is" : "Steady (like a ballpoint or marker) to pressure-sensitive (like a fountain pen)";
      range.setAttribute("aria-label", range.title);
      range.addEventListener("input", () => {
        const v = Number(range.value) / 100;
        penSetting[renderer.penType.id] = v;
        pref.set(`sn.pen.${renderer.penType.id}`, String(v));
        renderer.penType = penFor(renderer.penType.id, v);
      });
      sg.appendChild(el("span", "opt-label", hl ? "clear" : "steady"));
      sg.appendChild(range);
      sg.appendChild(el("span", "opt-label", hl ? "solid" : "sensitive"));
    }
    if (!sel && tool === "shape") {
      const g = group("Shape");
      for (const k of SHAPE_KINDS) chipButton(g, k.label, renderer.shapeKind === k.id, () => setShapeKind(k.id));
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
      const list = quickColors(kind);
      const buttons: HTMLElement[] = [];
      list.forEach((c, i) => {
        const b = el("button", `swatch${!sel && c === current ? " active" : ""}`);
        b.style.setProperty("--c", c);
        b.title = sel ? c : `${c} (drag to reorder)`;
        b.addEventListener("click", () => { if (!swatchDragged) chooseColor(c); });
        if (!sel) b.addEventListener("pointerdown", (e) => dragSwatch(e, b, i, buttons, kind, list));
        g.appendChild(b);
        buttons.push(b);
      });
      const custom = el("label", "swatch custom");
      custom.title = "Any color";
      const input = document.createElement("input");
      input.type = "color";
      input.value = current;
      input.addEventListener("change", () => chooseColor(input.value));
      custom.appendChild(input);
      g.appendChild(custom);
      if (!sel && pinned[kind]) chipButton(g, "Auto order", false, () => { delete pinned[kind]; savePinned(); renderToolOptions(); });
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
  }

  function clearCurrentPage() {
    const n = renderer.clearPage();
    showToast(n ? `Page cleared (${n} stroke${n > 1 ? "s" : ""}). Undo brings it back.` : "This page has no drawings.", n ? "success" : "info");
  }

  function setTool(tool: Tool) {
    const changed = renderer.activeTool !== tool;
    if (tool !== "text") closeTextEditor();
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
  renderer.onStrokeDrawn = (st) => {
    const kind: Kind = st.alpha !== undefined && st.alpha < 1 ? "hl" : "ink";
    bump(kind, st.color);
    if (!pinned[kind]) renderToolOptions(); // the most-used order may have changed
  };

  // ---------- page format dialog
  const pmEl = $("page-modal");
  const lastFormat = (): PageFormat => {
    try { const f = JSON.parse(pref.get("sn.format", "")); if (f && f.w && f.h && TEMPLATES.some((t) => t.id === f.template)) return f; } catch { /* default */ }
    return DEFAULT_FORMAT;
  };
  /** Shows the paper / orientation / style chooser. Resolves with the chosen format, or null when cancelled. */
  function askPageFormat(o: { title: string; ok: string; initial: PageFormat; scope?: boolean; sizeLocked?: boolean }): Promise<{ format: PageFormat; all: boolean } | null> {
    return new Promise((resolve) => {
      const start = paperOf(o.initial.w, o.initial.h);
      const st = { paper: start?.paper ?? "a4", orient: (start?.landscape ?? o.initial.w > o.initial.h) ? "landscape" : "portrait", template: o.initial.template as string, scope: "this" };
      $("pm-title").textContent = o.title;
      $("pm-ok").textContent = o.ok;
      $("pm-scope-row").classList.toggle("hidden", !o.scope);
      $("pm-note").classList.toggle("hidden", !o.sizeLocked);
      // each chooser: the box it fills, what it offers, and which field of `st` it sets (the style stays editable on a PDF page)
      const choosers: [string, { id: string; label: string }[], keyof typeof st][] = [
        ["pm-paper", PAPERS, "paper"], ["pm-orient", [{ id: "portrait", label: "Portrait" }, { id: "landscape", label: "Landscape" }], "orient"],
        ["pm-template", TEMPLATES, "template"], ["pm-scope", [{ id: "this", label: "This page" }, { id: "all", label: "All pages" }], "scope"],
      ];
      const fmt = (): PageFormat => (o.sizeLocked ? { ...o.initial, template: st.template as PageTemplate } : pageFormat(st.paper, st.orient === "landscape", st.template as PageTemplate));
      const paint = () => {
        for (const [id, , key] of choosers) {
          $(id).querySelectorAll<HTMLButtonElement>("button").forEach((b) => { b.classList.toggle("active", b.dataset.v === st[key]); b.disabled = !!o.sizeLocked && key !== "template" && key !== "scope"; });
        }
        const f = fmt(), pv = $("pm-preview"), line = "#dfe4ea";
        pv.style.aspectRatio = `${f.w} / ${f.h}`;
        pv.style.width = `${f.w >= f.h ? 150 : Math.round(150 * f.w / f.h)}px`;
        pv.style.backgroundImage = f.template === "ruled" ? `repeating-linear-gradient(#fff 0 14px, ${line} 14px 15px)`
          : f.template === "grid" ? `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
          : f.template === "dots" ? "radial-gradient(#b8c0cc 1.2px, transparent 1.6px)" : "none";
        pv.style.backgroundSize = f.template === "ruled" ? "auto" : "15px 15px";
        $("pm-size").textContent = o.sizeLocked ? "PDF page" : `${PAPERS.find((x) => x.id === st.paper)?.label} · ${st.orient}`;
      };
      for (const [id, items, key] of choosers) {
        const box = $(id);
        box.innerHTML = "";
        for (const it of items) {
          const b = el("button", "", it.label);
          b.dataset.v = it.id;
          b.addEventListener("click", () => { st[key] = it.id; paint(); });
          box.appendChild(b);
        }
      }
      const done = (v: { format: PageFormat; all: boolean } | null) => {
        pmEl.classList.add("hidden");
        $("pm-ok").onclick = $("pm-cancel").onclick = $("pm-close").onclick = null;
        resolve(v);
      };
      $("pm-ok").onclick = () => done({ format: fmt(), all: st.scope === "all" });
      $("pm-cancel").onclick = $("pm-close").onclick = () => done(null);
      paint();
      pmEl.classList.remove("hidden");
    });
  }

  async function createNote() {
    const r = await askPageFormat({ title: "New note", ok: "Create", initial: lastFormat() });
    if (!r) return;
    pref.set("sn.format", JSON.stringify(r.format));
    newNote(r.format);
  }

  // ---------- pages: add / delete / move / format
  const currentPage = () => renderer.pageInfo().index;
  function addNewPage(after: number) {
    const ref = renderer.pageFormatAt(after) ?? lastFormat();
    renderer.addPage({ w: ref.w, h: ref.h, template: ref.template }, after);
  }
  $("add-page-pill").addEventListener("click", () => addNewPage(renderer.pageInfo().total - 1));
  $("page-here").addEventListener("click", (e) => {
    if (!renderer.isStack()) { renderer.fit("width"); return; }
    const anchor = e.currentTarget as HTMLElement, i = currentPage(), total = renderer.pageInfo().total;
    openPopover(anchor, (root) => {
      root.append(el("div", "pop-title", `Page ${i + 1} of ${total}`));
      root.appendChild(popItem("Fit page width", "fitw", () => { closePopover(); renderer.fit("width"); }));
      root.appendChild(popItem("Add page after this one", "plus", () => { closePopover(); addNewPage(i); }));
      root.appendChild(popItem("Add page at the end", "plus", () => { closePopover(); addNewPage(total - 1); }));
      root.appendChild(popItem("Page format…", "sliders", async () => {
        closePopover();
        const cur = renderer.pageFormatAt(i)!;
        const r = await askPageFormat({ title: "Page format", ok: "Apply", initial: cur, scope: true, sizeLocked: renderer.hasBackgroundAt(i) });
        if (!r) return;
        const idx = r.all ? [...Array(total).keys()] : [i];
        renderer.setPageFormat(idx, { w: r.format.w, h: r.format.h, template: r.format.template });
        pref.set("sn.format", JSON.stringify(r.format));
      }));
      if (i > 0) root.appendChild(popItem("Move page up", "chevron", () => { closePopover(); renderer.movePage(i, -1); }));
      if (i < total - 1) root.appendChild(popItem("Move page down", "chevron", () => { closePopover(); renderer.movePage(i, 1); }));
      root.appendChild(el("div", "pop-sep"));
      root.appendChild(popItem("Delete page", "trash", () => {
        closePopover();
        if (total <= 1) { showToast("A note needs at least one page.", "info"); return; }
        if (confirm(`Delete page ${i + 1}?\n\nIts drawings and text are removed from the note. This can't be undone.`)) renderer.deletePage(i);
      }, { danger: true }));
    });
  });

  // ---------- text & math editor
  const MATH_SNIPPETS: [string, string][] = [
    ["a/b", "\\frac{a}{b}"], ["√", "\\sqrt{x}"], ["xⁿ", "x^{n}"], ["xₙ", "x_{n}"], ["Σ", "\\sum_{i=1}^{n}"], ["∫", "\\int_{a}^{b}"],
    ["lim", "\\lim_{x\\to\\infty}"], ["α", "\\alpha"], ["β", "\\beta"], ["π", "\\pi"], ["θ", "\\theta"], ["∞", "\\infty"],
    ["≤", "\\leq"], ["≠", "\\neq"], ["×", "\\times"], ["→", "\\to"], ["( )", "\\left( \\right)"], ["matrix", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"],
  ];
  const te = {
    at: { x: 0, y: 0 }, box: null as ParsedTextBox | null, size: 40, bold: false, italic: false, color: "#000000", timer: 0, seq: 0,
    el: $("text-editor"), input: $<HTMLTextAreaElement>("te-input"), math: $<HTMLInputElement>("te-math"),
    preview: $("te-preview"), snips: $("te-snips"),
  };
  for (const [label, tex] of MATH_SNIPPETS) {
    const b = el("button", "", label);
    b.title = tex;
    b.addEventListener("click", () => {
      const i = te.input, a = i.selectionStart, z = i.selectionEnd;
      i.setRangeText(tex, a, z, "end");
      i.focus();
      refreshPreview();
    });
    te.snips.appendChild(b);
  }
  function closeTextEditor() { te.el.classList.add("hidden"); te.box = null; te.seq++; }
  async function refreshPreview() {
    const mine = ++te.seq;
    te.preview.classList.toggle("hidden", !te.math.checked);
    te.snips.classList.toggle("hidden", !te.math.checked);
    te.input.classList.toggle("mono", te.math.checked);
    if (!te.math.checked) return;
    const latex = te.input.value.trim();
    if (!latex) { te.preview.classList.remove("error"); te.preview.textContent = "Preview appears here"; return; }
    try {
      const r = await renderMath(latex, 30, "#000000");
      if (mine !== te.seq) return;
      te.preview.classList.toggle("error", !!r.error);
      if (r.error) te.preview.textContent = r.error; else te.preview.innerHTML = r.svg;
    } catch (err: any) {
      te.preview.classList.add("error");
      te.preview.textContent = `Could not typeset: ${err.message}`;
    }
  }
  const schedulePreview = () => { clearTimeout(te.timer); te.timer = window.setTimeout(refreshPreview, 150); };
  function openTextEditor(req: { x: number; y: number; clientX: number; clientY: number; box: ParsedTextBox | null }) {
    const b = req.box;
    te.at = { x: req.x, y: req.y };
    te.box = b;
    te.size = b?.fontSize ?? Number(pref.get("sn.textsize", "40"));
    te.bold = !!b?.isBold; te.italic = !!b?.isItalic;
    te.color = b?.color ?? penColors.ink; // text uses the pen colour, never the highlighter's
    const math = !!b && isMathText(b.text);
    te.math.checked = math;
    te.input.value = b ? (math ? latexOf(b.text) : b.text) : "";
    $("te-delete").classList.toggle("hidden", !b);
    $("te-bold").classList.toggle("on", te.bold);
    $("te-italic").classList.toggle("on", te.italic);
    const host = $("canvas-container").getBoundingClientRect();
    te.el.classList.remove("hidden");
    const w = te.el.offsetWidth, h = te.el.offsetHeight;
    te.el.style.left = `${Math.max(10, Math.min(host.width - w - 10, req.clientX - host.left))}px`;
    te.el.style.top = `${Math.max(10, Math.min(host.height - h - 10, req.clientY - host.top + 12))}px`;
    refreshPreview();
    te.input.focus();
  }
  async function commitTextEditor() {
    const math = te.math.checked;
    const raw = te.input.value.replace(/\s+$/, "");
    if (!raw.trim()) { // emptied: that deletes an existing box, or just closes
      if (te.box) renderer.commitTextBox(te.box, null, te.at);
      closeTextEditor();
      return;
    }
    let size: { width: number; height: number };
    let text = raw;
    if (math) {
      const r = await renderMath(raw.trim(), te.size, te.color);
      if (r.error) { showToast(`Fix the formula first: ${r.error}`, "error"); return; }
      size = { width: r.width, height: r.height };
      text = wrapLatex(raw);
    } else {
      size = renderer.measureText(raw, te.size, te.bold, te.italic);
    }
    if (renderer.commitTextBox(te.box, { text, color: te.color, fontSize: te.size, isBold: te.bold, isItalic: te.italic, size }, te.at)) {
      pref.set("sn.textsize", String(te.size));
      closeTextEditor();
    }
  }
  renderer.onTextRequest = openTextEditor;
  te.input.addEventListener("input", schedulePreview);
  te.math.addEventListener("change", refreshPreview);
  te.input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") closeTextEditor();
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void commitTextEditor(); }
  });
  $("te-ok").addEventListener("click", () => void commitTextEditor());
  $("te-cancel").addEventListener("click", closeTextEditor);
  $("te-delete").addEventListener("click", () => { if (te.box) renderer.commitTextBox(te.box, null, te.at); closeTextEditor(); });
  $("te-smaller").addEventListener("click", () => { te.size = Math.max(20, te.size - 8); refreshPreview(); });
  $("te-bigger").addEventListener("click", () => { te.size = Math.min(160, te.size + 8); refreshPreview(); });
  $("te-bold").addEventListener("click", () => { te.bold = !te.bold; $("te-bold").classList.toggle("on", te.bold); });
  $("te-italic").addEventListener("click", () => { te.italic = !te.italic; $("te-italic").classList.toggle("on", te.italic); });

  // ---------- selection: copy / delete / paste buttons
  const syncSelectionButtons = () => {
    const sel = renderer.hasSelection();
    $("sel-copy").classList.toggle("hidden", !sel);
    $("sel-delete").classList.toggle("hidden", !sel);
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
  setTool("pen");

  $("btn-pen-settings").dataset.pop = "1";
  $("btn-pen-settings").addEventListener("click", (e) => {
    const anchor = e.currentTarget as HTMLElement;
    const build = (root: HTMLElement) => {
      root.append(el("div", "pop-title", "Touch & pen"));
      root.appendChild(popItem("Stylus only (palm rejection)", "pen", () => { renderer.stylusOnly = !renderer.stylusOnly; openPopover(anchor, build); }, { checked: renderer.stylusOnly }));
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
        ...(zotero.isConnected() ? [popItem("Save annotated PDF to Zotero", "book", () => sendPdfToZotero(s))] : []),
        popItem("Google Drive…", "cloud", openDriveModal)
      );
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePopover(); modal.classList.add("hidden"); $("zotero-modal").classList.add("hidden"); if (!pmEl.classList.contains("hidden")) $("pm-cancel").click(); }
    if (!inEditor() || (e.target as HTMLElement).closest("input,textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? renderer.redo() : renderer.undo(); }
    else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); renderer.redo(); }
    else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (active) saveSession(active); }
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

  // unsaved work: flush when the tab is hidden, warn when it is closed
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    if (active) park();
    sessions.forEach((s) => { if (isDirty(s)) saveSession(s); });
  });
  window.addEventListener("beforeunload", (e) => {
    if (sessions.some(isDirty)) e.preventDefault();
  });

  // ============================================================ library chrome
  const libView = $("view-library");
  const collapsed = () => libView.classList.contains("side-collapsed");
  const setCollapsed = (v: boolean) => { libView.classList.toggle("side-collapsed", v); pref.set("sn.side", v ? "1" : "0"); };
  setCollapsed(window.innerWidth < 820 || pref.get("sn.side", "0") === "1"); // phones always start with the sidebar hidden
  $("btn-sidebar-toggle").addEventListener("click", () => setCollapsed(true));
  $("btn-sidebar-open").addEventListener("click", () => setCollapsed(false));
  $("lib-main").addEventListener("pointerdown", () => { if (window.innerWidth < 820 && !collapsed()) setCollapsed(true); });

  document.querySelectorAll<HTMLElement>(".side-item").forEach((b) =>
    b.addEventListener("click", () => { ui.filter = b.dataset.filter as "all" | "trash"; renderLibrary(); })
  );
  document.querySelectorAll<HTMLElement>("#lib-tabs button").forEach((b) =>
    b.addEventListener("click", () => { ui.kind = b.dataset.kind as typeof ui.kind; renderLibrary(); })
  );
  $<HTMLInputElement>("lib-search").addEventListener("input", (e) => { ui.query = (e.target as HTMLInputElement).value; renderLibrary(); });

  $("btn-sort").dataset.pop = "1";
  $("btn-sort").addEventListener("click", (e) => {
    openPopover(e.currentTarget as HTMLElement, (root) => {
      for (const [key, label] of [["modified", "Last modified"], ["created", "Date created"], ["title", "Title (A–Z)"]] as const) {
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
        zmodal.classList.add("hidden");
        await openItem(existing.id);
        showToast("That PDF is already in your library: opened it.", "info");
        return;
      }
      showToast(`Downloading "${item.title}" from Zotero…`, "info");
      const data = await zotero.downloadPdf(pdf.key);
      const title = many ? `${item.title} – ${pdf.title}` : item.title;
      const imported = await importBuffer(`${safeFileName(title)}.pdf`, data, undefined, { title, zotero: { attachmentKey: pdf.key, parentKey: pdf.parentKey, title: item.title } });
      zmodal.classList.add("hidden");
      await refreshLibrary();
      scheduleSync();
      await openItem(imported.id);
    } catch (err: any) {
      showToast(`Zotero: ${err.message}`, "error");
      console.error(err);
    }
  }

  function openZotero() {
    zmodal.classList.remove("hidden");
    zoteroStatusUI();
    if (zotero.isConnected() && !zs.started) { zs.started = true; zoteroLoadCollections(); zoteroLoadItems(true); }
  }
  $("side-zotero").addEventListener("click", openZotero);
  $("z-close").addEventListener("click", () => zmodal.classList.add("hidden"));
  zmodal.addEventListener("pointerdown", (e) => { if (e.target === zmodal) zmodal.classList.add("hidden"); });
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
            return !!x && ((x === active && inEditor()) || isDirty(x) || x.inFlight > 0);
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
          importSource: async (file, data) => {
            await importBuffer(file.name, toBuffer(data)); // becomes a normal note; it uploads as its own file next round
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
    modal.classList.remove("hidden");
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
      } catch (err: any) { showToast(err.message, "error"); }
    }
    openDriveModal();
  });
  $("modal-close").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("pointerdown", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

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

  $("btn-google-signin").addEventListener("click", async () => {
    try {
      await drive.startOAuthFlow();
      updateDriveStatusUI();
      loadDriveFiles();
      showToast("Signed in to Google Drive", "success");
      if (await confirmFirstSync()) runSync();
    } catch (err: any) {
      showToast(err.message, "error");
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
        modal.classList.add("hidden");
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
      $("user-email").textContent = user.email;
    } else {
      img.src = "https://www.gstatic.com/images/branding/product/2x/drive_48dp.png";
      $("user-name").textContent = "Not Signed In";
      $("user-email").textContent = "Connect with Google to import notes from Drive and save copies back.";
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
});
