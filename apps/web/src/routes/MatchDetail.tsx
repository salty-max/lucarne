import { Link, useParams } from "@tanstack/react-router";
import { useMatch } from "@/hooks/useMatch";
import { useCompetitions } from "@/hooks/useCompetitions";
import { CompetitionLogo, TeamLogo } from "@/components/Logo";
import { EventMark } from "@/components/MatchCard";
import { BroadcasterBadge } from "@/components/BroadcasterBadge";
import { EmptyState, Loading, SectionLabel } from "@/components/common";
import { eventMark, eventName } from "@/lib/matchEvents";
import { eventMinute, parisLongLabel, parisTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  Broadcaster,
  LineupPlayer,
  MatchDetail as Detail,
  MatchEvent,
  Team,
  TeamLineup,
} from "@lucarne/shared";

type Result = "win" | "loss" | "none";

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/** Group a starting XI into formation lines, back (GK) to front, by the API grid
 *  "row:col" (col 1 = the team's left). Falls back to grouping by position when
 *  grid data is absent. `mirror` reverses each line's left↔right — needed for the
 *  away team, which attacks downward on the shared pitch, so its left flank must
 *  render on the viewer's right. */
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
    <div className="flex w-12 flex-col items-center gap-1">
      <span
        className={cn(
          "grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold",
          side === "home" ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
        )}
      >
        {p.number ?? ""}
      </span>
      <span className="max-w-full truncate text-center text-[10px] leading-tight text-foreground/90">
        {lastName(p.name)}
      </span>
    </div>
  );
}

function PitchHalf({ lines, side }: { lines: LineupPlayer[][]; side: "home" | "away" }) {
  return (
    <div className={cn("flex flex-1 justify-around p-2", side === "home" ? "flex-col-reverse" : "flex-col")}>
      {lines.map((line, i) => (
        <div key={i} className="flex items-start justify-around gap-1">
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
      className="relative overflow-hidden rounded-lg"
      style={{ background: "hsl(146 42% 40% / 0.12)" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-foreground/10" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/10"
      />
      <div className="relative flex min-h-115 flex-col sm:min-h-130">
        <PitchHalf lines={pitchLines(away.startXI, true)} side="away" />
        <PitchHalf lines={pitchLines(home.startXI)} side="home" />
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
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Substitutes</p>
      <div className="grid grid-cols-2 gap-x-4">
        {col(home.substitutes, "left")}
        {col(away.substitutes, "right")}
      </div>
    </div>
  );
}

function Lineups({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  return (
    <div className="rounded-lg bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between text-xs font-medium">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          {home.formation ?? "—"}
        </span>
        <span className="flex items-center gap-1.5">
          {away.formation ?? "—"}
          <span className="h-2.5 w-2.5 rounded-full bg-foreground" />
        </span>
      </div>
      <Pitch home={home} away={away} />
      <Bench home={home} away={away} />
      {(home.coach || away.coach) && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="truncate">{home.coach ? `Coach · ${home.coach}` : ""}</span>
          <span className="truncate text-right">{away.coach ? `${away.coach} · Coach` : ""}</span>
        </div>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
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

function TeamSide({ team, result }: { team: Team; result: Result }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamLogo name={team.name} apiLogo={team.logo} size={52} />
      <span
        className={cn(
          "text-base font-semibold leading-tight sm:text-lg",
          result === "loss" && "font-medium text-muted-foreground",
        )}
      >
        {team.name}
      </span>
    </div>
  );
}

function ScoreCenter({ m, homeResult, awayResult }: { m: Detail; homeResult: Result; awayResult: Result }) {
  const status = statusLine(m);

  if (m.status === "scheduled") {
    return (
      <div className="flex flex-col items-center gap-1 pt-2">
        <span className="text-3xl font-bold leading-none tabular-nums">{parisTime(m.kickoff)}</span>
        <span className="text-xs text-muted-foreground">{shortDate(m.kickoff)}</span>
      </div>
    );
  }

  const pens = m.homePenalties != null && m.awayPenalties != null;
  return (
    <div className="flex flex-col items-center gap-1.5 pt-1">
      <div className="flex items-center gap-2 text-4xl font-bold leading-none tabular-nums sm:text-5xl">
        <span className={cn(homeResult === "loss" && "text-muted-foreground")}>{m.homeGoals ?? 0}</span>
        <span className="text-muted-foreground/40">–</span>
        <span className={cn(awayResult === "loss" && "text-muted-foreground")}>{m.awayGoals ?? 0}</span>
      </div>
      {pens && (
        <span className="text-xs font-medium text-muted-foreground">
          Pens {m.homePenalties}–{m.awayPenalties}
        </span>
      )}
      {status &&
        (status.live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-xs font-semibold text-live">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
            {status.text}
          </span>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">{status.text}</span>
        ))}
    </div>
  );
}

function BroadcasterRow({ b }: { b: Broadcaster }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <BroadcasterBadge b={b} />
      <span className="truncate text-right text-xs text-muted-foreground">
        {b.coverage === "partial" ? "Partial" : "Full coverage"}
        {b.note ? ` · ${b.note}` : ""}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

type TimelineItem = { ht: true } | { e: MatchEvent; score: string | null };

/** Timeline rows in order, with a running score on goals + a half-time marker. */
function buildTimeline(events: MatchEvent[]): TimelineItem[] {
  let hs = 0;
  let as = 0;
  let htDone = false;
  const rows: TimelineItem[] = [];
  for (const e of events) {
    if (!htDone && (e.minute ?? 0) > 45 && rows.length > 0) {
      rows.push({ ht: true });
      htDone = true;
    }
    let score: string | null = null;
    if (e.type === "Goal") {
      // Own goals count for the opposing side.
      const side = e.detail === "Own Goal" ? (e.side === "home" ? "away" : "home") : e.side;
      if (side === "home") hs += 1;
      else if (side === "away") as += 1;
      score = `${hs}–${as}`;
    }
    rows.push({ e, score });
  }
  return rows;
}

function ScoreTag({ score }: { score: string }) {
  return (
    <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[10px] font-bold leading-none tabular-nums text-primary">
      {score}
    </span>
  );
}

function HalfTimeMarker() {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
      <span />
      <span className="z-10 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground ring-4 ring-card">
        HT
      </span>
      <span />
    </li>
  );
}

function TimelineRow({ e, score }: { e: MatchEvent; score: string | null }) {
  const kind = eventMark(e);
  if (!kind) return null;
  const home = e.side === "home";
  const isGoal = kind === "goal";

  const text = (
    <div className={cn("flex min-w-0 flex-col", home ? "items-end text-right" : "items-start text-left")}>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          isGoal ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {home && score && <ScoreTag score={score} />}
        <span className="truncate">{eventName(e)}</span>
        {!home && score && <ScoreTag score={score} />}
      </span>
      {isGoal && e.assist && (
        <span className="truncate text-[0.7rem] text-muted-foreground/80">{e.assist}</span>
      )}
    </div>
  );
  const icon = (
    <span className="flex w-4 shrink-0 justify-center">
      <EventMark kind={kind} />
    </span>
  );

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm">
      <div className="flex min-w-0 items-center justify-end gap-2">
        {home && (
          <>
            {text}
            {icon}
          </>
        )}
      </div>
      <span className="z-10 grid h-6 min-w-9 place-items-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground ring-4 ring-card">
        {eventMinute(e.minute, e.extraMinute)}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        {!home && (
          <>
            {icon}
            {text}
          </>
        )}
      </div>
    </li>
  );
}

export default function MatchDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { match, loading, error } = useMatch(Number(id));
  const comps = useCompetitions();

  if (loading) return <Loading />;
  if (error || !match) {
    return (
      <EmptyState title="Match not found">
        <Link to="/" className="text-foreground underline underline-offset-2">
          Back to today
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
  const timeline = match.events.filter((e) => e.type === "Goal" || e.type === "Card");

  return (
    <>
      <Link
        to="/competitions/$slug"
        params={{ slug: match.competition.slug }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ‹ {match.competition.name}
      </Link>

      {/* Hero scoreboard */}
      <article className="glow-surface overflow-hidden rounded-lg">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <CompetitionLogo slug={match.competition.slug} size={18} />
            <span className="truncate text-sm font-semibold">
              {match.competition.name}
              {match.round && <span className="font-normal text-muted-foreground"> · {match.round}</span>}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 items-start gap-2 px-4 py-7 sm:gap-4 sm:py-9">
          <TeamSide team={match.home} result={homeResult} />
          <ScoreCenter m={match} homeResult={homeResult} awayResult={awayResult} />
          <TeamSide team={match.away} result={awayResult} />
        </div>
      </article>

      {/* Meta (aside) + what happened (main), side by side on desktop */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <aside className="flex flex-col gap-6 lg:col-span-2">
          {/* Where to watch */}
          <section>
            <SectionLabel>Where to watch</SectionLabel>
            <div className="divide-y overflow-hidden rounded-lg bg-card">
              {match.broadcasters.length > 0 ? (
                match.broadcasters.map((b) => <BroadcasterRow key={b.id} b={b} />)
              ) : (
                <p className="px-4 py-4 text-sm italic text-muted-foreground">
                  Broadcaster to be confirmed.
                </p>
              )}
            </div>
          </section>

          {/* Match info */}
          <section>
            <SectionLabel>Match info</SectionLabel>
            <dl className="divide-y overflow-hidden rounded-lg bg-card">
              <InfoRow label="Date" value={parisLongLabel(new Date(match.kickoff))} />
              <InfoRow label="Kick-off" value={`${parisTime(match.kickoff)} · Europe/Paris`} />
              {match.venue && <InfoRow label="Venue" value={match.venue} />}
              <InfoRow
                label="Competition"
                value={country ? `${match.competition.name} · ${country}` : match.competition.name}
              />
              {match.round && <InfoRow label="Round" value={match.round} />}
            </dl>
          </section>
        </aside>

        {/* On desktop the timeline column is absolutely filled by the aside's
            height, so it scrolls instead of towering over the left blocks. */}
        <div className="lg:relative lg:col-span-3">
          <div className="lg:absolute lg:inset-0 lg:flex lg:flex-col">
            {timeline.length > 0 ? (
            <section className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <SectionLabel>Timeline</SectionLabel>
              <div className="rounded-lg bg-card px-3 py-5 sm:px-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <div className="relative">
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border"
                  />
                  <ol className="relative flex flex-col gap-4">
                    {buildTimeline(timeline).map((r, i) =>
                      "ht" in r ? (
                        <HalfTimeMarker key={i} />
                      ) : (
                        <TimelineRow key={i} e={r.e} score={r.score} />
                      ),
                    )}
                  </ol>
                </div>
              </div>
            </section>
          ) : match.status === "finished" ? (
            <section>
              <SectionLabel>Timeline</SectionLabel>
              <div className="rounded-lg bg-muted/50 p-4 text-sm italic text-muted-foreground">
                No goals or cards.
              </div>
            </section>
          ) : match.status === "scheduled" && !match.lineups ? (
            <section>
              <SectionLabel>Lineups</SectionLabel>
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                Confirmed lineups appear about an hour before kick-off.
              </div>
            </section>
            ) : null}
          </div>
        </div>
      </div>

      {/* Lineups — full width, the pitch needs the room */}
      {match.lineups && (
        <section className="mt-6">
          <SectionLabel>Lineups</SectionLabel>
          <Lineups home={match.lineups.home} away={match.lineups.away} />
        </section>
      )}
    </>
  );
}
