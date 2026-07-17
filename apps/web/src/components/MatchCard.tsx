import { cn } from "@/lib/utils";
import { eventMinute, parisTime } from "@/lib/time";
import { eventMark, eventName, type EventMarkKind } from "@/lib/matchEvents";
import type { Match, MatchEvent, Team } from "@lucarne/shared";
import { BroadcasterList } from "./BroadcasterBadge";
import { GoalIcon } from "./GoalIcon";
import { CompetitionLogo, TeamLogo } from "./Logo";

type Result = "win" | "loss" | "none";

/** Left rail: kickoff time, the live clock, or a full-time badge. */
function StatusRail({ m }: { m: Match }) {
  if (m.status === "live") {
    return (
      <div className="flex flex-col items-center gap-1 text-live">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
        <span className="text-sm font-bold tabular-nums">
          {m.elapsed != null ? `${m.elapsed}'` : "LIVE"}
        </span>
      </div>
    );
  }
  if (m.status === "finished") {
    const label = m.statusShort === "PEN" ? "Pens" : m.statusShort === "AET" ? "AET" : "FT";
    return <div className="text-xs font-semibold text-muted-foreground">{label}</div>;
  }
  if (m.status === "postponed")
    return <div className="text-xs font-semibold text-amber-500">Postp.</div>;
  return <div className="text-sm font-semibold tabular-nums">{parisTime(m.kickoff)}</div>;
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
          "min-w-0 flex-1 truncate text-sm",
          result === "win" && "font-semibold text-foreground",
          result === "loss" && "text-muted-foreground",
          result === "none" && "font-medium text-foreground",
        )}
      >
        {team.name}
      </span>
      {goals != null && (
        <span className="flex items-baseline gap-1 tabular-nums">
          {pens != null && (
            <span className="text-xs font-medium text-muted-foreground">({pens})</span>
          )}
          <span
            className={cn(
              "text-lg font-bold leading-none",
              result === "loss" ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {goals}
          </span>
        </span>
      )}
    </div>
  );
}

/** A crisp vector mark for an event — a soccer ball for goals, a referee's card
 *  for bookings — so nothing depends on the OS emoji font. */
export function EventMark({ kind }: { kind: EventMarkKind }) {
  if (kind === "goal") {
    return <GoalIcon className="h-3.5 w-3.5" />;
  }
  return (
    <svg
      viewBox="6 3 12 18"
      className={cn("h-3.5 w-3.5", kind === "yellow" ? "text-yellow-400" : "text-red-500")}
      aria-hidden
    >
      <rect
        x="7.5"
        y="4"
        width="9"
        height="16"
        rx="1.7"
        fill="currentColor"
        transform="rotate(9 12 12)"
      />
    </svg>
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
      <span className="min-w-[2.1ch] shrink-0 tabular-nums text-muted-foreground">
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
    <article className="relative overflow-hidden rounded-lg bg-card transition-colors hover:bg-accent">
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
          <span className="truncate text-xs font-medium text-muted-foreground">
            {m.competition.name}
          </span>
        </div>
        <BroadcasterList list={m.broadcasters} />
      </div>
    </article>
  );
}
