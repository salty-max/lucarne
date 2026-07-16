import type { Day, Match } from "@lucarne/shared";
import { MatchCard } from "./MatchCard";

export function MatchList({ matches }: { matches: Match[] }) {
  return (
    <div className="flex flex-col gap-2">
      {matches.map((m) => (
        <MatchCard key={m.id} m={m} />
      ))}
    </div>
  );
}

/** A day heading + its matches (used by Calendar, Competition). */
export function DaySection({ day }: { day: Day }) {
  if (day.matches.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {day.label}
      </h2>
      <MatchList matches={day.matches} />
    </section>
  );
}
