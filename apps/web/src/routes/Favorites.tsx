import { useMemo, useState } from "react";
import { useTeams } from "@/hooks/useTeams";
import { toggleFavorite, useFavorites } from "@/lib/favorites";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { teamName } from "@/lib/teamNames";
import { Loading, PageHeader, SectionLabel } from "@/components/common";

/** A followed team: name + a ✕ to unfollow. */
function FollowedRow({ name }: { name: string }) {
  const { lang } = useSettings();
  const t = useT();
  return (
    <li className="tt-dotted flex items-center gap-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate uppercase">{teamName(name, lang)}</span>
      <button
        type="button"
        onClick={() => toggleFavorite(name)}
        aria-label={`${t.favorites.remove} — ${name}`}
        title={t.favorites.remove}
        className="shrink-0 px-1 leading-none text-muted-foreground/60 hover:text-[hsl(var(--tt-red))]"
      >
        ✕
      </button>
    </li>
  );
}

/** A search result: the whole row follows the team on click. */
function ResultRow({ name, onAdd }: { name: string; onAdd: () => void }) {
  const { lang } = useSettings();
  const t = useT();
  return (
    <li>
      <button
        type="button"
        data-nav
        onClick={onAdd}
        aria-label={`${t.favorites.add} — ${name}`}
        className="tt-dotted flex w-full items-center gap-2 py-1.5 text-left text-sm hover:bg-accent"
      >
        <span className="min-w-0 flex-1 truncate uppercase">{teamName(name, lang)}</span>
        <span className="shrink-0 px-1 leading-none text-[hsl(var(--tt-green))]">+</span>
      </button>
    </li>
  );
}

/** "My teams" (P200): the one place to follow/unfollow. Search the full team
 *  list to add, ✕ to remove. No matches here — those live on Today/Calendar. */
export default function Favorites() {
  const { lang } = useSettings();
  const t = useT();
  const favs = useFavorites();
  const { teams, error } = useTeams();
  const [q, setQ] = useState("");

  const followed = useMemo(() => [...favs].sort((a, b) => a.localeCompare(b)), [favs]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query || !teams) return [];
    const favSet = new Set(favs);
    return teams
      .filter((tm) => !favSet.has(tm.name))
      .filter(
        (tm) =>
          tm.name.toLowerCase().includes(query) ||
          (tm.shortName?.toLowerCase().includes(query) ?? false) ||
          teamName(tm.name, lang).toLowerCase().includes(query),
      )
      .slice(0, 40);
  }, [q, teams, favs, lang]);

  const add = (name: string) => {
    toggleFavorite(name);
    setQ(""); // clear the search after adding
  };

  return (
    <>
      <PageHeader title={t.favorites.title} subtitle={t.favorites.subtitle} />

      <SectionLabel>{t.favorites.yours}</SectionLabel>
      {followed.length === 0 ? (
        <p className="py-2 text-sm italic text-muted-foreground">{t.favorites.none}</p>
      ) : (
        <ul className="flex flex-col">
          {followed.map((name) => (
            <FollowedRow key={name} name={name} />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <SectionLabel>{t.favorites.addHeader}</SectionLabel>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.favorites.search}
          aria-label={t.favorites.search}
          className="mt-1 w-full border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-[hsl(var(--tt-cyan))]"
        />
        {!teams ? (
          <Loading error={error} />
        ) : q.trim() === "" ? null : results.length === 0 ? (
          <p className="py-2 text-sm italic text-muted-foreground">{t.favorites.noResults}</p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {results.map((tm) => (
              <ResultRow key={tm.name} name={tm.name} onAdd={() => add(tm.name)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
