import { useSyncExternalStore } from "react";

// Single consolidated preferences store — everything the user tweaks lives in one
// localStorage object (`lucarne:prefs`), so it's trivial to export/back up and
// there's one source of truth. Domain modules (settings.ts, favorites.ts,
// channels.ts, competitionFilter.ts) are thin facades over this.
export type DateFormat = "dmy" | "mdy" | "numeric";
export type Lang = "en" | "fr";

export type Prefs = {
  dateFormat: DateFormat;
  crt: boolean;
  lang: Lang;
  favorites: string[]; // followed team names
  channels: string[]; // selected broadcaster slugs (empty = all)
  competitions: string[]; // selected competition slugs (empty = all)
};

const KEY = "lucarne:prefs";
const LEGACY_KEYS = ["lucarne:settings", "lucarne:favorites", "lucarne:channels"];

const DEFAULTS: Prefs = {
  dateFormat: "dmy",
  crt: true,
  lang: "fr",
  favorites: [],
  channels: [],
  competitions: [],
};

/** Fold the pre-consolidation per-domain keys into one Prefs patch (one-time). */
function legacy(): Partial<Prefs> {
  const read = (k: string): unknown => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const out: Partial<Prefs> = {};
  const s = read("lucarne:settings");
  if (s && typeof s === "object") Object.assign(out, s);
  const f = read("lucarne:favorites");
  if (Array.isArray(f)) out.favorites = f as string[];
  const c = read("lucarne:channels");
  if (Array.isArray(c)) out.channels = c as string[];
  return out;
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
    return { ...DEFAULTS, ...legacy() };
  } catch {
    return DEFAULTS;
  }
}

/** Mirror crt/lang onto <html> — index.html sets them pre-paint to avoid a flash. */
export function applyCrt(on: boolean): void {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("crt-off", !on);
}
export function applyLang(lang: Lang): void {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

let current: Prefs = load();
const listeners = new Set<() => void>();

applyCrt(current.crt);
applyLang(current.lang);

// First run under the new key: persist the (possibly migrated) prefs and drop the
// legacy per-domain keys.
if (typeof localStorage !== "undefined" && localStorage.getItem(KEY) == null) {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  applyCrt(current.crt);
  applyLang(current.lang);
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive whole-prefs snapshot (stable reference until a setPrefs). */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}
