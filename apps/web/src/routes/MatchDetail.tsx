import { Link, useParams } from "@tanstack/react-router";
import { useMatch } from "@/hooks/useMatch";
import { useCompetitions } from "@/hooks/useCompetitions";
import { EventMark } from "@/components/EventMark";
import { BroadcasterBadge } from "@/components/BroadcasterBadge";
import { Lineups } from "@/components/Lineups";
import { MatchStats } from "@/components/MatchStats";
import { EmptyState, LiveDot, SectionLabel, Tag } from "@/components/common";
import { MatchDetailSkel } from "@/components/Skeletons";
import { eventMark, eventName } from "@/lib/matchEvents";
import { competitionLabel, countryLabel, noteLabel, roundLabel } from "@/lib/labels";
import { teamName } from "@/lib/teamNames";
import { useSettings } from "@/lib/settings";
import { useT, type Messages } from "@/lib/i18n";
import { formatLong, formatShort } from "@/lib/dates";
import { eventMinute, parisTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Broadcaster, MatchDetail as Detail, MatchEvent } from "@lucarne/shared";

type Result = "win" | "loss" | "none";

function statusLine(m: Detail, t: Messages): { text: string; live: boolean } | null {
  if (m.status === "live")
    return { text: m.elapsed != null ? `${t.match.live} ${m.elapsed}'` : t.match.live, live: true };
  if (m.status === "postponed") return { text: t.match.postponed, live: false };
  if (m.status === "finished") {
    const text =
      m.statusShort === "PEN"
        ? t.match.penalties
        : m.statusShort === "AET"
          ? t.match.afterExtraTime
          : t.match.fullTime;
    return { text, live: false };
  }
  return null;
}

/** Compact, flat teletext scoreboard: crests + score on one line, names below. */
function Scoreboard({ m, homeResult, awayResult }: { m: Detail; homeResult: Result; awayResult: Result }) {
  const { dateFormat, lang } = useSettings();
  const t = useT();
  const status = statusLine(m, t);
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
        <span className={cn(nameCls(homeResult), "text-right")}>{teamName(m.home.name, lang)}</span>
        <span className="shrink-0 text-muted-foreground">—</span>
        <span className={cn(nameCls(awayResult), "text-left")}>{teamName(m.away.name, lang)}</span>
      </div>

      {pens && (
        <span className="text-xs font-medium text-muted-foreground">
          {t.match.pens} {m.homePenalties}–{m.awayPenalties}
        </span>
      )}
      {status &&
        (status.live ? (
          <Tag className="bg-live py-0.5 text-black">
            <LiveDot className="mr-1" />
            {status.text}
          </Tag>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {status.text}
          </span>
        ))}
      {m.status === "scheduled" && (
        <span className="text-xs uppercase text-muted-foreground">
          {formatShort(new Date(m.kickoff), dateFormat, lang)}
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
      <span className={cn("min-w-0 truncate", home ? "text-[hsl(var(--tt-blue))]" : "text-[hsl(var(--tt-red))]")}>
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
  const { lang } = useSettings();
  const t = useT();
  const note = noteLabel(b.note, lang);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dotted border-border py-1.5">
      <BroadcasterBadge b={b} />
      <span className="truncate text-right text-xs text-muted-foreground">
        {b.coverage === "partial" ? t.match.partial : t.match.full}
        {note ? ` · ${note}` : ""}
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
  const { dateFormat, lang } = useSettings();
  const t = useT();

  if (loading) return <MatchDetailSkel />;
  if (error || !match) {
    return (
      <EmptyState title={t.match.notFound}>
        <Link to="/" className="text-foreground underline underline-offset-2">
          {t.match.backHome}
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

  const rawCountry = comps?.find((c) => c.slug === match.competition.slug)?.country;
  const country = countryLabel(rawCountry, lang);
  const competition = competitionLabel(match.competition.name, lang);
  const round = roundLabel(match.round, lang);
  const goals = match.events.filter((e) => e.type === "Goal");
  const cards = match.events.filter((e) => e.type === "Card");
  const stats = match.statistics;
  const hasStats = stats
    ? [...Object.values(stats.home), ...Object.values(stats.away)].some((v) => v != null)
    : false;

  return (
    <>
      <Link
        to="/competitions/$slug"
        params={{ slug: match.competition.slug }}
        className="mb-2 inline-flex items-center gap-1 text-sm uppercase text-muted-foreground hover:text-foreground"
      >
        ‹ {competition}
      </Link>

      {/* Scoreboard — flat, no card/border/gradient */}
      <div className="tt-bar tt-bar-magenta text-xs">
        <span className="truncate">{competition}</span>
        {round && <span className="tt-bar-r font-semibold normal-case">{round}</span>}
      </div>
      <Scoreboard m={match} homeResult={homeResult} awayResult={awayResult} />

      {goals.length > 0 && (
        <section className="mt-3">
          <SectionLabel>{t.match.goals}</SectionLabel>
          <div className="flex flex-col">
            {goals.map((e, i) => (
              <EventRow key={i} e={e} />
            ))}
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="mt-3">
          <SectionLabel>{t.match.cards}</SectionLabel>
          <div className="flex flex-col">
            {cards.map((e, i) => (
              <EventRow key={i} e={e} />
            ))}
          </div>
        </section>
      )}

      {match.status === "finished" && goals.length === 0 && cards.length === 0 && (
        <p className="mt-3 py-2 text-sm italic text-muted-foreground">{t.match.noGoalsCards}</p>
      )}

      {stats && hasStats && (
        <section className="mt-3">
          <SectionLabel>{t.stats.title}</SectionLabel>
          <MatchStats stats={stats} />
        </section>
      )}

      {match.lineups ? (
        <section className="mt-3">
          <SectionLabel>{t.match.lineups}</SectionLabel>
          <Lineups home={match.lineups.home} away={match.lineups.away} />
        </section>
      ) : (
        match.status === "scheduled" && (
          <p className="mt-3 py-2 text-sm text-muted-foreground">{t.match.lineupsSoon}</p>
        )
      )}

      <section className="mt-3">
        <SectionLabel>{t.match.whereToWatch}</SectionLabel>
        <div className="flex flex-col">
          {match.broadcasters.length > 0 ? (
            match.broadcasters.map((b) => <BroadcasterRow key={b.id} b={b} />)
          ) : (
            <p className="py-2 text-sm italic text-muted-foreground">{t.match.broadcasterTBC}</p>
          )}
        </div>
      </section>

      <section className="mt-3">
        <SectionLabel>{t.match.info}</SectionLabel>
        <dl className="flex flex-col">
          <InfoRow label={t.match.date} value={formatLong(new Date(match.kickoff), dateFormat, lang)} />
          <InfoRow label={t.match.kickoff} value={`${parisTime(match.kickoff)} · Europe/Paris`} />
          {match.venue && <InfoRow label={t.match.venue} value={match.venue} />}
          {match.referee && <InfoRow label={t.match.referee} value={match.referee} />}
          <InfoRow
            label={t.match.competition}
            value={country ? `${competition} · ${country}` : competition}
          />
          {round && <InfoRow label={t.match.round} value={round} />}
        </dl>
      </section>
    </>
  );
}
