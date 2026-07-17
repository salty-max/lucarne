import { Link } from "@tanstack/react-router";
import type { Day, Match } from "@lucarne/shared";
import { MatchCard } from "./MatchCard";

export function MatchList({ matches }: { matches: Match[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {matches.map((m) => (
        <Link key={m.id} to="/match/$id" params={{ id: String(m.id) }} className="block">
          <MatchCard m={m} />
        </Link>
      ))}
    </div>
  );
}

/** A day heading (label + trailing rule + count) and its matches. */
export function DaySection({ day }: { day: Day }) {
  if (day.matches.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-3 text-sm font-semibold text-muted-foreground">
        <span className="whitespace-nowrap">{day.label}</span>
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 tabular-nums text-muted-foreground/60">{day.matches.length}</span>
      </h2>
      <MatchList matches={day.matches} />
    </section>
  );
}
