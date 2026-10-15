/**
 * Google Drive API v3 & Google Identity Services token client
 * Cross-platform support for Windows, Linux, Android, and Web.
 */

import type { Remote, RemoteFile } from "./sync";
import { isDesktopApp, netFetch, openInBrowser, nativeInvoke } from "./net";

export interface GoogleDriveUser {
  name: string;
  email: string;
  picture?: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  size?: number;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string; // Desktop-app OAuth clients only; Google does not treat it as confidential for installed apps
  scopes: string[];
}

const STORAGE_KEY_TOKEN = "starnote_gdrive_access_token";
const STORAGE_KEY_SYNC_FOLDER = "starnote_gdrive_sync_folder";
const SYNC_FOLDER_NAME = "StarNote";
const STORAGE_KEY_EXPIRY = "starnote_gdrive_token_expiry";
const STORAGE_KEY_REFRESH = "starnote_gdrive_refresh_token";
const STORAGE_KEY_SECRET = "starnote_gdrive_client_secret";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STORAGE_KEY_USER = "starnote_gdrive_user";
const STORAGE_KEY_CLIENT_ID = "starnote_gdrive_client_id";
// The desktop app needs a Desktop-type OAuth client; the web app needs a Web-type one. They must never share a saved ID.
const clientIdKey = () => (isDesktopApp() ? "starnote_gdrive_desktop_client_id" : STORAGE_KEY_CLIENT_ID);
const STORAGE_KEY_MOCK_MODE = "starnote_gdrive_mock_mode";

export class GoogleDriveService {
  private config: GoogleDriveConfig;
  private accessToken: string | null = null;
  private refreshToken: string | null = localStorage.getItem(STORAGE_KEY_REFRESH);
  private refreshing: Promise<void> | null = null;
  private user: GoogleDriveUser | null = null;
  private mockMode: boolean = false;

  // Mock cloud files for instant testing / offline demo
  private mockFiles: GoogleDriveFile[] = [
    {
      id: "mock-note-001",
      name: "Quantum_QEC_Notes.note",
      size: 45620,
      mimeType: "application/octet-stream",
      modifiedTime: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: "mock-note-002",
      name: "Stylus_Sketch_Draft.note",
      size: 38410,
      mimeType: "application/octet-stream",
      modifiedTime: new Date(Date.now() - 3600000 * 24).toISOString(),
    },
    {
      id: "mock-note-003",
      name: "StarNote_Sample.note",
      size: 28912,
      mimeType: "application/octet-stream",
      modifiedTime: new Date(Date.now() - 3600000 * 72).toISOString(),
    }
  ];

  constructor() {
    const savedClientId = localStorage.getItem(clientIdKey()) || ""; // the desktop app has its own key: a saved web ID must never be reused (it can't tell which type an old value was)
    this.config = {
      clientId: savedClientId,
      clientSecret: localStorage.getItem(STORAGE_KEY_SECRET) || "",
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email"
      ]
    };

    this.accessToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    if (savedUser) {
      try {
        this.user = JSON.parse(savedUser);
      } catch {
        this.user = null;
      }
    }

    this.mockMode = localStorage.getItem(STORAGE_KEY_MOCK_MODE) === "true";
  }

  public isConnected(): boolean {
    if (this.mockMode) return true;
    if (this.refreshToken) return true; // desktop sign-in: access tokens are renewed silently
    if (!this.accessToken) return false;
    const exp = Number(localStorage.getItem(STORAGE_KEY_EXPIRY));
    return !exp || Date.now() < exp; // pasted tokens have no recorded expiry
  }

  public isMockMode(): boolean {
    return this.mockMode;
  }

  public setMockMode(enabled: boolean) {
    this.mockMode = enabled;
    localStorage.setItem(STORAGE_KEY_MOCK_MODE, enabled ? "true" : "false");
    if (enabled && !this.user) {
      this.user = {
        name: "Android/Desktop Demo User",
        email: "starnote.sync@google.com",
        picture: "https://www.gstatic.com/images/branding/product/2x/drive_48dp.png"
      };
    }
  }

  public getClientId(): string {
    return this.config.clientId;
  }

  public getClientSecret(): string {
    return this.config.clientSecret;
  }

  public setClientSecret(secret: string) {
    this.config.clientSecret = secret.trim();
    if (this.config.clientSecret) localStorage.setItem(STORAGE_KEY_SECRET, this.config.clientSecret);
    else localStorage.removeItem(STORAGE_KEY_SECRET);
  }

  public setClientId(clientId: string) {
    this.config.clientId = clientId.trim();
    localStorage.setItem(clientIdKey(), this.config.clientId);
  }

  public getUser(): GoogleDriveUser | null {
    if (this.mockMode && !this.user) {
      return {
        name: "Google Drive Connected",
        email: "drive-user@gmail.com",
        picture: "https://www.gstatic.com/images/branding/product/2x/drive_48dp.png"
      };
    }
    return this.user;
  }

  /** The "Authorized JavaScript origin" to register in Google Cloud Console. */
  public getRedirectUri(): string {
    return window.location.origin;
  }

  /**
   * Directly sets an access token (e.g. from gcloud or OAuth playground).
   */
  public async setAccessToken(token: string): Promise<boolean> {
    const trimmed = token.trim();
    const prevMock = this.mockMode;
    if (!trimmed) {
      this.logout();
      if (prevMock) {
        this.mockMode = true;
        localStorage.setItem(STORAGE_KEY_MOCK_MODE, "true");
      }
      return false;
    }
    this.accessToken = trimmed;
    this.refreshToken = null;
    localStorage.removeItem(STORAGE_KEY_REFRESH);
    localStorage.setItem(STORAGE_KEY_TOKEN, trimmed);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    this.mockMode = false;
    localStorage.setItem(STORAGE_KEY_MOCK_MODE, "false");

    try {
      const user = await this.refreshUserProfile();
      if (!user) {
        this.logout();
        if (prevMock) {
          this.mockMode = true;
          localStorage.setItem(STORAGE_KEY_MOCK_MODE, "true");
        }
        return false;
      }
      return true;
    } catch (e) {
      console.warn("Invalid access token:", e);
      this.logout();
      if (prevMock) {
        this.mockMode = true;
        localStorage.setItem(STORAGE_KEY_MOCK_MODE, "true");
      }
      return false;
    }
  }

  /** Loads accounts.google.com/gsi/client on demand (survives a blocked or not-yet-loaded script tag). */
  private loadGis(): Promise<any> {
    const ready = () => (window as any).google?.accounts?.oauth2;
    if (ready()) return Promise.resolve(ready());
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "https://accounts.google.com/gsi/client";
      el.onload = () => (ready() ? resolve(ready()) : reject(new Error("Google sign-in script loaded but unusable.")));
      el.onerror = () => reject(new Error(
        "Could not load https://accounts.google.com/gsi/client. Check for an ad/privacy blocker or network block on accounts.google.com."
      ));
      document.head.appendChild(el);
    });
  }

  /**
   * Google Identity Services token flow: popup consent, no client secret, ~1h access token.
   * ponytail: no refresh token; the user re-clicks Sign in after expiry.
   */
  public async startOAuthFlow(): Promise<void> {
    if (isDesktopApp()) return this.startDesktopOAuthFlow();
    if (!this.config.clientId) {
      throw new Error("Please enter your Google Cloud OAuth 2.0 Client ID in Settings first.");
    }
    const gis = await this.loadGis();

    const resp: any = await new Promise((resolve, reject) => {
      const client = gis.initTokenClient({
        client_id: this.config.clientId,
        scope: this.config.scopes.join(" "),
        callback: resolve,
        error_callback: (e: any) => reject(new Error(`Google sign-in failed: ${e?.type || e?.message || "unknown"}`)),
      });
      client.requestAccessToken({ prompt: "select_account" });
    });

    if (resp.error) throw new Error(`Google sign-in failed: ${resp.error_description || resp.error}`);

    this.accessToken = resp.access_token;
    localStorage.setItem(STORAGE_KEY_TOKEN, this.accessToken!);
    localStorage.setItem(STORAGE_KEY_EXPIRY, String(Date.now() + (Number(resp.expires_in) || 3600) * 1000));
    this.mockMode = false;
    localStorage.setItem(STORAGE_KEY_MOCK_MODE, "false");
    await this.refreshUserProfile();
  }

  // ------------------------------------------------------------------
  // Desktop app: system-browser sign-in (PKCE) with a loopback redirect, and silent token renewal
  // ------------------------------------------------------------------

  private static randomString(n: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(bytes, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66]).join("");
  }

  private static async challengeFor(verifier: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  private storeTokens(t: { access_token: string; expires_in?: number; refresh_token?: string }) {
    this.accessToken = t.access_token;
    localStorage.setItem(STORAGE_KEY_TOKEN, t.access_token);
    localStorage.setItem(STORAGE_KEY_EXPIRY, String(Date.now() + (Number(t.expires_in) || 3600) * 1000));
    if (t.refresh_token) {
      this.refreshToken = t.refresh_token;
      localStorage.setItem(STORAGE_KEY_REFRESH, t.refresh_token);
    }
    this.mockMode = false;
    localStorage.setItem(STORAGE_KEY_MOCK_MODE, "false");
  }

  private async startDesktopOAuthFlow(): Promise<void> {
    if (!this.config.clientId) {
      throw new Error('Enter your Google OAuth client ID (type "Desktop app") in Settings first.');
    }
    const verifier = GoogleDriveService.randomString(64);
    const state = GoogleDriveService.randomString(24);
    const port = await nativeInvoke<number>("loopback_start");
    const redirectUri = `http://127.0.0.1:${port}`;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.config.scopes.join(" "));
    url.searchParams.set("code_challenge", await GoogleDriveService.challengeFor(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline"); // ask for a refresh token...
    url.searchParams.set("prompt", "consent");      // ...even when consent was given before
    await openInBrowser(url.toString());

    const reply = await nativeInvoke<{ code?: string | null; state?: string | null; error?: string | null }>("loopback_wait", { timeoutSecs: 300 });
    if (reply.error) throw new Error(`Google sign-in failed: ${reply.error}`);
    if (reply.state !== state) throw new Error("Google sign-in came back with an unexpected state; please try again.");
    if (!reply.code) throw new Error("Google sign-in did not return a code.");

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      code: reply.code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    if (this.config.clientSecret) body.set("client_secret", this.config.clientSecret);
    const resp = await netFetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.access_token) {
      throw new Error(`Google sign-in failed: ${data.error_description || data.error || resp.status}`);
    }
    this.storeTokens(data);
    await this.refreshUserProfile();
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.config.clientId) throw new Error("The Google Client ID is missing. Open Settings in the Drive dialog and enter it again, then sign in.");
    const body = new URLSearchParams({ client_id: this.config.clientId, grant_type: "refresh_token", refresh_token: this.refreshToken! });
    if (this.config.clientSecret) body.set("client_secret", this.config.clientSecret);
    const resp = await netFetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.access_token) {
      if (data.error === "invalid_grant") { // revoked, or a test-mode token past its 7 days
        this.logout();
        throw new Error("Google Drive session expired. Please sign in again.");
      }
      throw new Error(`Could not renew the Google sign-in (${data.error || resp.status}).`);
    }
    this.storeTokens(data);
  }

  /** A usable access token, renewed with the refresh token first when it has (nearly) expired. */
  private async token(): Promise<string> {
    const exp = Number(localStorage.getItem(STORAGE_KEY_EXPIRY));
    const fresh = this.accessToken && !(exp && Date.now() > exp - 60_000);
    if (fresh) return this.accessToken!;
    if (this.refreshToken) {
      this.refreshing ??= this.refreshAccessToken().finally(() => { this.refreshing = null; }); // one renewal for concurrent calls
      await this.refreshing;
      if (this.accessToken) return this.accessToken;
    }
    throw new Error("Not authenticated with Google Drive.");
  }

  /**
   * Retrieves logged-in Google profile.
   */
  public async refreshUserProfile(): Promise<GoogleDriveUser | null> {
    if (!this.isConnected()) return null;
    const tok = await this.token();

    try {
      const resp = await netFetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tok}` },
      });

      if (!resp.ok) {
        if (resp.status === 401) {
          this.logout();
        }
        return null;
      }

      const data = await resp.json();
      this.user = {
        name: data.name || data.email,
        email: data.email,
        picture: data.picture,
      };
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));
      return this.user;
    } catch (e) {
      console.warn("Failed to fetch user profile:", e);
      return null;
    }
  }

  /**
   * Lists .note files in Google Drive.
   */
  public async listNoteFiles(searchQuery?: string): Promise<GoogleDriveFile[]> {
    if (this.mockMode) {
      if (!searchQuery) return this.mockFiles;
      const lower = searchQuery.toLowerCase();
      return this.mockFiles.filter(f => f.name.toLowerCase().includes(lower));
    }

    const tok = await this.token();

    // Query for files ending with .note or .pdf or containing search term
    let q = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
    if (searchQuery && searchQuery.trim()) {
      const sanitized = searchQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      q += ` and name contains '${sanitized}' and (name contains '.note' or name contains '.pdf' or fileExtension = 'note' or fileExtension = 'pdf')`;
    } else {
      q += " and (name contains '.note' or name contains '.pdf' or fileExtension = 'note' or fileExtension = 'pdf' or mimeType = 'application/pdf')";
    }

    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "files(id, name, size, mimeType, modifiedTime, webViewLink, iconLink)");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "50");

    const resp = await netFetch(url.toString(), {
      headers: { Authorization: `Bearer ${tok}` },
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        this.logout();
        throw new Error("Google Drive session expired. Please sign in again.");
      }
      const errText = await resp.text();
      throw new Error(`Failed to list files from Drive: ${errText}`);
    }

    const data = await resp.json();
    return data.files || [];
  }

  /**
   * Downloads a .note or .pdf file from Google Drive as binary ArrayBuffer.
   */
  public async downloadFile(fileId: string): Promise<{ data: ArrayBuffer; filename: string }> {
    if (this.mockMode) {
      const file = this.mockFiles.find(f => f.id === fileId) || this.mockFiles[0];
      const sampleUrl = file.name.toLowerCase().endsWith(".pdf") ? "./samples/sample.pdf" : "./samples/test.note";
      const resp = await fetch(sampleUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const u8 = new Uint8Array(buf);
        // Verify ZIP magic bytes PK\x03\x04 or PDF magic %PDF-
        const isZip = u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B;
        const isPdf = u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50;
        if (isZip || isPdf) {
          return { data: buf, filename: file.name };
        }
      }
      throw new Error(`Demo sample file unavailable at ${sampleUrl}.`);
    }

    const tok = await this.token();

    // 1. Get metadata for filename
    const metaResp = await netFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const filename = metaResp.ok ? (await metaResp.json()).name : "document.note";

    // 2. Download media
    const resp = await netFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${tok}` },
    });

    if (!resp.ok) {
      throw new Error(`Failed to download file from Google Drive: ${resp.statusText}`);
    }

    const data = await resp.arrayBuffer();
    return { data, filename };
  }

  /**
   * Uploads or updates a .note archive in Google Drive.
   */
  public async uploadNoteFile(
    filename: string,
    data: Uint8Array,
    existingFileId?: string
  ): Promise<GoogleDriveFile> {
    if (this.mockMode) {
      const mockFile: GoogleDriveFile = {
        id: existingFileId || `mock-note-${Date.now()}`,
        name: filename,
        size: data.byteLength,
        mimeType: "application/octet-stream",
        modifiedTime: new Date().toISOString(),
      };
      if (existingFileId) {
        const idx = this.mockFiles.findIndex(f => f.id === existingFileId);
        if (idx >= 0) this.mockFiles[idx] = mockFile;
      } else {
        this.mockFiles.unshift(mockFile);
      }
      return mockFile;
    }

    const tok = await this.token();

    const metadata = {
      name: filename,
      mimeType: "application/octet-stream",
    };

    const boundary = "-------StarNoteMultipartBoundary" + Math.random().toString(36).substring(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataContentType = "application/json; charset=UTF-8";
    const mediaContentType = "application/octet-stream";

    // Build multipart body
    const enc = new TextEncoder();
    const part1 = enc.encode(
      delimiter +
      `Content-Type: ${metadataContentType}\r\n\r\n` +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mediaContentType}\r\n\r\n`
    );
    const part2 = enc.encode(closeDelimiter);

    const fullPayload = new Uint8Array(part1.byteLength + data.byteLength + part2.byteLength);
    fullPayload.set(part1, 0);
    fullPayload.set(data, part1.byteLength);
    fullPayload.set(part2, part1.byteLength + data.byteLength);

    const url = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

    const method = existingFileId ? "PATCH" : "POST";

    const resp = await netFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: fullPayload,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Drive upload failed: ${err}`);
    }

    return await resp.json();
  }

  /**
   * Uploads an exported SVG vector rendering directly to Google Drive.
   */
  // ------------------------------------------------------------------
  // Auto-sync adapter: one app-created "StarNote" folder (drive.file scope is enough for it)
  // ------------------------------------------------------------------

  /** Authenticated Drive call; an expired token logs out so the UI can ask for a new sign-in. */
  private async driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const tok = await this.token();
    const resp = await netFetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${tok}` } });
    if (resp.status === 401) {
      this.logout();
      throw new Error("Google Drive session expired. Please sign in again.");
    }
    if (!resp.ok) throw new Error(`Drive ${resp.status}: ${await resp.text()}`);
    return resp;
  }

  /** Finds (or creates) the sync folder. The id is cached and re-validated, so a deleted folder is recreated. */
  private async syncFolderId(): Promise<string> {
    const cached = localStorage.getItem(STORAGE_KEY_SYNC_FOLDER);
    if (cached) {
      try {
        const meta = await (await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`)).json();
        if (!meta.trashed) return cached;
      } catch (e: any) {
        if (!/Drive 404/.test(e.message)) throw e;
      }
      localStorage.removeItem(STORAGE_KEY_SYNC_FOLDER);
    }

    const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${SYNC_FOLDER_NAME}' and trashed = false`;
    const found = await (await this.driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json();
    let id: string | undefined = found.files?.[0]?.id;
    if (!id) {
      const created = await (await this.driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: SYNC_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
      })).json();
      id = created.id as string;
    }
    localStorage.setItem(STORAGE_KEY_SYNC_FOLDER, id);
    return id;
  }

  private toRemoteFile(f: any): RemoteFile {
    return {
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      noteId: f.appProperties?.starnoteId,
      kind: f.appProperties?.kind === "pdf" ? "pdf" : "note",
      mime: f.mimeType,
    };
  }

  /** The Remote the sync engine talks to. */
  public syncRemote(): Remote {
    const FIELDS = "id,name,mimeType,modifiedTime,appProperties";
    return {
      list: async () => {
        const folder = await this.syncFolderId();
        const out: RemoteFile[] = [];
        let pageToken = "";
        do {
          const url = new URL("https://www.googleapis.com/drive/v3/files");
          url.searchParams.set("q", `'${folder}' in parents and trashed = false`);
          url.searchParams.set("fields", `nextPageToken,files(${FIELDS})`);
          url.searchParams.set("pageSize", "200");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const page = await (await this.driveFetch(url.toString())).json();
          out.push(...(page.files || []).map((f: any) => this.toRemoteFile(f)));
          pageToken = page.nextPageToken || "";
        } while (pageToken);
        return out;
      },

      upload: async ({ name, data, fileId, noteId, kind }) => {
        const metadata: Record<string, unknown> = { name, mimeType: "application/octet-stream", appProperties: { starnoteId: noteId, kind } };
        if (!fileId) metadata.parents = [await this.syncFolderId()];
        const boundary = "-------StarNoteSync" + Math.random().toString(36).slice(2);
        const enc = new TextEncoder();
        const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`);
        const tail = enc.encode(`\r\n--${boundary}--`);
        const body = new Uint8Array(head.length + data.length + tail.length);
        body.set(head, 0);
        body.set(data, head.length);
        body.set(tail, head.length + data.length);
        const url = fileId
          ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=${FIELDS}`
          : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${FIELDS}`;
        const resp = await this.driveFetch(url, {
          method: fileId ? "PATCH" : "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });
        return this.toRemoteFile(await resp.json());
      },

      trash: async (fileId) => {
        try {
          await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trashed: true }),
          });
        } catch (e: any) {
          if (!/Drive 404/.test(e.message)) throw e; // already gone
        }
      },

      download: async (fileId) => new Uint8Array(await (await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).arrayBuffer()),
    };
  }

  public async uploadSvgFile(filename: string, svgContent: string): Promise<GoogleDriveFile> {
    const enc = new TextEncoder();
    const data = enc.encode(svgContent);

    if (this.mockMode) {
      const mockFile: GoogleDriveFile = {
        id: `mock-svg-${Date.now()}`,
        name: filename,
        size: data.byteLength,
        mimeType: "image/svg+xml",
        modifiedTime: new Date().toISOString(),
      };
      this.mockFiles.unshift(mockFile);
      return mockFile;
    }

    const tok = await this.token();

    const metadata = { name: filename, mimeType: "image/svg+xml" };
    const boundary = "-------StarNoteSvgBoundary" + Math.random().toString(36).substring(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const part1 = new TextEncoder().encode(
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: image/svg+xml\r\n\r\n"
    );
    const part2 = new TextEncoder().encode(closeDelimiter);

    const payload = new Uint8Array(part1.byteLength + data.byteLength + part2.byteLength);
    payload.set(part1, 0);
    payload.set(data, part1.byteLength);
    payload.set(part2, part1.byteLength + data.byteLength);

    const resp = await netFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    });

    if (!resp.ok) {
      throw new Error(`SVG Drive upload failed: ${await resp.text()}`);
    }

    return await resp.json();
  }

  public logout() {
    this.accessToken = null;
    this.user = null;
    this.mockMode = false;
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    this.refreshToken = null;
    localStorage.removeItem(STORAGE_KEY_REFRESH);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_MOCK_MODE);
  }
}
