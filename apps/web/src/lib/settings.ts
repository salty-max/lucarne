import { getPrefs, setPrefs, usePrefs, type Prefs } from "./prefs";

// Facade over the consolidated prefs store (see prefs.ts). Public API unchanged.
export type { DateFormat, Lang, Theme } from "./prefs";
export type Settings = Pick<Prefs, "dateFormat" | "crt" | "lang" | "theme">;

export function getSettings(): Settings {
  const p = getPrefs();
  return { dateFormat: p.dateFormat, crt: p.crt, lang: p.lang, theme: p.theme };
}

export function setSettings(patch: Partial<Settings>): void {
  setPrefs(patch);
}

/** Reactive display settings (date format, CRT filter, language, theme). */
export function useSettings(): Settings {
  const p = usePrefs();
  return { dateFormat: p.dateFormat, crt: p.crt, lang: p.lang, theme: p.theme };
}
