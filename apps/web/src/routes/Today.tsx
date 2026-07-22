import { useMemo } from "react";
import { useSchedule } from "@/hooks/useSchedule";
import { useCompetitions } from "@/hooks/useCompetitions";
import { keepCompetitions, useHiddenCompetitions } from "@/lib/competitionFilter";
import { parisDayKey } from "@/lib/time";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { dayKeyToDate, formatLong } from "@/lib/dates";
import type { Match } from "@lucarne/shared";
import { MatchTable, type MatchGroup } from "@/components/DaySection";
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

  // Canonical competition order (same ranking the calendar uses), so each section
  // groups matches by competition instead of interleaving them by kickoff.
  const rank = useMemo(() => new Map((comps ?? []).map((c, i) => [c.slug, i])), [comps]);

  if (!days) {
    return (
      <>
        <TeletextHero />
        {error ? <Loading error /> : <MatchTableSkel sections={[5, 3]} />}
      </>
    );
  }

  const todayMatches = keepCompetitions(days.find((d) => d.key === todayKey)?.matches ?? [], hidden);
  // Group by competition (canonical order), then kickoff. The lists are already
  // kickoff-ordered and Array.sort is stable, so this yields (competition, time).
  const byComp = (a: Match, b: Match) =>
    (rank.get(a.competition.slug) ?? 99) - (rank.get(b.competition.slug) ?? 99) ||
    a.kickoff.localeCompare(b.kickoff);
  // Still-live matches from before today (kicked off last night, ran past midnight).
  const carryover = days
    .filter((d) => d.key < todayKey)
    .flatMap((d) => keepCompetitions(d.matches, hidden))
    .filter((m) => m.status === "live");
  const upcoming = days
    .filter((d) => d.key > todayKey)
    .map((d) => ({ ...d, matches: keepCompetitions(d.matches, hidden).sort(byComp) }))
    .filter((d) => d.matches.length > 0);

  const live = [...carryover, ...todayMatches.filter((m) => m.status === "live")].sort(byComp);
  const up = todayMatches.filter((m) => m.status === "scheduled").sort(byComp);
  const done = todayMatches
    .filter((m) => m.status === "finished" || m.status === "postponed")
    .sort(byComp);
  const hasToday = todayMatches.length > 0 || carryover.length > 0;

  const groups: MatchGroup[] = hasToday
    ? [
        { key: "live", label: t.today.live, matches: live, tone: "live" },
        { key: "up", label: t.today.upcoming, matches: up, tone: "yellow" },
        { key: "done", label: t.today.finished, matches: done, tone: "cyan" },
      ]
    : upcoming.slice(0, 5).map((d) => ({
        key: d.key,
        label: formatLong(dayKeyToDate(d.key), dateFormat, lang),
        matches: d.matches,
        tone: "yellow" as const,
      }));

  return (
    <>
      <TeletextHero />
      {!hasToday && <EmptyState title={t.today.noMatchesTitle}>{t.today.noMatchesBody}</EmptyState>}
      <MatchTable groups={groups} groupByCompetition />
    </>
  );
}
