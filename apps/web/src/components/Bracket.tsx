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
        <span className={cn("shrink-0 tabular-nums", isWinner ? "font-bold" : "font-medium")}>
          {goals}
          {pens != null && <span className="ml-0.5 text-[10px] text-muted-foreground">({pens})</span>}
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
      className="block rounded-lg bg-card p-2 text-[13px] leading-tight transition-colors hover:bg-accent"
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

/** Knockout bracket: one column per round, ties spread to feel like a tree.
 *  Scrolls horizontally on narrow screens. */
export function Bracket({ rounds }: { rounds: BracketRound[] }) {
  const { lang } = useSettings();
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex items-stretch gap-3">
        {rounds.map((round) => (
          <div key={round.name} className="flex w-44 shrink-0 flex-col">
            <h3 className="mb-2 truncate text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--tt-magenta))]">
              {roundLabel(round.name, lang)}
            </h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
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
