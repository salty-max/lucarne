import { Link, useParams } from "@tanstack/react-router";
import { useSchedule } from "@/hooks/useSchedule";
import { useCompetitions } from "@/hooks/useCompetitions";
import { DaySection } from "@/components/DaySection";
import { CompetitionLogo } from "@/components/Logo";
import { EmptyState, Loading, PageHeader } from "@/components/common";

export default function Competition() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { days, error } = useSchedule({ competition: slug, days: 45 });
  const comps = useCompetitions();
  const name = comps?.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <>
      <PageHeader
        title={name}
        subtitle="Upcoming matches"
        icon={<CompetitionLogo slug={slug} size={30} />}
        right={
          <Link
            to="/competitions"
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
          >
            ‹ All
          </Link>
        }
      />
      {!days ? (
        <Loading error={error} />
      ) : days.length === 0 ? (
        <EmptyState title="No upcoming matches">
          Off-season, or nothing scheduled in the next few weeks.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((d) => (
            <DaySection key={d.key} day={d} />
          ))}
        </div>
      )}
    </>
  );
}
