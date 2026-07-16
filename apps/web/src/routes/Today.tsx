import { useSchedule } from "@/hooks/useSchedule";
import { parisDayKey, parisLongLabel } from "@/lib/time";
import { DaySection, MatchList } from "@/components/DaySection";
import { EmptyState, Loading, LivePill, PageHeader, SectionLabel } from "@/components/common";

export default function Today() {
  const { days, error } = useSchedule({ days: 8 }, { live: true });
  const todayKey = parisDayKey();
  const todayLabel = parisLongLabel(new Date());

  if (!days) {
    return (
      <>
        <PageHeader title="Today" subtitle={todayLabel} />
        <Loading error={error} />
      </>
    );
  }

  const todayMatches = days.find((d) => d.key === todayKey)?.matches ?? [];
  const upcoming = days.filter((d) => d.key > todayKey);
  const live = todayMatches.filter((m) => m.status === "live");
  const up = todayMatches.filter((m) => m.status === "scheduled");
  const done = todayMatches.filter((m) => m.status === "finished" || m.status === "postponed");

  return (
    <>
      <PageHeader title="Today" subtitle={todayLabel} right={<LivePill count={live.length} />} />

      {todayMatches.length === 0 ? (
        <>
          <EmptyState title="No match today">Nothing on today — here's what's next.</EmptyState>
          {upcoming.length > 0 && (
            <div className="mt-6 flex flex-col gap-6">
              <SectionLabel>Next up</SectionLabel>
              {upcoming.slice(0, 2).map((d) => (
                <DaySection key={d.key} day={d} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-6">
          {live.length > 0 && (
            <section>
              <SectionLabel live>Live</SectionLabel>
              <MatchList matches={live} />
            </section>
          )}
          {up.length > 0 && (
            <section>
              <SectionLabel>Upcoming</SectionLabel>
              <MatchList matches={up} />
            </section>
          )}
          {done.length > 0 && (
            <section>
              <SectionLabel>Finished</SectionLabel>
              <MatchList matches={done} />
            </section>
          )}
        </div>
      )}
    </>
  );
}
