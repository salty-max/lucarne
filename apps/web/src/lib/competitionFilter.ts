import { getPrefs, setPrefs, usePrefs } from "./prefs";

// Competition visibility filter, stored as the set of HIDDEN slugs (empty = all
// shown) — the user deselects the few competitions they don't care about. Facade
// over prefs.ts.

export function toggleCompetition(slug: string): void {
  const h = getPrefs().hiddenCompetitions;
  setPrefs({ hiddenCompetitions: h.includes(slug) ? h.filter((s) => s !== slug) : [...h, slug] });
}

/** Reactive set of hidden competition slugs (empty = all shown). */
export function useHiddenCompetitions(): readonly string[] {
  return usePrefs().hiddenCompetitions;
}

/** Drop matches whose competition is hidden (empty hidden set = keep all). */
export function keepCompetitions<M extends { competition: { slug: string } }>(
  matches: M[],
  hidden: readonly string[],
): M[] {
  if (hidden.length === 0) return matches;
  const set = new Set(hidden);
  return matches.filter((m) => !set.has(m.competition.slug));
}
