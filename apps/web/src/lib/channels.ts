import { useSyncExternalStore } from "react";

// The channels (broadcaster slugs) the user keeps — their subscriptions. Empty
// set = no filter, show everything. localStorage-backed, same pattern as
// favorites.ts; no backend.
const KEY = "lucarne:channels";

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

export function toggleChannel(slug: string): void {
  if (current.has(slug)) current.delete(slug);
  else current.add(slug);
  persist();
}

/** Clear the filter — back to showing every channel. */
export function clearChannels(): void {
  if (current.size === 0) return;
  current.clear();
  persist();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive set of selected channel slugs (empty = show all). */
export function useChannels(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
