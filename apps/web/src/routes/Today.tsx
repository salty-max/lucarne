import { useEffect, useMemo, useState } from "react";
import { useSchedule } from "@/hooks/useSchedule";
import { useCompetitions } from "@/hooks/useCompetitions";
import { keepCompetitions, useHiddenCompetitions } from "@/lib/competitionFilter";
import { parisDayKey } from "@/lib/time";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { dayKeyToDate, formatLong } from "@/lib/dates";
import type { Match } from "@lucarne/shared";
import { MatchTable, type MatchGroup } from "@/components/DaySection";
import { CompetitionFilter, type FilterComp } from "@/components/CompetitionFilter";
import { EmptyState, Loading, TeletextHero } from "@/components/common";
import { MatchTableSkel } from "@/components/Skeletons";

export default function Today() {
  // Fetch from yesterday so a match that kicked off last night and is still
  // playing past midnight doesn't vanish from Today at the day rollover.
  const yesterdayKey = parisDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const { days, error } = useSchedule({ from: yesterdayKey, days: 9 }, { live: true });
  const { dateFormat, lang } = useSettings();
  const hidden = useHiddenCompetitions();
  const comps = useCompetitions();
  const t = useT();
  const todayKey = parisDayKey();
  const [filter, setFilter] = useState<string | null>(null);

  // Canonical competition order (same ranking the calendar uses), so each section
  // groups matches by competition instead of interleaving them by kickoff.
  const rank = useMemo(() => new Map((comps ?? []).map((c, i) => [c.slug, i])), [comps]);

  // Everything derived from the schedule — the display groups, plus the set of
  // competitions present (for the filter chips), computed BEFORE the filter is
  // applied so deselecting doesn't make the other chips disappear.
  const { groups, presentComps, hasToday } = useMemo(() => {
    if (!days) return { groups: [] as MatchGroup[], presentComps: [] as FilterComp[], hasToday: false };

    const byComp = (a: Match, b: Match) =>
      (rank.get(a.competition.slug) ?? 99) - (rank.get(b.competition.slug) ?? 99) ||
      a.kickoff.localeCompare(b.kickoff);

    const todayMatches = keepCompetitions(days.find((d) => d.key === todayKey)?.matches ?? [], hidden);
    // Still-live matches from before today (kicked off last night, ran past midnight).
    const carryover = days
      .filter((d) => d.key < todayKey)
      .flatMap((d) => keepCompetitions(d.matches, hidden))
      .filter((m) => m.status === "live");
    const upcomingDays = days
      .filter((d) => d.key > todayKey)
      .map((d) => ({ ...d, matches: keepCompetitions(d.matches, hidden) }))
      .filter((d) => d.matches.length > 0);
    const has = todayMatches.length > 0 || carryover.length > 0;

    // Competitions present across whatever this page will show (unfiltered pool).
    const pool = has ? [...todayMatches, ...carryover] : upcomingDays.flatMap((d) => d.matches);
    const present = (comps ?? []).filter((c) => pool.some((m) => m.competition.slug === c.slug));

    const keep = (m: Match) => !filter || m.competition.slug === filter;
    const live = [...carryover, ...todayMatches.filter((m) => m.status === "live")].filter(keep).sort(byComp);
    const up = todayMatches.filter((m) => m.status === "scheduled").filter(keep).sort(byComp);
    const done = todayMatches
      .filter((m) => m.status === "finished" || m.status === "postponed")
      .filter(keep)
      .sort(byComp);

    const g: MatchGroup[] = has
      ? [
          { key: "live", label: t.today.live, matches: live, tone: "live" },
          { key: "up", label: t.today.upcoming, matches: up, tone: "yellow" },
          { key: "done", label: t.today.finished, matches: done, tone: "cyan" },
        ]
      : upcomingDays.slice(0, 5).map((d) => ({
          key: d.key,
          label: formatLong(dayKeyToDate(d.key), dateFormat, lang),
          matches: d.matches.filter(keep).sort(byComp),
          tone: "yellow" as const,
        }));

    return { groups: g, presentComps: present, hasToday: has };
  }, [days, hidden, comps, rank, filter, todayKey, dateFormat, lang, t]);

  // Drop the filter if its competition is no longer present (e.g. a live match ended).
  useEffect(() => {
    if (filter && !presentComps.some((c) => c.slug === filter)) setFilter(null);
  }, [presentComps, filter]);

  if (!days) {
    return (
      <>
        <TeletextHero />
        {error ? <Loading error /> : <MatchTableSkel sections={[5, 3]} />}
      </>
    );
  }

  return (
    <>
      <TeletextHero />
      {!hasToday && <EmptyState title={t.today.noMatchesTitle}>{t.today.noMatchesBody}</EmptyState>}
      <CompetitionFilter comps={presentComps} value={filter} onChange={setFilter} />
      <MatchTable groups={groups} groupByCompetition />
    </>
  );
}
