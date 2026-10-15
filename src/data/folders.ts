import type { LibraryItem } from "./library";

/**
 * Notebooks are folders in the library: an item of kind "folder" holds notes and other folders through `parentId`
 * (unset = the top level). These helpers are pure, so the library UI, the sync engine and the tests share them.
 */
export const isFolder = (i: LibraryItem) => i.kind === "folder";
export const parentOf = (i: LibraryItem) => i.parentId ?? null;

export const childrenOf = (items: LibraryItem[], parentId: string | null) => items.filter((i) => parentOf(i) === parentId);

/** Everything below a folder, at any depth. */
export function descendantsOf(items: LibraryItem[], id: string): LibraryItem[] {
  const out: LibraryItem[] = [];
  const seen = new Set<string>([id]);
  let layer = [id];
  while (layer.length) {
    const next: string[] = [];
    for (const it of items) {
      const p = parentOf(it);
      if (p && layer.includes(p) && !seen.has(it.id)) { seen.add(it.id); out.push(it); next.push(it.id); }
    }
    layer = next;
  }
  return out;
}

/** The chain of folders from the top level down to (and including) `id`; empty for the top level. Stops at a broken link. */
export function pathOf(items: LibraryItem[], id: string | null): LibraryItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const path: LibraryItem[] = [];
  for (let cur = id ? byId.get(id) : undefined; cur && path.length < 64; cur = cur.parentId ? byId.get(cur.parentId) : undefined) path.unshift(cur);
  return path;
}

/** A folder can't go into itself or into something inside it; the target must be the top level or a live folder. */
export function canMoveTo(items: LibraryItem[], id: string, target: string | null): boolean {
  if (target === null) return true;
  if (target === id) return false;
  const dest = items.find((i) => i.id === target);
  if (!dest || !isFolder(dest) || dest.trashed) return false;
  return !descendantsOf(items, id).some((d) => d.id === target);
}

/** Notes (not folders) below a folder that are not in the trash. */
export const noteCount = (items: LibraryItem[], folderId: string, includeTrashed = false) => descendantsOf(items, folderId).filter((i) => !isFolder(i) && (includeTrashed || !i.trashed)).length;

/**
 * What the Trash shows: trashed items whose folder is not itself trashed. A trashed folder is one card (its contents are
 * trashed with it and come back with it), a note trashed on its own from a live folder is a card of its own.
 */
export function visibleTrash(items: LibraryItem[]): LibraryItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.filter((i) => i.trashed && !(i.parentId && byId.get(i.parentId)?.trashed));
}

/** The folder an item should be shown in: its own, unless that folder is gone or trashed (then the top level). */
export function liveParent(items: LibraryItem[], item: LibraryItem): string | null {
  const p = item.parentId ? items.find((i) => i.id === item.parentId) : undefined;
  return p && isFolder(p) && !p.trashed ? p.id : null;
}
