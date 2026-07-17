import { Link, useParams } from "@tanstack/react-router";
import { useMatch } from "@/hooks/useMatch";
import { useCompetitions } from "@/hooks/useCompetitions";
import { EventMark } from "@/components/EventMark";
import { BroadcasterBadge } from "@/components/BroadcasterBadge";
import { EmptyState, Loading, SectionLabel } from "@/components/common";
import { eventMark, eventName } from "@/lib/matchEvents";
import { roundLabel } from "@/lib/labels";
import { useSettings } from "@/lib/settings";
import { formatLong, formatShort } from "@/lib/dates";
import { eventMinute, parisTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  Broadcaster,
  LineupPlayer,
  MatchDetail as Detail,
  MatchEvent,
  TeamLineup,
} from "@lucarne/shared";

type Result = "win" | "loss" | "none";

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/** Group a starting XI into formation lines, back (GK) to front, by the API grid
 *  "row:col" (col 1 = the team's left). `mirror` reverses each line for the away
 *  team, which attacks downward on the shared pitch. */
function pitchLines(xi: LineupPlayer[], mirror = false): LineupPlayer[][] {
  const orient = (lines: LineupPlayer[][]) => (mirror ? lines.map((l) => [...l].reverse()) : lines);

  if (!xi.some((p) => p.grid)) {
    const byPos = ["G", "D", "M", "F"].map((o) => xi.filter((p) => p.pos === o)).filter((l) => l.length);
    return orient(byPos.length ? byPos : [xi]);
  }
  const rows = new Map<number, LineupPlayer[]>();
  for (const p of xi) {
    const row = Number((p.grid ?? "0:0").split(":")[0]);
    (rows.get(row) ?? rows.set(row, []).get(row)!).push(p);
  }
  const lines = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ps]) =>
      ps.sort(
        (a, b) => Number((a.grid ?? "0:0").split(":")[1]) - Number((b.grid ?? "0:0").split(":")[1]),
      ),
    );
  return orient(lines);
}

function PitchPlayer({ p, side }: { p: LineupPlayer; side: "home" | "away" }) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-0.5 px-0.5">
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold",
          side === "home" ? "bg-primary text-primary-foreground" : "bg-[hsl(var(--tt-cyan))] text-black",
        )}
      >
        {p.number ?? ""}
      </span>
      <span className="max-w-full truncate text-center text-[9px] leading-tight text-foreground/90">
        {lastName(p.name)}
      </span>
    </div>
  );
}

/** One team's half. Horizontal pitch: home fills left→right (GK leftmost),
 *  away fills right→left. Each formation line is a vertical column of players. */
function PitchHalf({ lines, side }: { lines: LineupPlayer[][]; side: "home" | "away" }) {
  return (
    <div className={cn("flex flex-1", side === "home" ? "flex-row" : "flex-row-reverse")}>
      {lines.map((line, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-around py-1">
          {line.map((p, j) => (
            <PitchPlayer key={j} p={p} side={side} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Pitch({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  return (
    <div
      className="relative aspect-16/11 overflow-hidden"
      style={{ background: "linear-gradient(hsl(146 48% 15%), hsl(146 52% 11%))" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/30" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30"
      />
      <div className="relative flex h-full flex-row">
        <PitchHalf lines={pitchLines(home.startXI)} side="home" />
        <PitchHalf lines={pitchLines(away.startXI, true)} side="away" />
      </div>
    </div>
  );
}

function Bench({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  const col = (subs: LineupPlayer[], align: "left" | "right") => (
    <ul className="flex min-w-0 flex-col gap-1">
      {subs.map((p, i) => (
        <li
          key={i}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            align === "right" && "flex-row-reverse text-right",
          )}
        >
          <span className="min-w-[1.6ch] tabular-nums text-muted-foreground">{p.number ?? ""}</span>
          <span className="truncate">{p.name}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Substitutes
      </p>
      <div className="grid grid-cols-2 gap-x-4">
        {col(home.substitutes, "left")}
        {col(away.substitutes, "right")}
      </div>
    </div>
  );
}

function Lineups({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-bold">
        <span className="flex items-center gap-1.5 text-primary">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          {home.formation ?? "—"}
        </span>
        <span className="flex items-center gap-1.5 text-[hsl(var(--tt-cyan))]">
          {away.formation ?? "—"}
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--tt-cyan))]" />
        </span>
      </div>
      <Pitch home={home} away={away} />
      <Bench home={home} away={away} />
      {(home.coach || away.coach) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{home.coach ? `Coach · ${home.coach}` : ""}</span>
          <span className="truncate text-right">{away.coach ? `${away.coach} · Coach` : ""}</span>
        </div>
      )}
    </div>
  );
}

function statusLine(m: Detail): { text: string; live: boolean } | null {
  if (m.status === "live") return { text: m.elapsed != null ? `Live ${m.elapsed}'` : "Live", live: true };
  if (m.status === "postponed") return { text: "Postponed", live: false };
  if (m.status === "finished") {
    const text =
      m.statusShort === "PEN"
        ? "Penalties"
        : m.statusShort === "AET"
          ? "After extra time"
          : "Full time";
    return { text, live: false };
  }
  return null;
}

/** Compact, flat teletext scoreboard: crests + score on one line, names below. */
function Scoreboard({ m, homeResult, awayResult }: { m: Detail; homeResult: Result; awayResult: Result }) {
  const { dateFormat } = useSettings();
  const status = statusLine(m);
  const pens = m.homePenalties != null && m.awayPenalties != null;
  const nameCls = (r: Result) =>
    cn("min-w-0 flex-1 truncate uppercase", r === "win" ? "font-bold text-[hsl(var(--tt-green))]" : "font-semibold");

  return (
    <div className="flex flex-col items-center gap-1.5 py-3">
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        {m.status === "scheduled" ? (
          <span className="text-2xl font-bold leading-none tabular-nums text-[hsl(var(--tt-yellow))]">
            {parisTime(m.kickoff)}
          </span>
        ) : (
          <span className="text-3xl font-extrabold tabular-nums text-[hsl(var(--tt-yellow))] sm:text-4xl">
            {m.homeGoals ?? 0}
            <span className="mx-1 text-muted-foreground/60">–</span>
            {m.awayGoals ?? 0}
          </span>
        )}
      </div>

      <div className="flex w-full max-w-sm items-center justify-center gap-2 text-center text-sm">
        <span className={cn(nameCls(homeResult), "text-right")}>{m.home.name}</span>
        <span className="shrink-0 text-muted-foreground">—</span>
        <span className={cn(nameCls(awayResult), "text-left")}>{m.away.name}</span>
      </div>

      {pens && (
        <span className="text-xs font-medium text-muted-foreground">
          Pens {m.homePenalties}–{m.awayPenalties}
        </span>
      )}
      {status &&
        (status.live ? (
          <span className="tt-tag bg-live py-0.5 text-white">
            <span className="live-dot mr-1 h-1.5 w-1.5 rounded-full bg-current" />
            {status.text}
          </span>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {status.text}
          </span>
        ))}
      {m.status === "scheduled" && (
        <span className="text-xs uppercase text-muted-foreground">
          {formatShort(new Date(m.kickoff), dateFormat)}
        </span>
      )}
    </div>
  );
}

/** One goal/card, aligned to its team: home on the left, away on the right. */
function EventRow({ e }: { e: MatchEvent }) {
  const kind = eventMark(e);
  if (!kind) return null;
  const home = e.side === "home";
  const body = (
    <span className={cn("flex min-w-0 items-center gap-1.5", home ? "flex-row" : "flex-row-reverse")}>
      <span className="shrink-0 font-bold tabular-nums text-[hsl(var(--tt-yellow))]">
        {eventMinute(e.minute, e.extraMinute)}
      </span>
      <EventMark kind={kind} />
      <span className={cn("min-w-0 truncate", home ? "text-foreground" : "text-[hsl(var(--tt-cyan))]")}>
        {eventName(e)}
        {kind === "goal" && e.assist && <span className="text-muted-foreground"> ({e.assist})</span>}
      </span>
    </span>
  );
  return (
    <div className="grid grid-cols-2 items-center gap-3 border-b border-dotted border-border py-0.5 text-sm">
      <div className="flex min-w-0 justify-start">{home && body}</div>
      <div className="flex min-w-0 justify-end">{!home && body}</div>
    </div>
  );
}

function BroadcasterRow({ b }: { b: Broadcaster }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dotted border-border py-1.5">
      <BroadcasterBadge b={b} />
      <span className="truncate text-right text-xs text-muted-foreground">
        {b.coverage === "partial" ? "Partial" : "Full"}
        {b.note ? ` · ${b.note}` : ""}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dotted border-border py-1.5">
      <dt className="text-sm uppercase text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

export default function MatchDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { match, loading, error } = useMatch(Number(id));
  const comps = useCompetitions();
  const { dateFormat } = useSettings();

  if (loading) return <Loading />;
  if (error || !match) {
    return (
      <EmptyState title="Match not found">
        <Link to="/" className="text-foreground underline underline-offset-2">
          Back to home
        </Link>
      </EmptyState>
    );
  }

  const pens = match.homePenalties != null && match.awayPenalties != null;
  const homeWins = pens
    ? match.homePenalties! > match.awayPenalties!
    : match.homeGoals != null && match.awayGoals != null && match.homeGoals > match.awayGoals;
  const awayWins = pens
    ? match.awayPenalties! > match.homePenalties!
    : match.homeGoals != null && match.awayGoals != null && match.awayGoals > match.homeGoals;
  const decided = match.status === "finished" && (homeWins || awayWins);
  const homeResult: Result = decided ? (homeWins ? "win" : "loss") : "none";
  const awayResult: Result = decided ? (awayWins ? "win" : "loss") : "none";

  const country = comps?.find((c) => c.slug === match.competition.slug)?.country;
  const round = roundLabel(match.round);
  const goals = match.events.filter((e) => e.type === "Goal");
  const cards = match.events.filter((e) => e.type === "Card");

  return (
    <>
      <Link
        to="/competitions/$slug"
        params={{ slug: match.competition.slug }}
        className="mb-2 inline-flex items-center gap-1 text-sm uppercase text-muted-foreground hover:text-foreground"
      >
        ‹ {match.competition.name}
      </Link>

      {/* Scoreboard — flat, no card/border/gradient */}
      <div className="tt-bar tt-bar-magenta text-xs">
        <span className="truncate">{match.competition.name}</span>
        {round && <span className="tt-bar-r font-semibold normal-case">{round}</span>}
      </div>
      <Scoreboard m={match} homeResult={homeResult} awayResult={awayResult} />

      {goals.length > 0 && (
        <section className="mt-3">
          <SectionLabel>Goals</SectionLabel>
          <div className="flex flex-col">
            {goals.map((e, i) => (
              <EventRow key={i} e={e} />
            ))}
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="mt-3">
          <SectionLabel>Cards</SectionLabel>
          <div className="flex flex-col">
            {cards.map((e, i) => (
              <EventRow key={i} e={e} />
            ))}
          </div>
        </section>
      )}

      {match.status === "finished" && goals.length === 0 && cards.length === 0 && (
        <p className="mt-3 py-2 text-sm italic text-muted-foreground">No goals or cards.</p>
      )}

      {match.lineups ? (
        <section className="mt-3">
          <SectionLabel>Lineups</SectionLabel>
          <Lineups home={match.lineups.home} away={match.lineups.away} />
        </section>
      ) : (
        match.status === "scheduled" && (
          <p className="mt-3 py-2 text-sm text-muted-foreground">
            Lineups are confirmed about an hour before kick-off.
          </p>
        )
      )}

      <section className="mt-3">
        <SectionLabel>Where to watch</SectionLabel>
        <div className="flex flex-col">
          {match.broadcasters.length > 0 ? (
            match.broadcasters.map((b) => <BroadcasterRow key={b.id} b={b} />)
          ) : (
            <p className="py-2 text-sm italic text-muted-foreground">Broadcaster TBC.</p>
          )}
        </div>
      </section>

      <section className="mt-3">
        <SectionLabel>Info</SectionLabel>
        <dl className="flex flex-col">
          <InfoRow label="Date" value={formatLong(new Date(match.kickoff), dateFormat)} />
          <InfoRow label="Kick-off" value={`${parisTime(match.kickoff)} · Europe/Paris`} />
          {match.venue && <InfoRow label="Venue" value={match.venue} />}
          <InfoRow
            label="Competition"
            value={country ? `${match.competition.name} · ${country}` : match.competition.name}
          />
          {round && <InfoRow label="Round" value={round} />}
        </dl>
      </section>
    </>
  );
}
