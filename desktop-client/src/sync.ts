import type { LibraryItem } from "./library";

/** A note file in the app's Drive folder. */
export interface RemoteFile {
  id: string;
  name: string;
  modifiedTime: string;
  noteId?: string; // library id stored in the file's appProperties (re-links after local data loss)
  kind?: "note" | "pdf";
  mime?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface Remote {
  list(): Promise<RemoteFile[]>;
  upload(a: { name: string; data: Uint8Array; fileId?: string; noteId: string; kind: "note" | "pdf" }): Promise<RemoteFile>;
  download(fileId: string): Promise<Uint8Array>;
  /** Moves the file to Drive's trash (recoverable there for 30 days). Never a permanent delete. */
  trash(fileId: string): Promise<void>;
}

export interface Local {
  list(): Promise<LibraryItem[]>;
  getBytes(id: string): Promise<Uint8Array | undefined>;
  create(item: LibraryItem, bytes: Uint8Array): Promise<void>;
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
  importSource?(file: RemoteFile, data: Uint8Array): Promise<void>;
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
  const report: SyncReport = { uploaded: 0, pulled: 0, imported: 0, conflicts: 0, importedSources: 0, trashedRemote: 0, removedLocal: 0, restored: 0, skippedBusy: 0, errors: [] };

  // auth/network failures abort the whole round; sub-folders are never notes
  const remotes = (await remote.list()).filter((r) => r.mime !== FOLDER_MIME);
  const byId = new Map(remotes.map((r) => [r.id, r]));
  const byNote = new Map<string, RemoteFile>();
  for (const r of remotes) if (r.noteId) byNote.set(r.noteId, r);

  const items = await local.list();
  const localIds = new Set(items.map((i) => i.id));
  const claimed = new Set<string>();

  // Synced notes whose Drive file is gone. A few at once = deliberate deletes in Drive. Many at once = the folder was
  // emptied/recreated or the listing is wrong: restore instead of mirroring.
  const findRemote = (i: LibraryItem) => (i.syncId ? byId.get(i.syncId) : undefined) ?? byNote.get(i.id);
  const synced = items.filter((i) => !i.trashed && i.syncId);
  const vanished = synced.filter((i) => !findRemote(i));
  const massDisappearance = vanished.length >= 3 && vanished.length > synced.length / 2;

  const upload = async (item: LibraryItem, fileId?: string) => {
    const bytes = await local.getBytes(item.id);
    if (!bytes) throw new Error("note data is missing");
    const rf = await remote.upload({ name: `${item.title}.note`, data: bytes, fileId, noteId: item.id, kind: item.kind });
    // Only the sync fields are written: a save that landed meanwhile keeps its newer `modified` and re-syncs next round.
    await local.update(item.id, { syncId: rf.id, syncRemote: rf.modifiedTime, syncLocal: item.modified });
    report.uploaded++;
  };

  const importFile = async (rf: RemoteFile, opts: { title?: string; forceNewId?: boolean; link: boolean }) => {
    const bytes = await remote.download(rf.id);
    const kind = rf.kind ?? "note";
    const info = await hooks.inspect(bytes, kind);
    const created = stamp(rf.modifiedTime, hooks.now());
    const t = hooks.now(); // local clock: `modified` and `syncLocal` must only ever be compared with each other
    const wantId = rf.noteId && !localIds.has(rf.noteId) && !opts.forceNewId ? rf.noteId : hooks.newId();
    const item: LibraryItem = {
      id: wantId,
      title: opts.title ?? baseName(rf.name),
      kind,
      created,
      modified: t,
      trashed: false,
      thumb: info.thumb,
      ...(opts.link ? { syncId: rf.id, syncRemote: rf.modifiedTime, syncLocal: t } : {}),
    };
    await local.create(item, bytes);
    localIds.add(item.id);
  };

  for (const item of items) {
    try {
      const rf = findRemote(item);
      if (rf) claimed.add(rf.id);

      if (item.trashed) {
        if (rf) { // trashed here -> Drive trash. Unlink so a later restore uploads a fresh file instead of looking "deleted in Drive".
          await remote.trash(rf.id);
          await local.update(item.id, { syncId: undefined, syncRemote: undefined, syncLocal: undefined });
          report.trashedRemote++;
        }
        continue;
      }

      if (!rf) {
        const editedHere = item.modified > (item.syncLocal ?? 0);
        if (item.syncId && !massDisappearance && !editedHere) { // deliberately trashed in Drive -> app Trash (recoverable)
          if (hooks.isBusy(item.id)) { report.skippedBusy++; continue; }
          hooks.release?.(item.id);
          await local.update(item.id, { trashed: true, syncId: undefined, syncRemote: undefined, syncLocal: undefined });
          report.removedLocal++;
          continue;
        }
        if (item.syncId && massDisappearance) report.restored++;
        await upload(item); // never synced, edited since, or looks like a wiped folder: (re)create the file
        continue;
      }

      const localChanged = item.modified > (item.syncLocal ?? 0);
      const remoteChanged = rf.modifiedTime !== item.syncRemote;
      if (!localChanged && !remoteChanged) continue;

      if (remoteChanged && hooks.isBusy(item.id)) { report.skippedBusy++; continue; }

      if (remoteChanged && localChanged) {
        await importFile(rf, { title: `${baseName(rf.name)} (conflict)`, forceNewId: true, link: false });
        report.conflicts++;
        await upload(item, rf.id);
      } else if (remoteChanged) {
        const bytes = await remote.download(rf.id);
        const info = await hooks.inspect(bytes, item.kind);
        const t = hooks.now(); // local clock, see importFile
        hooks.release?.(item.id);
        await local.update(item.id, { title: baseName(rf.name), modified: t, thumb: info.thumb, syncId: rf.id, syncRemote: rf.modifiedTime, syncLocal: t }, bytes);
        report.pulled++;
      } else {
        await upload(item, rf.id);
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
        await hooks.importSource(rf, await remote.download(rf.id));
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
