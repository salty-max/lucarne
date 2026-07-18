import { useSyncExternalStore } from "react";

// Followed teams, keyed by the raw team name (the stable identifier used across
// the wire — teams carry no id in the schedule payload). localStorage-backed,
// same pattern as settings.ts; no backend.
const KEY = "lucarne:favorites";

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore malformed storage */
  }
  return [];
}

const current = new Set<string>(load());
let snapshot: readonly string[] = [...current];
const listeners = new Set<() => void>();

function persist(): void {
  snapshot = [...current];
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function toggleFavorite(team: string): void {
  if (current.has(team)) current.delete(team);
  else current.add(team);
  persist();
}

export function isFavorite(team: string): boolean {
  return current.has(team);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive list of followed team names (stable reference until it changes). */
export function useFavorites(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/** Reactive membership for one team — re-renders only when THIS team flips. */
export function useIsFavorite(team: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current.has(team),
    () => current.has(team),
  );
}
