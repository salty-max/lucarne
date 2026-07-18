import { Link, useParams } from "@tanstack/react-router";
import * as Tabs from "@radix-ui/react-tabs";
import { useSchedule } from "@/hooks/useSchedule";
import { useCompetition } from "@/hooks/useCompetition";
import { useCompetitions } from "@/hooks/useCompetitions";
import { MatchTable } from "@/components/DaySection";
import { Standings } from "@/components/Standings";
import { Bracket } from "@/components/Bracket";
import { EmptyState, Loading, PageHeader } from "@/components/common";
import { MatchTableSkel } from "@/components/Skeletons";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { competitionLabel, countryLabel } from "@/lib/labels";
import { dayKeyToDate, formatLong } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Upcoming matches for the competition (its own fetch, mounted only when the
 *  Matches tab is active). */
function MatchesTab({ slug }: { slug: string }) {
  const { days, error } = useSchedule({ competition: slug, days: 45 });
  const { dateFormat, lang } = useSettings();
  const t = useT();
  if (!days) return error ? <Loading error /> : <MatchTableSkel />;
  if (days.length === 0) {
    return <EmptyState title={t.competition.noUpcoming}>{t.competition.offSeason}</EmptyState>;
  }
  return (
    <MatchTable
      groups={days.map((d) => ({
        key: d.key,
        label: formatLong(dayKeyToDate(d.key), dateFormat, lang),
        matches: d.matches,
        tone: "yellow" as const,
      }))}
    />
  );
}

export default function Competition() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { detail, loading } = useCompetition(slug);
  const comps = useCompetitions();
  const { lang } = useSettings();
  const t = useT();
  const name = detail?.name ?? comps?.find((c) => c.slug === slug)?.name ?? slug;

  const hasStandings = !!detail?.standings;
  const hasBracket = !!detail?.bracket;
  // Lead with the richest view: bracket for a cup, else the table, else matches.
  const defaultTab = hasBracket ? "bracket" : hasStandings ? "standings" : "matches";

  const tabs: { key: string; label: string }[] = [
    { key: "matches", label: t.competition.matches },
    ...(hasStandings ? [{ key: "standings", label: t.competition.standings }] : []),
    ...(hasBracket ? [{ key: "bracket", label: t.competition.bracket }] : []),
  ];

  return (
    <>
      <PageHeader
        title={competitionLabel(name, lang)}
        subtitle={countryLabel(detail?.country, lang)}
        right={
          <Link
            to="/competitions"
            className="shrink-0 text-sm uppercase text-muted-foreground hover:text-foreground"
          >
            ‹ {t.competition.backIndex}
          </Link>
        }
      />

      {loading ? (
        <MatchTableSkel />
      ) : tabs.length === 1 ? (
        <MatchesTab slug={slug} />
      ) : (
        <Tabs.Root defaultValue={defaultTab}>
          <Tabs.List className="mb-3 flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <Tabs.Trigger
                key={tab.key}
                value={tab.key}
                className={cn(
                  "shrink-0 whitespace-nowrap border border-border px-2 py-0.5 text-[0.72rem] uppercase transition-colors",
                  "text-muted-foreground hover:bg-accent hover:text-foreground",
                  "data-[state=active]:border-[hsl(var(--tt-cyan))] data-[state=active]:bg-[hsl(var(--tt-cyan))] data-[state=active]:font-bold data-[state=active]:text-black",
                )}
              >
                {tab.label}
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
