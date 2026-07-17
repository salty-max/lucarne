import { useSyncExternalStore } from "react";

export type DateFormat = "dmy" | "mdy" | "numeric";
export type Settings = { dateFormat: DateFormat; crt: boolean };

const KEY = "lucarne:settings";
const DEFAULTS: Settings = { dateFormat: "dmy", crt: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore malformed storage */
  }
  return DEFAULTS;
}

let current: Settings = load();
const listeners = new Set<() => void>();

/** Reflect the CRT toggle as a class on <html> (index.html sets it pre-paint). */
export function applyCrt(on: boolean): void {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("crt-off", !on);
}
applyCrt(current.crt);

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  applyCrt(current.crt);
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive settings snapshot — components re-render when settings change. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
