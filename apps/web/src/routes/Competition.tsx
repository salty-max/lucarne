import { Link, useParams } from "@tanstack/react-router";
import * as Tabs from "@radix-ui/react-tabs";
import { useSchedule } from "@/hooks/useSchedule";
import { useCompetition } from "@/hooks/useCompetition";
import { useCompetitions } from "@/hooks/useCompetitions";
import { DaySection } from "@/components/DaySection";
import { CompetitionLogo } from "@/components/Logo";
import { Standings } from "@/components/Standings";
import { Bracket } from "@/components/Bracket";
import { EmptyState, Loading, PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";

/** Upcoming matches for the competition (its own fetch, mounted only when the
 *  Matchs tab is active). */
function MatchesTab({ slug }: { slug: string }) {
  const { days, error } = useSchedule({ competition: slug, days: 45 });
  if (!days) return <Loading error={error} />;
  if (days.length === 0) {
    return (
      <EmptyState title="Aucun match à venir">
        Hors-saison, ou rien de programmé dans les prochaines semaines.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {days.map((d) => (
        <DaySection key={d.key} day={d} />
      ))}
    </div>
  );
}

export default function Competition() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { detail, loading } = useCompetition(slug);
  const comps = useCompetitions();
  const name = detail?.name ?? comps?.find((c) => c.slug === slug)?.name ?? slug;

  const hasStandings = !!detail?.standings;
  const hasBracket = !!detail?.bracket;
  // Lead with the richest view: bracket for a cup, else the table, else matches.
  const defaultTab = hasBracket ? "bracket" : hasStandings ? "standings" : "matches";

  const tabs: { key: string; label: string }[] = [
    { key: "matches", label: "Matchs" },
    ...(hasStandings ? [{ key: "standings", label: "Classement" }] : []),
    ...(hasBracket ? [{ key: "bracket", label: "Bracket" }] : []),
  ];

  return (
    <>
      <PageHeader
        title={name}
        subtitle={detail?.country}
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

      {loading ? (
        <Loading />
      ) : tabs.length === 1 ? (
        <MatchesTab slug={slug} />
      ) : (
        <Tabs.Root defaultValue={defaultTab}>
          <Tabs.List className="mb-5 flex gap-1 border-b border-border">
            {tabs.map((t) => (
              <Tabs.Trigger
                key={t.key}
                value={t.key}
                className={cn(
                  "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                  "hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
                )}
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="matches" className="focus-visible:outline-none">
            <MatchesTab slug={slug} />
          </Tabs.Content>
          {detail?.standings && (
            <Tabs.Content value="standings" className="focus-visible:outline-none">
              <Standings groups={detail.standings} />
            </Tabs.Content>
          )}
          {detail?.bracket && (
            <Tabs.Content value="bracket" className="focus-visible:outline-none">
              <Bracket rounds={detail.bracket} />
            </Tabs.Content>
          )}
        </Tabs.Root>
      )}
    </>
  );
}
