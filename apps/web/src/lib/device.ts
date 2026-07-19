// A stable, anonymous per-browser id used to key active surveillance ("radar")
// server-side — independent of push permission, so you can watch matches without
// enabling notifications. Generated once and persisted in localStorage.
const KEY = "lucarne:device";

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    // localStorage/crypto unavailable (private mode, SSR) — a per-session id still
    // lets enrichment work for this tab; it just won't persist across reloads.
    cached = cached ?? `anon-${Math.random().toString(36).slice(2)}`;
    return cached;
  }
}
