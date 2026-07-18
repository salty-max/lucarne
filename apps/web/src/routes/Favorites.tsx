import { useMemo } from "react";
import { useSchedule } from "@/hooks/useSchedule";
import { useFavorites } from "@/lib/favorites";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { dayKeyToDate, formatLong } from "@/lib/dates";
import { MatchTable, type MatchGroup } from "@/components/DaySection";
import { EmptyState, Loading, PageHeader } from "@/components/common";

/** "My matches" (P200): the next month of fixtures, filtered to followed teams,
 *  grouped by day. Reactively reflects the localStorage favourites. */
export default function Favorites() {
  const { dateFormat, lang } = useSettings();
  const t = useT();
  const favs = useFavorites();
  const favSet = useMemo(() => new Set(favs), [favs]);
  const { days, error } = useSchedule({ days: 30 });

  const groups: MatchGroup[] = useMemo(() => {
    if (!days) return [];
    return days
      .map((d) => ({
        key: d.key,
        label: formatLong(dayKeyToDate(d.key), dateFormat, lang),
        matches: d.matches.filter((m) => favSet.has(m.home.name) || favSet.has(m.away.name)),
        tone: "yellow" as const,
      }))
      .filter((g) => g.matches.length > 0);
  }, [days, favSet, dateFormat, lang]);

  return (
    <>
      <PageHeader title={t.favorites.title} subtitle={t.favorites.subtitle} />
      {favs.length === 0 ? (
        <EmptyState title={t.favorites.emptyTitle}>{t.favorites.emptyBody}</EmptyState>
      ) : !days ? (
        <Loading error={error} />
      ) : groups.length === 0 ? (
        <EmptyState title={t.favorites.noUpcoming} />
      ) : (
        <MatchTable groups={groups} />
      )}
    </>
  );
}
