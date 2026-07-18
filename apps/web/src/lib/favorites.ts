import { getPrefs, setPrefs, usePrefs } from "./prefs";

// Followed teams, keyed by the raw team name (the stable identifier used across
// the wire — teams carry no id in the schedule payload). Facade over prefs.ts.

export function toggleFavorite(team: string): void {
  const favs = getPrefs().favorites;
  setPrefs({ favorites: favs.includes(team) ? favs.filter((t) => t !== team) : [...favs, team] });
}

export function isFavorite(team: string): boolean {
  return getPrefs().favorites.includes(team);
}

/** Reactive list of followed team names (stable reference until it changes). */
export function useFavorites(): readonly string[] {
  return usePrefs().favorites;
}

/** Reactive membership for one team. */
export function useIsFavorite(team: string): boolean {
  return usePrefs().favorites.includes(team);
}
