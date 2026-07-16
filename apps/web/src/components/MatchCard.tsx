import { cn } from "@/lib/utils";
import { eventMinute, parisTime } from "@/lib/time";
import { eventMark, eventName, type EventMarkKind } from "@/lib/matchEvents";
import type { Match, MatchEvent, Team } from "@lucarne/shared";
import { BroadcasterList } from "./BroadcasterBadge";
import { CompetitionLogo, TeamLogo } from "./Logo";

type Result = "win" | "loss" | "none";

/** Left rail: kickoff time, the live clock, or a full-time badge. */
function StatusRail({ m }: { m: Match }) {
  if (m.status === "live") {
    return (
      <div className="flex flex-col items-center gap-1 text-live">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
        <span className="font-headline text-lg font-semibold leading-none tabular-nums">
          {m.elapsed != null ? `${m.elapsed}'` : "LIVE"}
        </span>
      </div>
    );
  }
  if (m.status === "finished") {
    // Extra time / shootout deserve their own badge; otherwise plain full-time.
    const label = m.statusShort === "PEN" ? "Pens" : m.statusShort === "AET" ? "AET" : "FT";
    return (
      <span className="font-headline text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    );
  }
  if (m.status === "postponed") {
    return (
      <span className="font-headline text-xs font-semibold uppercase tracking-widest text-amber-500">
        PPD
      </span>
    );
  }
  return (
    <span className="font-headline text-lg font-semibold leading-none tabular-nums">
      {parisTime(m.kickoff)}
    </span>
  );
}

function TeamRow({
  team,
  goals,
  pens,
  result,
}: {
  team: Team;
  goals: number | null;
  pens: number | null;
  result: Result;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamLogo name={team.name} apiLogo={team.logo} size={24} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-headline text-[15px] leading-tight",
          result === "win" && "font-semibold text-foreground",
          result === "loss" && "font-medium text-muted-foreground",
          result === "none" && "font-medium text-foreground",
        )}
      >
        {team.name}
      </span>
      {goals != null && (
        <span className="flex items-baseline gap-1">
          {pens != null && (
            <span className="font-headline text-xs font-medium text-muted-foreground">({pens})</span>
          )}
          <span
            className={cn(
              "font-headline text-xl leading-none tabular-nums",
              result === "loss" ? "font-semibold text-muted-foreground" : "font-bold text-foreground",
            )}
          >
            {goals}
          </span>
        </span>
      )}
    </div>
  );
}

/** A crisp vector mark for an event — a minimal ball for goals, a referee's
 *  card for bookings — so nothing depends on the OS emoji font. */
function EventMark({ kind }: { kind: EventMarkKind }) {
  if (kind === "goal") {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-foreground" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.12" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 8.8 15.04 11.01 13.88 14.59 10.12 14.59 8.96 11.01Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-3 w-2.25 rounded-[1.5px] shadow-sm",
        kind === "yellow" ? "bg-yellow-400" : "bg-red-500",
      )}
    />
  );
}

function EventLine({ e, align }: { e: MatchEvent; align: "left" | "right" }) {
  const kind = eventMark(e);
  if (!kind) return null;
  return (
    <li className={cn("flex items-center gap-1.5 text-xs", align === "right" && "flex-row-reverse")}>
      <span className="flex w-3.5 shrink-0 justify-center">
        <EventMark kind={kind} />
      </span>
      <span className="min-w-[2.1ch] shrink-0 font-headline text-[11px] tabular-nums text-muted-foreground">
        {eventMinute(e.minute, e.extraMinute)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          align === "right" && "text-right",
          kind === "goal" ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {eventName(e)}
      </span>
    </li>
  );
}

/** Scorers + cards, split into home / away columns on a recessed panel. */
function MatchEvents({ events }: { events: MatchEvent[] }) {
  const shown = events.filter((e) => e.type === "Goal" || e.type === "Card");
  if (shown.length === 0) return null;
  const home = shown.filter((e) => e.side === "home");
  const away = shown.filter((e) => e.side === "away");
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t bg-muted/40 px-3 py-3 sm:px-4">
      <ul className="flex flex-col gap-1.5">
        {home.map((e, i) => (
          <EventLine key={i} e={e} align="left" />
        ))}
      </ul>
      <ul className="flex flex-col gap-1.5">
        {away.map((e, i) => (
          <EventLine key={i} e={e} align="right" />
        ))}
      </ul>
    </div>
  );
}

export function MatchCard({ m }: { m: Match }) {
  // A shootout decides the winner even though goals are level; otherwise goals do.
  const pens = m.homePenalties != null && m.awayPenalties != null;
  const homeWins = pens
    ? m.homePenalties! > m.awayPenalties!
    : m.homeGoals != null && m.awayGoals != null && m.homeGoals > m.awayGoals;
  const awayWins = pens
    ? m.awayPenalties! > m.homePenalties!
    : m.homeGoals != null && m.awayGoals != null && m.awayGoals > m.homeGoals;
  const decided = m.status === "finished" && (homeWins || awayWins);
  const homeResult: Result = decided ? (homeWins ? "win" : "loss") : "none";
  const awayResult: Result = decided ? (awayWins ? "win" : "loss") : "none";
  const live = m.status === "live";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/15",
        live ? "border-live/40" : "border-border",
      )}
    >
      {live && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-live" />}

      <div className="flex items-stretch gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="flex w-11 shrink-0 items-center justify-center border-r pr-3 sm:w-14">
          <StatusRail m={m} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <TeamRow team={m.home} goals={m.homeGoals} pens={m.homePenalties} result={homeResult} />
          <TeamRow team={m.away} goals={m.awayGoals} pens={m.awayPenalties} result={awayResult} />
        </div>
      </div>

      <MatchEvents events={m.events} />

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <CompetitionLogo slug={m.competition.slug} size={15} />
          <span className="truncate font-headline text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {m.competition.name}
          </span>
        </div>
        <BroadcasterList list={m.broadcasters} />
      </div>
    </article>
  );
}
