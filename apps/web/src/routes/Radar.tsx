import { useEffect, useMemo, useState } from "react";
import type { Match } from "@lucarne/shared";
import { useSchedule } from "@/hooks/useSchedule";
import { useWatch } from "@/hooks/useWatch";
import { useCompetitions } from "@/hooks/useCompetitions";
import { parisDayKey } from "@/lib/time";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { dayKeyToDate, formatLong } from "@/lib/dates";
import { MatchTable, type MatchGroup } from "@/components/DaySection";
import { CompetitionFilter, type FilterComp } from "@/components/CompetitionFilter";
import { EmptyState, Loading, PageHeader } from "@/components/common";
import { MatchTableSkel } from "@/components/Skeletons";

/** RADAR (P500) — every match this device is monitoring: live now and upcoming.
 *  Auto-includes followed teams' matches; explicit toggles too. Finished matches
 *  leave the radar once their post-match data has settled.
 *
 *  Grouped LIVE-first, then one section per upcoming day; within every section
 *  matches are sub-grouped by competition (canonical order). A competition
 *  filter narrows the view. */
export default function Radar() {
  // From yesterday (a match past midnight is still "live") through a fortnight so
  // followed teams' upcoming fixtures show up.
  const yesterdayKey = parisDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const { days, error } = useSchedule({ from: yesterdayKey, days: 14 }, { live: true });
  const { isWatched } = useWatch();
  const comps = useCompetitions();
  const { dateFormat, lang } = useSettings();
  const t = useT();
  const [filter, setFilter] = useState<string | null>(null);

  const rank = useMemo(() => new Map((comps ?? []).map((c, i) => [c.slug, i])), [comps]);

  const { groups, presentComps, watchedCount } = useMemo(() => {
    if (!days) return { groups: [] as MatchGroup[], presentComps: [] as FilterComp[], watchedCount: 0 };

    const byComp = (a: Match, b: Match) =>
      (rank.get(a.competition.slug) ?? 99) - (rank.get(b.competition.slug) ?? 99) ||
      a.kickoff.localeCompare(b.kickoff);

    const watched = days.flatMap((d) => d.matches).filter((m) => isWatched(m));
    // Present competitions come from ALL watched matches (unfiltered) so the chips
    // stay put when you narrow the view.
    const present = (comps ?? []).filter((c) => watched.some((m) => m.competition.slug === c.slug));

    const keep = (m: Match) => !filter || m.competition.slug === filter;
    const kept = watched.filter(keep);
    const live = kept.filter((m) => m.status === "live").sort(byComp);
    // Finished matches drop off the radar: the server purges their surveillance once
    // the post-match tail has settled, and a followed team's finished fixture would
    // otherwise linger here forever. Postponed ones stay — they haven't been played.
    const up = kept
      .filter((m) => m.status === "scheduled" || m.status === "postponed")
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

    // Bucket upcoming matches by their Paris calendar day.
    const buckets = new Map<string, Match[]>();
    for (const m of up) {
      const key = parisDayKey(new Date(m.kickoff));
      const arr = buckets.get(key);
      if (arr) arr.push(m);
      else buckets.set(key, [m]);
    }
    const dayGroups: MatchGroup[] = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ms]) => ({
        key,
        label: formatLong(dayKeyToDate(key), dateFormat, lang),
        matches: ms.sort(byComp),
        tone: "yellow" as const,
      }));

    const g: MatchGroup[] = [{ key: "live", label: t.today.live, matches: live, tone: "live" }, ...dayGroups];
    return { groups: g, presentComps: present, watchedCount: watched.length };
  }, [days, isWatched, comps, rank, filter, dateFormat, lang, t]);

  // Drop the filter if its competition is no longer watched.
  useEffect(() => {
    if (filter && !presentComps.some((c) => c.slug === filter)) setFilter(null);
  }, [presentComps, filter]);

  if (!days) {
    return (
      <>
        <PageHeader title={t.radar.title} />
        {error ? <Loading error /> : <MatchTableSkel sections={[3, 3]} />}
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.radar.title} />
      {watchedCount === 0 ? (
        <EmptyState title={t.radar.emptyTitle}>{t.radar.emptyBody}</EmptyState>
      ) : (
        <>
          <CompetitionFilter comps={presentComps} value={filter} onChange={setFilter} />
          <MatchTable groups={groups} groupByCompetition />
        </>
      )}
    </>
  );
}
