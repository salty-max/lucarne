import { useSchedule } from "@/hooks/useSchedule";
import { useWatch } from "@/hooks/useWatch";
import { parisDayKey } from "@/lib/time";
import { useT } from "@/lib/i18n";
import { MatchTable, type MatchGroup } from "@/components/DaySection";
import { EmptyState, Loading, PageHeader } from "@/components/common";
import { MatchTableSkel } from "@/components/Skeletons";

const byKickoff = (a: { kickoff: string }, b: { kickoff: string }) => a.kickoff.localeCompare(b.kickoff);

/** RADAR (P500) — every match this device is monitoring: live now, upcoming, and
 *  recently finished. Auto-includes followed teams' matches; explicit toggles too. */
export default function Radar() {
  // From yesterday (a match past midnight is still "live") through a fortnight so
  // followed teams' upcoming fixtures show up.
  const yesterdayKey = parisDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const { days, error } = useSchedule({ from: yesterdayKey, days: 14 }, { live: true });
  const { isWatched } = useWatch();
  const t = useT();

  if (!days) {
    return (
      <>
        <PageHeader title={t.radar.title} />
        {error ? <Loading error /> : <MatchTableSkel sections={[3, 3]} />}
      </>
    );
  }

  const watched = days.flatMap((d) => d.matches).filter((m) => isWatched(m));
  const live = watched.filter((m) => m.status === "live").sort(byKickoff);
  const up = watched.filter((m) => m.status === "scheduled").sort(byKickoff);
  const done = watched
    .filter((m) => m.status === "finished" || m.status === "postponed")
    .sort((a, b) => byKickoff(b, a));

  const groups: MatchGroup[] = [
    { key: "live", label: t.today.live, matches: live, tone: "live" },
    { key: "up", label: t.today.upcoming, matches: up, tone: "yellow" },
    { key: "done", label: t.today.finished, matches: done, tone: "cyan" },
  ];

  return (
    <>
      <PageHeader title={t.radar.title} />
      {watched.length === 0 ? (
        <EmptyState title={t.radar.emptyTitle}>{t.radar.emptyBody}</EmptyState>
      ) : (
        <MatchTable groups={groups} />
      )}
    </>
  );
}
