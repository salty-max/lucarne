import { useMemo, useState } from "react";
import { useTeams } from "@/hooks/useTeams";
import { useFavorites } from "@/lib/favorites";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { teamName } from "@/lib/teamNames";
import { FavoriteStar } from "@/components/FavoriteStar";
import { Loading, PageHeader, SectionLabel } from "@/components/common";

/** One clickable team row: a ★/☆ toggle + the (localised) team name. */
function TeamRow({ name }: { name: string }) {
  const { lang } = useSettings();
  return (
    <li className="tt-dotted flex items-center gap-2 py-1.5 text-sm">
      <FavoriteStar team={name} />
      <span className="min-w-0 truncate uppercase">{teamName(name, lang)}</span>
    </li>
  );
}

/** "My teams" (P200): the one place to follow/unfollow. Search the full team
 *  list to add, ★ to remove. No matches here — those live on Today/Calendar. */
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

  return (
    <>
      <PageHeader title={t.favorites.title} subtitle={t.favorites.subtitle} />

      <SectionLabel>{t.favorites.yours}</SectionLabel>
      {followed.length === 0 ? (
        <p className="py-2 text-sm italic text-muted-foreground">{t.favorites.none}</p>
      ) : (
        <ul className="flex flex-col">
          {followed.map((name) => (
            <TeamRow key={name} name={name} />
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
              <TeamRow key={tm.name} name={tm.name} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
