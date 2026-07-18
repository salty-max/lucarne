import { Link } from "@tanstack/react-router";
import type { BracketMatch, BracketRound, Team } from "@lucarne/shared";
import { cn } from "@/lib/utils";
import { roundLabel } from "@/lib/labels";
import { teamName } from "@/lib/teamNames";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";

function Side({
  team,
  goals,
  pens,
  isWinner,
  decided,
}: {
  team: Team | null;
  goals: number | null;
  pens: number | null;
  isWinner: boolean;
  decided: boolean;
}) {
  const { lang } = useSettings();
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          isWinner ? "font-semibold text-foreground" : decided ? "text-muted-foreground" : "",
        )}
      >
        {team ? teamName(team.shortName ?? team.name, lang) : t.match.tbd}
      </span>
      {goals != null && (
        <span className={cn("hrink-0 tabular-nums", isWinner ? "font-bold" : "font-medium")}>
          {goals}
          {pens != null && <span className="ml-0.5 text-muted-foreground">({pens})</span>}
        </span>
      )}
    </div>
  );
}

function Tie({ m }: { m: BracketMatch }) {
  const decided = m.status === "finished";
  return (
    <Link
      to="/match/$id"
      params={{ id: String(m.id) }}
      className="block rounded-lg bg-card p-2 leading-tight transition-colors hover:bg-accent"
    >
      <Side
        team={m.home}
        goals={m.homeGoals}
        pens={m.homePenalties}
        isWinner={m.winner === "home"}
        decided={decided}
      />
      <div className="my-1.5 h-px bg-border" />
      <Side
        team={m.away}
        goals={m.awayGoals}
        pens={m.awayPenalties}
        isWinner={m.winner === "away"}
        decided={decided}
      />
    </Link>
  );
}

/** Knockout bracket. Desktop: one column per round, ties spread to feel like a
 * tree, scrolling horizontally if needed. Mobile: rounds stack vertically as
 * full-width sections (no horizontal scroll). */
export function Bracket({ rounds }: { rounds: BracketRound[] }) {
  const { lang } = useSettings();
  return (
    <div className="pb-2 sm:-mx-4 sm:overflow-x-auto sm:px-4">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:gap-3">
        {rounds.map((round) => (
          <div key={round.name} className="flex w-full flex-col sm:w-44 sm:shrink-0">
            <h3 className="mb-2 truncate text-center font-semibold uppercase tracking-wide text-[hsl(var(--tt-magenta))]">
              {roundLabel(round.name, lang)}
            </h3>
            <div className="flex flex-col gap-2 sm:flex-1 sm:justify-around sm:gap-3">
              {round.matches.map((m) => (
                <Tie key={m.id} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
