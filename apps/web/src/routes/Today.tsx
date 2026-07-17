import { useSchedule } from "@/hooks/useSchedule";
import { parisDayKey } from "@/lib/time";
import { useSettings } from "@/lib/settings";
import { dayKeyToDate, formatLong } from "@/lib/dates";
import { MatchTable, type MatchGroup } from "@/components/DaySection";
import { EmptyState, Loading, TeletextHero } from "@/components/common";

export default function Today() {
  const { days, error } = useSchedule({ days: 8 }, { live: true });
  const { dateFormat } = useSettings();
  const todayKey = parisDayKey();

  if (!days) {
    return (
      <>
        <TeletextHero />
        <Loading error={error} />
      </>
    );
  }

  const todayMatches = days.find((d) => d.key === todayKey)?.matches ?? [];
  const upcoming = days.filter((d) => d.key > todayKey);
  const live = todayMatches.filter((m) => m.status === "live");
  const up = todayMatches.filter((m) => m.status === "scheduled");
  const done = todayMatches.filter((m) => m.status === "finished" || m.status === "postponed");

  const groups: MatchGroup[] =
    todayMatches.length > 0
      ? [
          { key: "live", label: "Live", matches: live, tone: "live" },
          { key: "up", label: "Upcoming", matches: up, tone: "yellow" },
          { key: "done", label: "Finished", matches: done, tone: "cyan" },
        ]
      : upcoming.slice(0, 5).map((d) => ({
          key: d.key,
          label: formatLong(dayKeyToDate(d.key), dateFormat),
          matches: d.matches,
          tone: "yellow" as const,
        }));

  return (
    <>
      <TeletextHero />
      {todayMatches.length === 0 && (
        <EmptyState title="No matches today">Nothing today — here's what's next.</EmptyState>
      )}
      <MatchTable groups={groups} />
    </>
  );
}
