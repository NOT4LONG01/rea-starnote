/**
 * Zotero Web API v3 client (browser, no server). Auth is a user-created API key; the user ID is looked up from the key.
 * Reads the library, downloads stored PDFs, and uploads an annotated PDF as a new attachment.
 * Docs: https://www.zotero.org/support/dev/web_api/v3/basics  and  .../file_upload
 */
import { netFetch } from "./net";

const API = "https://api.zotero.org";
const STORAGE_KEY = "starnote_zotero_key";
const STORAGE_USER = "starnote_zotero_user";

export interface ZoteroKeyInfo {
  userID: number;
  username: string;
  canRead: boolean;
  canWrite: boolean;
  canFiles: boolean;
}
export interface ZoteroCollection { key: string; name: string; parent: string | null }
export interface ZoteroItem {
  key: string;
  type: string;        // journalArticle, book, attachment, ...
  title: string;
  creators: string;    // short summary, e.g. "Smith et al."
  year: string;
  numChildren: number;
  isPdfAttachment: boolean; // a standalone PDF at the top level of the library
  fileStored: boolean;      // for an attachment: Zotero reports a file in its cloud storage (md5 present)
}
/** `stored` = Zotero's cloud has the file. false usually means file syncing is off or the file exists only on one computer. */
export interface ZoteroPdf { key: string; title: string; filename: string; parentKey: string | null; stored: boolean }

/** MD5 (Web Crypto has none, and Zotero's upload authorization requires it). Returns lowercase hex. */
export function md5(bytes: Uint8Array): string {
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const len = bytes.length;
  const padded = new Uint8Array(((len + 8) >> 6 << 6) + 64);
  padded.set(bytes);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, (len << 3) >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(len / 536870912), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a0, true); out.setUint32(4, b0, true); out.setUint32(8, c0, true); out.setUint32(12, d0, true);
  return [...new Uint8Array(out.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class ZoteroClient {
  private key: string | null = localStorage.getItem(STORAGE_KEY);
  private userId: string | null = localStorage.getItem(STORAGE_USER);

  isConnected(): boolean { return !!this.key && !!this.userId; }
  getUserId(): string | null { return this.userId; }

  /** Validates the key with Zotero and remembers it (this browser only). */
  async connect(apiKey: string): Promise<ZoteroKeyInfo> {
    const k = apiKey.trim();
    if (!k) throw new Error("Paste your Zotero API key first.");
    const resp = await this.raw(`${API}/keys/current`, {}, k);
    if (resp.status === 403 || resp.status === 404) throw new Error("Zotero does not recognise that API key.");
    if (!resp.ok) throw new Error(`Zotero ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
    const j = await resp.json();
    const lib = j.access?.user ?? {};
    this.key = k;
    this.userId = String(j.userID);
    localStorage.setItem(STORAGE_KEY, k);
    localStorage.setItem(STORAGE_USER, this.userId);
    return { userID: j.userID, username: j.username ?? "", canRead: !!lib.library, canWrite: !!lib.write, canFiles: !!lib.files };
  }

  disconnect() {
    this.key = null;
    this.userId = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USER);
  }

  // ---------------------------------------------------------------- plumbing
  private async raw(url: string, init: RequestInit = {}, keyOverride?: string): Promise<Response> {
    const key = keyOverride ?? this.key;
    if (!key) throw new Error("Not connected to Zotero.");
    const headers = { "Zotero-API-Key": key, "Zotero-API-Version": "3", ...((init.headers as Record<string, string>) || {}) };
    let resp: Response;
    try {
      resp = await netFetch(url, { ...init, headers });
    } catch (e: any) {
      throw new Error(`Could not reach Zotero (${e?.message || "network error"}).`);
    }
    const backoff = Number(resp.headers.get("Backoff"));
    if (backoff > 0) await new Promise((r) => setTimeout(r, Math.min(backoff, 30) * 1000)); // Zotero asks clients to slow down
    return resp;
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const resp = await this.raw(`${API}/users/${this.userId}${path}`, init);
    if (resp.status === 403) throw new Error("Zotero says this API key may not do that (403). Check its permissions.");
    if (resp.status === 429) throw new Error(`Zotero is rate-limiting requests; try again in ${resp.headers.get("Retry-After") || "a few"} seconds.`);
    if (!resp.ok && resp.status !== 412) throw new Error(`Zotero ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
    return resp;
  }

  // ---------------------------------------------------------------- reading
  async listCollections(): Promise<ZoteroCollection[]> {
    const out: ZoteroCollection[] = [];
    for (let start = 0; ; ) {
      const page = (await (await this.api(`/collections?limit=100&start=${start}`)).json()) as any[];
      for (const c of page) out.push({ key: c.key, name: c.data.name, parent: c.data.parentCollection || null });
      if (page.length < 100) return out;
      start += page.length;
    }
  }

  async listItems(opts: { collection?: string | null; query?: string; start?: number; limit?: number } = {}): Promise<{ items: ZoteroItem[]; total: number; fetched: number }> {
    const base = opts.collection ? `/collections/${encodeURIComponent(opts.collection)}/items/top` : "/items/top";
    const p = new URLSearchParams({ limit: String(opts.limit ?? 50), start: String(opts.start ?? 0), sort: "dateModified", direction: "desc" });
    if (opts.query?.trim()) { p.set("q", opts.query.trim()); p.set("qmode", "titleCreatorYear"); }
    const resp = await this.api(`${base}?${p}`);
    const total = Number(resp.headers.get("Total-Results")) || 0;
    const rows = (await resp.json()) as any[];
    const items: ZoteroItem[] = rows
      .filter((r) => r.data.itemType !== "note")
      .map((r) => ({
        key: r.key,
        type: r.data.itemType,
        title: r.data.title || r.data.filename || "(untitled)",
        creators: r.meta?.creatorSummary || "",
        year: (r.meta?.parsedDate || "").slice(0, 4),
        numChildren: r.meta?.numChildren || 0,
        isPdfAttachment: r.data.itemType === "attachment" && r.data.contentType === "application/pdf" && /^imported_/.test(r.data.linkMode || ""),
        fileStored: !!r.data.md5,
      }));
    return { items, total, fetched: rows.length };
  }

  /** Stored PDFs for an item (its child attachments, or the item itself when it is a standalone PDF). */
  async listPdfs(item: ZoteroItem): Promise<ZoteroPdf[]> {
    if (item.isPdfAttachment) return [{ key: item.key, title: item.title, filename: item.title, parentKey: null, stored: item.fileStored }];
    const rows = (await (await this.api(`/items/${encodeURIComponent(item.key)}/children`)).json()) as any[];
    return rows
      .filter((r) => r.data.itemType === "attachment" && r.data.contentType === "application/pdf" && /^imported_/.test(r.data.linkMode || ""))
      .map((r) => ({ key: r.key, title: r.data.title || r.data.filename || "attachment.pdf", filename: r.data.filename || "attachment.pdf", parentKey: item.key, stored: !!r.data.md5 }));
  }

  async downloadPdf(attachmentKey: string): Promise<ArrayBuffer> {
    let resp: Response;
    try {
      resp = await this.api(`/items/${encodeURIComponent(attachmentKey)}/file`); // 302 to Zotero's file storage
    } catch (e: any) {
      if (/^Zotero 404/.test(e.message)) {
        throw new Error("Zotero has no stored copy of this PDF. In Zotero, turn on file syncing (Settings > Sync) and let this file upload, or it is a linked file that lives only on one computer.");
      }
      if (/Could not reach Zotero/.test(e.message)) {
        throw new Error("The browser could not fetch the PDF from Zotero's file storage (likely a cross-origin block). Zotero only allows its own website to read stored files, so use the desktop app for this.");
      }
      throw e;
    }
    return resp.arrayBuffer();
  }

  // ---------------------------------------------------------------- writing
  /**
   * Uploads `bytes` as a NEW stored PDF attachment (a child of `parentKey`, or top-level when null).
   * Never replaces an existing file. Flow: create item -> authorize upload -> upload -> register.
   */
  async uploadPdf(a: { parentKey: string | null; title: string; filename: string; bytes: Uint8Array }): Promise<{ key: string }> {
    const item: Record<string, unknown> = {
      itemType: "attachment", linkMode: "imported_file", title: a.title, filename: a.filename,
      contentType: "application/pdf", tags: [], relations: {}, collections: [],
    };
    if (a.parentKey) item.parentItem = a.parentKey;

    const created = await (await this.api("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Zotero-Write-Token": crypto.randomUUID().replace(/-/g, "") },
      body: JSON.stringify([item]),
    })).json();
    const key: string | undefined = created.success?.["0"] ?? created.successful?.["0"]?.key;
    if (!key) throw new Error(`Zotero did not create the attachment: ${JSON.stringify(created.failed ?? created).slice(0, 160)}`);

    const form = new URLSearchParams({ md5: md5(a.bytes), filename: a.filename, filesize: String(a.bytes.length), mtime: String(Date.now()) });
    const auth = await (await this.api(`/items/${key}/file`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "If-None-Match": "*" },
      body: form.toString(),
    })).json();
    if (auth.exists) return { key }; // identical file already stored

    const enc = new TextEncoder();
    const pre = enc.encode(auth.prefix ?? ""), suf = enc.encode(auth.suffix ?? "");
    const body = new Uint8Array(pre.length + a.bytes.length + suf.length);
    body.set(pre, 0); body.set(a.bytes, pre.length); body.set(suf, pre.length + a.bytes.length);
    let up: Response;
    try {
      up = await netFetch(auth.url, { method: "POST", headers: { "Content-Type": auth.contentType }, body });
    } catch (e: any) {
      throw new Error(`The PDF could not be sent to Zotero's file storage from the browser (${e?.message || "blocked"}). The (empty) attachment item "${a.title}" was created; delete it in Zotero.`);
    }
    if (!up.ok) throw new Error(`Zotero file storage refused the upload (${up.status}).`);

    await this.api(`/items/${key}/file`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "If-None-Match": "*" },
      body: new URLSearchParams({ upload: auth.uploadKey }).toString(),
    });
    return { key };
  }
}
