import { useSyncExternalStore } from "react";

// Single consolidated preferences store — everything the user tweaks lives in one
// localStorage object (`lucarne:prefs`), so it's trivial to export/back up and
// there's one source of truth. Domain modules (settings.ts, favorites.ts,
// channels.ts, competitionFilter.ts) are thin facades over this.
export type DateFormat = "dmy" | "mdy" | "numeric";
export type Lang = "en" | "fr";
export type Theme = "cept1" | "neon" | "gray" | "dmg";
export type FontChoice = "modern" | "retro";

export type Prefs = {
  dateFormat: DateFormat;
  crt: boolean;
  lang: Lang;
  theme: Theme; // colour palette (see lib/themes.ts + index.css)
  font: FontChoice; // "retro" = the old-school CRT face (VT323), "modern" = mono stack
  favorites: string[]; // followed team names
  channels: string[]; // selected broadcaster slugs (empty = all shown)
  hiddenCompetitions: string[]; // competition slugs to hide (empty = all shown)
};

const KEY = "lucarne:prefs";
const LEGACY_KEYS = ["lucarne:settings", "lucarne:favorites", "lucarne:channels"];

const DEFAULTS: Prefs = {
  dateFormat: "dmy",
  crt: true,
  lang: "fr",
  theme: "cept1", // authentic teletext by default
  font: "retro", // old-school CRT face by default (fits the teletext identity)
  favorites: [],
  channels: [],
  hiddenCompetitions: [],
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

/** Mirror crt/lang/theme onto <html> — index.html sets them pre-paint (no flash). */
export function applyCrt(on: boolean): void {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("crt-off", !on);
}
export function applyLang(lang: Lang): void {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}
export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", theme);
}
export function applyFont(font: FontChoice): void {
  if (typeof document !== "undefined")
    document.documentElement.classList.toggle("font-retro", font !== "modern");
}

let current: Prefs = load();
const listeners = new Set<() => void>();

applyCrt(current.crt);
applyLang(current.lang);
applyTheme(current.theme);
applyFont(current.font);

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
  applyTheme(current.theme);
  applyFont(current.font);
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
