// Tests the REAL desktop sign-in code in src/google-drive.ts (system-browser PKCE flow, refresh tokens) with fakes for
// the native side (loopback listener, opening the browser) and for Google. Run: node test-desktop-oauth.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), "sn-oauth-"));
// the module under test imports "./net" (desktop/native helpers); replace it with a controllable stub
writeFileSync(join(out, "net-stub.ts"), `
const S = () => (globalThis as any).__net;
export const isDesktopApp = () => S().desktop;
export const netFetch = (u: any, i?: any) => S().fetch(u, i);
export const openInBrowser = (u: string) => S().open(u);
export const nativeInvoke = (c: string, a?: any) => S().invoke(c, a);
`);
writeFileSync(join(out, "entry.ts"), `export { GoogleDriveService } from ${JSON.stringify(join(here, "src/google-drive.ts"))};`);
await build({
  entryPoints: [join(out, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(out, "bundle.mjs"), logLevel: "error",
  plugins: [{ name: "net-stub", setup(b) { b.onResolve({ filter: /^\.\/net$/ }, () => ({ path: join(out, "net-stub.ts") })); } }],
});
const { GoogleDriveService } = await import(pathToFileURL(join(out, "bundle.mjs")).href);

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

/** A fresh world: empty storage, a fake Google, a fake native side. `script` can alter the fake browser's reply. */
function world({ desktop = true } = {}) {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const w = { store, tokenReqs: [], apiReqs: [], opened: [], invokes: [], nextToken: 1, replyOverride: null, refreshFails: null, desktop };
  globalThis.__net = {
    desktop,
    fetch: async (url, init = {}) => {
      url = String(url);
      if (url === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(init.body);
        w.tokenReqs.push(Object.fromEntries(body));
        if (body.get("grant_type") === "refresh_token" && w.refreshFails) return json(w.refreshFails.body, w.refreshFails.status);
        const n = w.nextToken++;
        return json({ access_token: `AT${n}`, expires_in: 3600, ...(body.get("grant_type") === "authorization_code" ? { refresh_token: "RT1" } : {}) });
      }
      if (url.includes("/oauth2/v3/userinfo")) { w.apiReqs.push({ url, auth: init.headers?.Authorization }); return json({ name: "Tester", email: "t@example.com" }); }
      if (url.startsWith("https://www.googleapis.com/drive/v3/files")) { w.apiReqs.push({ url, auth: init.headers?.Authorization }); return json({ files: [] }); }
      return new Response("unhandled " + url, { status: 500 });
    },
    open: async (url) => { w.opened.push(url); },
    invoke: async (cmd, args) => {
      w.invokes.push([cmd, args]);
      if (cmd === "loopback_start") return 54321;
      if (cmd === "loopback_wait") {
        const u = new URL(w.opened.at(-1));
        return w.replyOverride ?? { code: "AUTHCODE", state: u.searchParams.get("state"), error: null };
      }
      throw new Error("unknown command " + cmd);
    },
  };
  const svc = new GoogleDriveService();
  svc.setClientId("700593164499-desktop.apps.googleusercontent.com");
  svc.setClientSecret("GOCSPX-test-secret");
  return { svc, w };
}
const expire = (w) => w.store.set("starnote_gdrive_token_expiry", String(Date.now() - 1000));

console.log("sign-in");
await test("opens the system browser with a correct PKCE request and a loopback redirect", async () => {
  const { svc, w } = world();
  await svc.startOAuthFlow();
  assert.deepEqual(w.invokes.map((i) => i[0]), ["loopback_start", "loopback_wait"]);
  assert.equal(w.invokes[1][1].timeoutSecs, 300);
  const u = new URL(w.opened[0]);
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const q = Object.fromEntries(u.searchParams);
  assert.equal(q.client_id, "700593164499-desktop.apps.googleusercontent.com");
  assert.equal(q.redirect_uri, "http://127.0.0.1:54321");
  assert.deepEqual([q.response_type, q.code_challenge_method, q.access_type, q.prompt], ["code", "S256", "offline", "consent"]);
  assert.ok(q.state.length >= 20 && q.code_challenge.length >= 40);
  assert.match(q.scope, /drive\.file/);
  assert.ok(!w.opened[0].includes("GOCSPX"), "the client secret never goes in the browser URL");
});
await test("exchanges the code: verifier matches the challenge, secret + redirect sent, tokens and profile stored", async () => {
  const { svc, w } = world();
  await svc.startOAuthFlow();
  const challenge = new URL(w.opened[0]).searchParams.get("code_challenge");
  const req = w.tokenReqs[0];
  assert.equal(req.grant_type, "authorization_code"); assert.equal(req.code, "AUTHCODE");
  assert.equal(req.redirect_uri, "http://127.0.0.1:54321"); assert.equal(req.client_secret, "GOCSPX-test-secret");
  assert.equal(b64url(createHash("sha256").update(req.code_verifier).digest()), challenge, "PKCE: sha256(verifier) == challenge");
  assert.ok(req.code_verifier.length >= 43 && req.code_verifier.length <= 128);
  assert.equal(w.store.get("starnote_gdrive_access_token"), "AT1"); assert.equal(w.store.get("starnote_gdrive_refresh_token"), "RT1");
  assert.equal(svc.isConnected(), true); assert.equal(svc.getUser().email, "t@example.com");
  assert.equal(w.apiReqs[0].auth, "Bearer AT1");
});
await test("a different state is rejected (CSRF) and nothing is stored", async () => {
  const { svc, w } = world();
  w.replyOverride = { code: "EVIL", state: "not-the-state", error: null };
  await assert.rejects(svc.startOAuthFlow(), /unexpected state/);
  assert.equal(w.tokenReqs.length, 0); assert.equal(svc.isConnected(), false); assert.equal(w.store.get("starnote_gdrive_refresh_token"), undefined);
});
await test("Google error replies and empty replies give clear messages", async () => {
  let { svc, w } = world(); w.replyOverride = { code: null, state: null, error: "access_denied" };
  await assert.rejects(svc.startOAuthFlow(), /access_denied/);
  ({ svc, w } = world());
  const open = globalThis.__net.open; globalThis.__net.open = async (u) => { await open(u); w.replyOverride = { code: null, state: new URL(u).searchParams.get("state"), error: null }; };
  await assert.rejects(svc.startOAuthFlow(), /did not return a code/);
});
await test("a token-endpoint failure is reported with Google's reason and stores nothing", async () => {
  const { svc, w } = world();
  const f = globalThis.__net.fetch;
  globalThis.__net.fetch = async (u, i) => (String(u).includes("/token") ? json({ error: "invalid_client", error_description: "The OAuth client was not found." }, 401) : f(u, i));
  await assert.rejects(svc.startOAuthFlow(), /OAuth client was not found/);
  assert.equal(svc.isConnected(), false);
});
await test("no client id configured: a helpful message, and no browser opened", async () => {
  const { svc, w } = world(); svc.setClientId("");
  await assert.rejects(svc.startOAuthFlow(), /Desktop app/);
  assert.equal(w.opened.length, 0);
});
await test("without a client secret the token request simply omits it", async () => {
  const { svc, w } = world(); svc.setClientSecret("");
  await svc.startOAuthFlow();
  assert.equal("client_secret" in w.tokenReqs[0], false);
});
await test("web mode never touches the native commands", async () => {
  const { svc, w } = world({ desktop: false });
  await svc.startOAuthFlow().catch(() => {}); // the web path needs Google's script, absent here
  assert.deepEqual(w.invokes, []); assert.equal(w.opened.length, 0);
});

await test("the desktop app never inherits the Web client ID saved by the browser version (and vice versa)", async () => {
  let { svc, w } = world({ desktop: false });
  svc.setClientId("web-client.apps.googleusercontent.com");
  assert.equal(w.store.get("starnote_gdrive_client_id"), "web-client.apps.googleusercontent.com");
  globalThis.__net.desktop = true; // same browser profile, now running as the desktop app
  const desktop = new GoogleDriveService();
  assert.equal(desktop.getClientId(), "", "desktop starts empty instead of reusing the web ID");
  await assert.rejects(desktop.startOAuthFlow(), /Desktop app/);
  desktop.setClientId("desktop-client.apps.googleusercontent.com");
  assert.equal(w.store.get("starnote_gdrive_desktop_client_id"), "desktop-client.apps.googleusercontent.com");
  assert.equal(w.store.get("starnote_gdrive_client_id"), "web-client.apps.googleusercontent.com", "the web ID is untouched");
  globalThis.__net.desktop = false;
  assert.equal(new GoogleDriveService().getClientId(), "web-client.apps.googleusercontent.com");
});

console.log("silent renewal");
await test("an expired access token is renewed with the refresh token before the API call", async () => {
  const { svc, w } = world(); await svc.startOAuthFlow();
  expire(w);
  assert.equal(svc.isConnected(), true, "still 'connected': it can renew itself");
  await svc.listNoteFiles();
  const refresh = w.tokenReqs.at(-1);
  assert.deepEqual([refresh.grant_type, refresh.refresh_token, refresh.client_secret], ["refresh_token", "RT1", "GOCSPX-test-secret"]);
  assert.equal(w.apiReqs.at(-1).auth, "Bearer AT2", "the call used the NEW token");
  assert.ok(Number(w.store.get("starnote_gdrive_token_expiry")) > Date.now());
});
await test("a still-valid token is reused (no needless renewals), a nearly expired one is renewed", async () => {
  const { svc, w } = world(); await svc.startOAuthFlow();
  const before = w.tokenReqs.length;
  await svc.listNoteFiles(); await svc.listNoteFiles();
  assert.equal(w.tokenReqs.length, before);
  w.store.set("starnote_gdrive_token_expiry", String(Date.now() + 30_000)); // under the 60 s safety margin
  await svc.listNoteFiles();
  assert.equal(w.tokenReqs.length, before + 1);
});
await test("several simultaneous calls trigger ONE renewal", async () => {
  const { svc, w } = world(); await svc.startOAuthFlow(); expire(w);
  const before = w.tokenReqs.length;
  await Promise.all([svc.listNoteFiles(), svc.listNoteFiles(), svc.listNoteFiles()]);
  assert.equal(w.tokenReqs.length, before + 1);
  assert.ok(w.apiReqs.slice(-3).every((r) => r.auth === "Bearer AT2"));
});
await test("a revoked/expired refresh token signs out cleanly with a clear message", async () => {
  const { svc, w } = world(); await svc.startOAuthFlow(); expire(w);
  w.refreshFails = { status: 400, body: { error: "invalid_grant" } };
  await assert.rejects(svc.listNoteFiles(), /session expired. Please sign in again/);
  assert.equal(svc.isConnected(), false);
  for (const k of ["starnote_gdrive_access_token", "starnote_gdrive_refresh_token", "starnote_gdrive_token_expiry"]) assert.equal(w.store.get(k), undefined, k);
});
await test("a missing Client ID (e.g. after an update that changed where it is stored) says so instead of sending an empty id to Google", async () => {
  const { svc, w } = world(); await svc.startOAuthFlow(); expire(w);
  const before = w.tokenReqs.length;
  svc.setClientId("");
  await assert.rejects(svc.listNoteFiles(), /Client ID is missing/);
  assert.equal(w.tokenReqs.length, before, "no request was sent to Google");
  assert.equal(w.store.get("starnote_gdrive_refresh_token"), "RT1", "the sign-in is kept: entering the ID again fixes it");
});
await test("a temporary renewal failure (server error) does NOT sign the user out", async () => {
  const { svc, w } = world(); await svc.startOAuthFlow(); expire(w);
  w.refreshFails = { status: 503, body: { error: "backend_error" } };
  await assert.rejects(svc.listNoteFiles(), /Could not renew/);
  assert.equal(svc.isConnected(), true); assert.equal(w.store.get("starnote_gdrive_refresh_token"), "RT1");
  w.refreshFails = null;
  await svc.listNoteFiles(); // recovers on the next try
});
await test("logout forgets the refresh token; a pasted access token replaces it", async () => {
  let { svc, w } = world(); await svc.startOAuthFlow();
  svc.logout();
  assert.equal(svc.isConnected(), false); assert.equal(w.store.get("starnote_gdrive_refresh_token"), undefined);
  ({ svc, w } = world()); await svc.startOAuthFlow();
  await svc.setAccessToken("pasted-token");
  assert.equal(w.store.get("starnote_gdrive_refresh_token"), undefined, "manual tokens never keep an old refresh token");
});
await test("the Drive sync adapter renews too (it goes through the same token path)", async () => {
  const { svc, w } = world(); await svc.startOAuthFlow(); expire(w);
  const f = globalThis.__net.fetch;
  globalThis.__net.fetch = async (u, i) => (String(u).includes("/drive/v3/files") && !String(u).includes("/upload") ? (w.apiReqs.push({ url: String(u), auth: i.headers?.Authorization }), json(String(u).includes("fields=id,trashed") ? { id: "F", trashed: false } : { files: [] })) : f(u, i));
  w.store.set("starnote_gdrive_sync_folder", "F");
  expire(w);
  await svc.syncRemote().list();
  assert.equal(w.tokenReqs.at(-1).grant_type, "refresh_token");
  assert.ok(w.apiReqs.slice(-2).every((r) => r.auth === "Bearer AT2"));
});

console.log(`\n${passed} tests passed`);
