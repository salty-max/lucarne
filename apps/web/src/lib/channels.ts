import { getPrefs, setPrefs, usePrefs } from "./prefs";

// The channels (broadcaster slugs) the user keeps — their subscriptions. Empty
// set = no filter, show everything. Facade over prefs.ts.

export function toggleChannel(slug: string): void {
  const ch = getPrefs().channels;
  setPrefs({ channels: ch.includes(slug) ? ch.filter((s) => s !== slug) : [...ch, slug] });
}

/** Clear the filter — back to showing every channel. */
export function clearChannels(): void {
  if (getPrefs().channels.length) setPrefs({ channels: [] });
}

/** Reactive set of selected channel slugs (empty = show all). */
export function useChannels(): readonly string[] {
  return usePrefs().channels;
}
