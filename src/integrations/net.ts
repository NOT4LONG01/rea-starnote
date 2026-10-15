/**
 * Desktop-vs-browser plumbing. In the Tauri desktop app, requests go out through the native side (no browser
 * cross-origin rules: Zotero's file storage and Google's token endpoint need that) and sign-in opens the system
 * browser. In a normal browser every helper degrades to plain fetch. The plugin imports are dynamic so the web
 * build never loads them.
 */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

export async function netFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (isDesktopApp()) {
    const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
    return nativeFetch(input as any, init as any);
  }
  return fetch(input, init); // looked up at call time, so tests can replace globalThis.fetch
}

export async function openInBrowser(url: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}
