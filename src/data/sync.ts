import type { LibraryItem } from "./library";
import { isFolder, canMoveTo } from "./folders";

/** A note file in the app's Drive folder. */
export interface RemoteFile {
  id: string;
  name: string;
  modifiedTime: string;
  noteId?: string; // library id stored in the file's appProperties (re-links after local data loss)
  kind?: "note" | "pdf";
  mime?: string;
  parentId?: string; // the Drive folder it is in
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface Remote {
  /** The app's "StarNote" folder: the top level of the library. */
  rootId(): Promise<string>;
  /** Everything below the root folder, files and folders at any depth (each with its `parentId`). */
  list(): Promise<RemoteFile[]>;
  /** Creates or (with `fileId`) replaces a file. `parentId` is where it belongs; when that differs from `fromParentId` it moves. */
  upload(a: { name: string; data: Uint8Array; fileId?: string; noteId: string; kind: "note" | "pdf"; parentId: string; fromParentId?: string }): Promise<RemoteFile>;
  createFolder(a: { name: string; noteId: string; parentId: string }): Promise<RemoteFile>;
  /** Renames and/or moves a folder without touching anything inside it. */
  update(fileId: string, a: { name?: string; parentId?: string; fromParentId?: string }): Promise<RemoteFile>;
  download(fileId: string): Promise<Uint8Array>;
  /** Moves the file to Drive's trash (recoverable there for 30 days). Never a permanent delete. */
  trash(fileId: string): Promise<void>;
}

export interface Local {
  list(): Promise<LibraryItem[]>;
  getBytes(id: string): Promise<Uint8Array | undefined>;
  create(item: LibraryItem, bytes?: Uint8Array): Promise<void>; // a folder has no bytes
  update(id: string, fields: Partial<LibraryItem>, bytes?: Uint8Array): Promise<boolean>;
}

export interface SyncHooks {
  /** Note is open in the editor: never replace it from underneath the user (retried next round). */
  isBusy(id: string): boolean;
  /** Called right before a note's data is replaced from Drive: drop any cached editor session for it. */
  release?(id: string): void;
  /** Drive files the user deleted locally on purpose: do not re-import them. */
  tombstones: ReadonlySet<string>;
  /** Validates downloaded bytes and builds the card thumbnail. Throws on a corrupt archive. */
  inspect(bytes: Uint8Array, kind: "note" | "pdf"): Promise<{ thumb?: string }>;
  /** Files someone else put in the folder (a PDF dragged in from drive.google.com, a .note exported elsewhere). */
  sourceDone?(fileId: string): boolean;
  importSource?(file: RemoteFile, data: Uint8Array, parentId: string | null): Promise<void>;
  newId(): string;
  now(): number;
}

export interface SyncReport {
  uploaded: number;
  pulled: number;
  imported: number;
  conflicts: number;
  importedSources: number;
  trashedRemote: number;  // Drive files moved to Drive's trash because the note was trashed/deleted here
  removedLocal: number;   // notes moved to the app's Trash because the Drive file was trashed there
  restored: number;       // notes re-uploaded because a mass disappearance looked like an emptied folder
  folders: number;        // notebooks created, renamed or moved in either direction
  moved: number;          // notes moved between notebooks in either direction
  skippedBusy: number;
  errors: string[];
}

const baseName = (n: string) => n.replace(/\.(note|zip)$/i, "");
const stamp = (iso: string, fallback: number) => Date.parse(iso) || fallback;

/**
 * Two-way sync between the local library and one Drive folder.
 *
 * Change detection uses only values this app wrote itself (no clock comparison across machines):
 *   local changed  = item.modified > item.syncLocal   (local edit since the last sync)
 *   remote changed = file.modifiedTime !== item.syncRemote
 * Both changed -> the Drive version is kept locally as "<title> (conflict)" and the local one is uploaded.
 *
 * Deletions are mirrored but never permanent: a note trashed/deleted here moves its Drive file to Drive's trash;
 * a Drive file trashed there moves the note to the app's Trash (unless it was edited here since: then it is re-uploaded).
 * A mass disappearance is treated as an emptied folder and restored, not mirrored.
 */
export async function syncLibrary(remote: Remote, local: Local, hooks: SyncHooks): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, pulled: 0, imported: 0, conflicts: 0, importedSources: 0, trashedRemote: 0, removedLocal: 0, restored: 0, folders: 0, moved: 0, skippedBusy: 0, errors: [] };

  // auth/network failures abort the whole round
  const root = await remote.rootId();
  const everything = await remote.list();
  const remoteFolders = everything.filter((r) => r.mime === FOLDER_MIME);
  const remotes = everything.filter((r) => r.mime !== FOLDER_MIME);
  const byId = new Map(everything.map((r) => [r.id, r]));
  const byNote = new Map<string, RemoteFile>();
  for (const r of everything) if (r.noteId) byNote.set(r.noteId, r);

  const items = await local.list();
  const itemById = new Map(items.map((i) => [i.id, i]));
  const localIds = new Set(items.map((i) => i.id));
  const claimed = new Set<string>();
  const driveOfFolder = new Map<string, string>(); // local notebook id -> its Drive folder
  const folderOfDrive = new Map<string, string>(); // Drive folder id -> local notebook id

  /** Updates the stored item and the in-memory copy this round works from. */
  const upd = async (id: string, fields: Partial<LibraryItem>) => {
    await local.update(id, fields);
    const cur = itemById.get(id);
    if (cur) Object.assign(cur, fields);
  };
  const unlink = { syncId: undefined, syncRemote: undefined, syncLocal: undefined, syncParent: undefined };

  // Synced items whose Drive file is gone. A few at once = deliberate deletes in Drive. Many at once = the folder was
  // emptied/recreated or the listing is wrong: restore instead of mirroring.
  const findRemote = (i: LibraryItem) => (i.syncId ? byId.get(i.syncId) : undefined) ?? byNote.get(i.id);
  const synced = items.filter((i) => !i.trashed && i.syncId);
  const vanished = synced.filter((i) => !findRemote(i));
  const massDisappearance = vanished.length >= 3 && vanished.length > synced.length / 2;

  // where an item belongs on Drive: its notebook's folder, or the root when it has none (or its notebook is in the trash)
  const parentDrive = (item: LibraryItem): string | undefined => {
    const p = item.parentId ? itemById.get(item.parentId) : undefined;
    if (!p || !isFolder(p) || p.trashed) return root;
    return driveOfFolder.get(p.id) ?? p.syncId;
  };
  // the local notebook a Drive folder stands for (null: the top level, or a folder this library does not have)
  const localParentOf = (rf: RemoteFile): string | null => {
    const d = rf.parentId;
    const id = d && d !== root ? folderOfDrive.get(d) : undefined;
    const p = id ? itemById.get(id) : undefined;
    return p && !p.trashed ? p.id : null;
  };
  const link = (folderId: string, driveId: string) => { driveOfFolder.set(folderId, driveId); folderOfDrive.set(driveId, folderId); };
  for (const f of items) if (isFolder(f)) { const rf = findRemote(f); if (rf) link(f.id, rf.id); } // so a folder can name a parent that comes later in the loop

  // ---------------------------------------------------------------- notebooks (folders), parents before children
  const depth = (f: LibraryItem) => { let d = 0; for (let c: LibraryItem | undefined = f; c?.parentId && d < 64; d++) c = itemById.get(c.parentId); return d; };
  for (const f of items.filter(isFolder).sort((a, b) => depth(a) - depth(b))) {
    try {
      const rf = findRemote(f);
      if (rf) claimed.add(rf.id);

      if (f.trashed) {
        if (rf) { await remote.trash(rf.id); await upd(f.id, unlink); report.trashedRemote++; }
        continue;
      }

      const target = parentDrive(f);
      if (!target) throw new Error("the notebook it is in is not on Drive yet");

      if (!rf) {
        const editedHere = f.modified > (f.syncLocal ?? 0);
        if (f.syncId && !massDisappearance && !editedHere) { // trashed in Drive: the notebook goes to the app's Trash (what was inside follows, item by item)
          await upd(f.id, { trashed: true, ...unlink });
          report.removedLocal++;
          continue;
        }
        if (f.syncId && massDisappearance) report.restored++;
        const made = await remote.createFolder({ name: f.title, noteId: f.id, parentId: target });
        await upd(f.id, { syncId: made.id, syncRemote: made.modifiedTime, syncLocal: f.modified, syncParent: target });
        link(f.id, made.id);
        report.folders++;
        continue;
      }

      const known = f.syncParent ?? root;
      const localChanged = f.modified > (f.syncLocal ?? 0);
      const remoteChanged = rf.modifiedTime !== f.syncRemote || (rf.parentId ?? root) !== known;
      if (!localChanged && !remoteChanged) continue;

      if (localChanged) { // a rename or move here wins: it is cheap to redo and never loses a note
        let out = rf;
        if (rf.name !== f.title || (rf.parentId ?? root) !== target) out = await remote.update(rf.id, { name: f.title, parentId: target, fromParentId: rf.parentId });
        await upd(f.id, { syncId: rf.id, syncRemote: out.modifiedTime, syncLocal: f.modified, syncParent: target });
      } else { // changed in Drive: take its name and place
        const into = localParentOf(rf);
        const t = hooks.now(); // local clock, see importFile
        await upd(f.id, { title: rf.name, parentId: into && canMoveTo([...itemById.values()], f.id, into) ? into : f.parentId, modified: t, syncRemote: rf.modifiedTime, syncLocal: t, syncParent: rf.parentId ?? root });
      }
      report.folders++;
    } catch (e: any) {
      report.errors.push(`${f.title}: ${e?.message ?? e}`);
    }
  }

  // notebooks that exist only in Drive (made on another device): shallowest first, so a parent exists before its children
  const rdepth = (f: RemoteFile) => { let d = 0; for (let c: RemoteFile | undefined = f; c?.parentId && d < 64; d++) c = byId.get(c.parentId); return d; };
  for (const rf of remoteFolders.sort((a, b) => rdepth(a) - rdepth(b))) {
    if (claimed.has(rf.id)) continue;
    try {
      if (hooks.tombstones.has(rf.id)) { await remote.trash(rf.id); report.trashedRemote++; continue; } // deleted here on purpose
      if (!rf.noteId) continue; // not made by this app
      const t = hooks.now();
      const item: LibraryItem = {
        id: !localIds.has(rf.noteId) ? rf.noteId : hooks.newId(),
        title: rf.name, kind: "folder", created: stamp(rf.modifiedTime, t), modified: t, trashed: false,
        parentId: localParentOf(rf) ?? undefined, syncId: rf.id, syncRemote: rf.modifiedTime, syncLocal: t, syncParent: rf.parentId ?? root,
      };
      await local.create(item);
      localIds.add(item.id); itemById.set(item.id, item);
      link(item.id, rf.id);
      claimed.add(rf.id);
      report.folders++;
    } catch (e: any) {
      report.errors.push(`${rf.name}: ${e?.message ?? e}`);
    }
  }

  // ---------------------------------------------------------------- notes
  const upload = async (item: LibraryItem, rf?: RemoteFile) => {
    const parent = parentDrive(item);
    if (!parent) throw new Error("the notebook it is in is not on Drive yet");
    const bytes = await local.getBytes(item.id);
    if (!bytes) throw new Error("note data is missing");
    const out = await remote.upload({ name: `${item.title}.note`, data: bytes, fileId: rf?.id, noteId: item.id, kind: item.kind as "note" | "pdf", parentId: parent, fromParentId: rf?.parentId });
    // Only the sync fields are written: a save that landed meanwhile keeps its newer `modified` and re-syncs next round.
    await local.update(item.id, { syncId: out.id, syncRemote: out.modifiedTime, syncLocal: item.modified, syncParent: parent });
    report.uploaded++;
  };

  const importFile = async (rf: RemoteFile, opts: { title?: string; forceNewId?: boolean; link: boolean; parentId?: string | null }) => {
    const bytes = await remote.download(rf.id);
    const kind = rf.kind ?? "note";
    const info = await hooks.inspect(bytes, kind);
    const created = stamp(rf.modifiedTime, hooks.now());
    const t = hooks.now(); // local clock: `modified` and `syncLocal` must only ever be compared with each other
    const wantId = rf.noteId && !localIds.has(rf.noteId) && !opts.forceNewId ? rf.noteId : hooks.newId();
    const parent = opts.parentId !== undefined ? opts.parentId : localParentOf(rf);
    const item: LibraryItem = {
      id: wantId,
      title: opts.title ?? baseName(rf.name),
      kind,
      created,
      modified: t,
      trashed: false,
      thumb: info.thumb,
      ...(parent ? { parentId: parent } : {}),
      ...(opts.link ? { syncId: rf.id, syncRemote: rf.modifiedTime, syncLocal: t, syncParent: rf.parentId ?? root } : {}),
    };
    await local.create(item, bytes);
    localIds.add(item.id);
  };

  for (const item of items) {
    if (isFolder(item)) continue;
    try {
      const rf = findRemote(item);
      if (rf) claimed.add(rf.id);

      if (item.trashed) {
        if (rf) { // trashed here -> Drive trash. Unlink so a later restore uploads a fresh file instead of looking "deleted in Drive".
          await remote.trash(rf.id);
          await local.update(item.id, unlink);
          report.trashedRemote++;
        }
        continue;
      }

      if (!rf) {
        const editedHere = item.modified > (item.syncLocal ?? 0);
        if (item.syncId && !massDisappearance && !editedHere) { // deliberately trashed in Drive -> app Trash (recoverable)
          if (hooks.isBusy(item.id)) { report.skippedBusy++; continue; }
          hooks.release?.(item.id);
          await local.update(item.id, { trashed: true, ...unlink });
          report.removedLocal++;
          continue;
        }
        if (item.syncId && massDisappearance) report.restored++;
        await upload(item); // never synced, edited since, or looks like a wiped folder: (re)create the file
        continue;
      }

      const known = item.syncParent ?? root; // a note synced before notebooks existed is at the root
      const target = parentDrive(item);
      const localChanged = item.modified > (item.syncLocal ?? 0);
      const remoteChanged = rf.modifiedTime !== item.syncRemote;
      const remoteMoved = (rf.parentId ?? root) !== known;
      if (!localChanged && !remoteChanged && !remoteMoved) continue;

      if (remoteChanged && hooks.isBusy(item.id)) { report.skippedBusy++; continue; }

      if (remoteChanged && localChanged) {
        await importFile(rf, { title: `${baseName(rf.name)} (conflict)`, forceNewId: true, link: false, parentId: item.parentId ?? null });
        report.conflicts++;
        await upload(item, rf);
      } else if (remoteChanged) {
        const bytes = await remote.download(rf.id);
        const info = await hooks.inspect(bytes, item.kind as "note" | "pdf");
        const t = hooks.now(); // local clock, see importFile
        hooks.release?.(item.id);
        const fields: Partial<LibraryItem> = { title: baseName(rf.name), modified: t, thumb: info.thumb, syncId: rf.id, syncRemote: rf.modifiedTime, syncLocal: t, syncParent: rf.parentId ?? root };
        if (remoteMoved) { fields.parentId = localParentOf(rf) ?? undefined; report.moved++; }
        await local.update(item.id, fields, bytes);
        report.pulled++;
      } else if (localChanged) {
        if (target !== known) report.moved++;
        await upload(item, rf); // edited and/or moved here (a move in Drive meanwhile loses to the local one)
      } else { // only moved in Drive: follow it, nothing to transfer
        const t = hooks.now();
        await local.update(item.id, { parentId: localParentOf(rf) ?? undefined, modified: t, syncLocal: t, syncParent: rf.parentId ?? root });
        report.moved++;
      }
    } catch (e: any) {
      report.errors.push(`${item.title}: ${e?.message ?? e}`);
    }
  }

  for (const rf of remotes) {
    if (claimed.has(rf.id)) continue;
    try {
      if (hooks.tombstones.has(rf.id)) { // deleted here on purpose: make sure the Drive copy is in Drive's trash too
        await remote.trash(rf.id);
        report.trashedRemote++;
        continue;
      }
      if (!rf.noteId) {
        // Not written by this app. Import PDFs and .note files once as NEW notes; the original stays untouched
        // (this app has no write access to it, so it can never be linked and updated). Anything else is ignored.
        const isPdf = rf.mime === "application/pdf" || /\.pdf$/i.test(rf.name);
        if (!(isPdf || /\.note$/i.test(rf.name)) || !hooks.importSource || hooks.sourceDone?.(rf.id)) continue;
        await hooks.importSource(rf, await remote.download(rf.id), localParentOf(rf));
        report.importedSources++;
        continue;
      }
      await importFile(rf, { link: true });
      report.imported++;
    } catch (e: any) {
      report.errors.push(`${rf.name}: ${e?.message ?? e}`);
    }
  }

  return report;
}
