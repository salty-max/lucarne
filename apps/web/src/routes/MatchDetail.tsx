import { Link, useParams } from "@tanstack/react-router";
import { useMatch } from "@/hooks/useMatch";
import { useWatch } from "@/hooks/useWatch";
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
  if (m.status === "live") {
    const min = m.elapsed != null ? `${m.elapsed}'` : "";
    const at =
      m.statusShort === "HT"
        ? t.card.ht
        : m.statusShort === "P"
          ? t.card.pens
          : m.statusShort === "ET"
            ? `${t.card.bt} ${min}`.trim() // extra time in play → "Prol. 92'"
            : m.statusShort === "BT"
              ? t.card.bt // break before/within extra time → "Prol." (clock paused)
              : min;
    return { text: at ? `${t.match.live} ${at}` : t.match.live, live: true };
  }
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

/** Flat teletext scoreboard: two big team rows (name + goals), status below. */
function Scoreboard({ m, homeResult, awayResult }: { m: Detail; homeResult: Result; awayResult: Result }) {
  const { dateFormat, lang } = useSettings();
  const t = useT();
  const status = statusLine(m, t);
  const scheduled = m.status === "scheduled";
  const pens = m.homePenalties != null && m.awayPenalties != null;
  // How long the match ran — shown next to the final status (90', 120' for ET…).
  const duration = m.status === "finished" && m.elapsed != null ? `${m.elapsed}'` : null;

  const nameCls = (r: Result) =>
    cn(
      "tt-2h min-w-0 flex-1 truncate uppercase leading-tight",
      r === "win" ? "font-bold text-[hsl(var(--tt-green))]" : "font-semibold",
    );

  const rows = [
    { name: teamName(m.home.name, lang), goals: m.homeGoals, pen: pens ? m.homePenalties : null, result: homeResult },
    { name: teamName(m.away.name, lang), goals: m.awayGoals, pen: pens ? m.awayPenalties : null, result: awayResult },
  ];

  return (
    <div className="py-3">
      {scheduled && (
        <div className="mb-1.5 text-center tt-2h font-bold tabular-nums text-[hsl(var(--tt-yellow))]">
          {parisTime(m.kickoff)}
        </div>
      )}
      <div className="mx-auto max-w-sm">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-dotted border-border py-1.5 last:border-b-0"
          >
            <span className={cn(nameCls(r.result), scheduled && "text-center")}>{r.name}</span>
            {!scheduled && (
              <span className="tt-2h shrink-0 font-extrabold tabular-nums text-[hsl(var(--tt-yellow))]">
                {r.goals ?? 0}
                {r.pen != null && (
                  <span className="ml-1 align-middle text-base font-medium text-muted-foreground">
                    ({r.pen})
                  </span>
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex flex-col items-center gap-1">
        {status &&
          (status.live ? (
            <Tag className="bg-live py-0.5 text-[hsl(var(--tt-red-on))]">
              <LiveDot className="mr-1" />
              {status.text}
            </Tag>
          ) : (
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">
              {status.text}
              {duration && <span className="text-muted-foreground/70"> · {duration}</span>}
            </span>
          ))}
        {scheduled && (
          <span className="uppercase text-muted-foreground">
            {formatShort(new Date(m.kickoff), dateFormat, lang)}
          </span>
        )}
      </div>
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
    <div className="grid grid-cols-2 items-center gap-3 border-b border-dotted border-border py-0.5 ">
      <div className="flex min-w-0 justify-start">{home && body}</div>
      <div className="flex min-w-0 justify-end">{!home && body}</div>
    </div>
  );
}

/** One substitution, full width (two names don't fit the team-split columns).
 *  `assist` = player IN (▲, in the team colour), `player` = player OUT (▼, muted). */
function SubRow({ e }: { e: MatchEvent }) {
  const inCls = e.side === "home" ? "text-[hsl(var(--tt-blue))]" : "text-[hsl(var(--tt-red))]";
  return (
    <div className="flex items-baseline gap-2 border-b border-dotted border-border py-0.5">
      <span className="w-9 shrink-0 font-bold tabular-nums text-[hsl(var(--tt-yellow))]">
        {eventMinute(e.minute, e.extraMinute)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {e.assist && <span className={inCls}>▲ {e.assist}</span>}
        {e.assist && e.player && <span className="text-muted-foreground"> · </span>}
        {e.player && <span className="text-muted-foreground">▼ {e.player}</span>}
      </span>
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
      <span className="truncate text-right text-muted-foreground">
        {b.coverage === "partial" ? t.match.partial : t.match.full}
        {note ? ` · ${note}` : ""}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dotted border-border py-1.5">
      <dt className="uppercase text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}

/** The surveillance toggle on the detail header (labelled, unlike the list switch). */
function WatchButton({ on, onToggle, t }: { on: boolean; onToggle: () => void; t: Messages }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2 border px-3 py-1.5 font-bold uppercase tracking-wide transition-colors",
        on
          ? "border-[hsl(var(--tt-green))] bg-[hsl(var(--tt-green))]/15 text-[hsl(var(--tt-green))]"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn("h-2.5 w-2.5 rounded-full", on ? "bg-[hsl(var(--tt-green))]" : "bg-muted-foreground")}
      />
      {on ? `${t.watch.watching} ✓` : t.watch.watch}
    </button>
  );
}

/** Shown instead of goals/stats for a LIVE match you're not watching: the score
 *  above is already live, but the minute-by-minute detail needs surveillance. */
function LiveWatchPanel({ onWatch, t }: { onWatch: () => void; t: Messages }) {
  return (
    <section className="mt-3">
      <SectionLabel>{`${t.match.goals} · ${t.stats.title}`}</SectionLabel>
      <div className="border border-dashed border-border p-4 text-center">
        <p className="leading-relaxed text-muted-foreground">
          {t.watch.liveHint}
          <br />
          {t.watch.scoreLive}
        </p>
        <button
          type="button"
          onClick={onWatch}
          className="mt-3 inline-flex items-center gap-2 border border-[hsl(var(--tt-green))] px-3 py-2 font-bold uppercase tracking-wide text-[hsl(var(--tt-green))]"
        >
          ▸ {t.watch.watchForLive}
        </button>
      </div>
    </section>
  );
}

/** Pre-match prediction: a 3-way win-probability bar (home / draw / away) + the
 *  API's one-line tip. Home is blue, away red — matching the events colours. */
function PredictionSection({ m, t }: { m: Detail; t: Messages }) {
  const p = m.predictions;
  if (!p) return null;
  return (
    <section className="mt-3">
      <SectionLabel>{t.prediction.title}</SectionLabel>
      <div className="flex items-center justify-between font-bold tabular-nums">
        <span className="text-[hsl(var(--tt-blue))]">{p.home}%</span>
        <span className="text-muted-foreground">
          {t.prediction.draw} {p.draw}%
        </span>
        <span className="text-[hsl(var(--tt-red))]">{p.away}%</span>
      </div>
      <div className="mt-1 flex h-2.5 w-full overflow-hidden">
        <div className="bg-[hsl(var(--tt-blue))]" style={{ width: `${p.home}%` }} />
        <div className="bg-muted-foreground/50" style={{ width: `${p.draw}%` }} />
        <div className="bg-[hsl(var(--tt-red))]" style={{ width: `${p.away}%` }} />
      </div>
    </section>
  );
}

export default function MatchDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { match, loading, error } = useMatch(Number(id));
  const comps = useCompetitions();
  const { dateFormat, lang } = useSettings();
  const t = useT();
  const { isWatched, toggle } = useWatch();

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
  const subs = match.events.filter((e) => e.type === "subst");
  const stats = match.statistics;
  const hasStats = stats
    ? [...Object.values(stats.home), ...Object.values(stats.away)].some((v) => v != null)
    : false;

  const watched = isWatched(match);
  const watchable = match.status === "scheduled" || match.status === "live";
  // Live match you're not monitoring → the detail (scorers/stats) isn't flowing;
  // show the "watch for live" panel instead of the empty sections.
  const liveUnwatched = match.status === "live" && !watched;
  // Just started watching a live match: enrichment lands on the next tick.
  const awaitingLive = match.status === "live" && watched && goals.length === 0 && cards.length === 0 && !hasStats;

  return (
    <>
      <Link
        to="/competitions/$slug"
        params={{ slug: match.competition.slug }}
        className="mb-2 inline-flex items-center gap-1 uppercase text-muted-foreground hover:text-foreground"
      >
        ‹ {competition}
      </Link>

      {/* Scoreboard — flat, no card/border/gradient */}
      <div className="tt-bar tt-bar-magenta ">
        <span className="truncate">{competition}</span>
        {round && <span className="tt-bar-r font-semibold normal-case">{round}</span>}
      </div>
      <Scoreboard m={match} homeResult={homeResult} awayResult={awayResult} />

      {watchable && (
        <div className="mt-1 flex justify-center">
          <WatchButton on={watched} onToggle={() => toggle(match)} t={t} />
        </div>
      )}

      <PredictionSection m={match} t={t} />

      {liveUnwatched ? (
        <LiveWatchPanel onWatch={() => toggle(match)} t={t} />
      ) : (
        <>
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

          {subs.length > 0 && (
            <section className="mt-3">
              <SectionLabel>{t.match.subs}</SectionLabel>
              <div className="flex flex-col">
                {subs.map((e, i) => (
                  <SubRow key={i} e={e} />
                ))}
              </div>
            </section>
          )}

          {match.status === "finished" && goals.length === 0 && cards.length === 0 && (
            <p className="mt-3 py-2 italic text-muted-foreground">{t.match.noGoalsCards}</p>
          )}

          {awaitingLive && (
            <p className="mt-3 py-2 italic text-muted-foreground">{t.watch.activating}</p>
          )}

          {stats && hasStats && (
            <section className="mt-3">
              <SectionLabel>{t.stats.title}</SectionLabel>
              <MatchStats stats={stats} />
            </section>
          )}
        </>
      )}

      {match.motm && match.motm.rating > 0 && (
        <section className="mt-3">
          <SectionLabel>{t.match.motm}</SectionLabel>
          <div className="flex items-center gap-2 py-1.5">
            <span>⭐</span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-semibold uppercase",
                match.motm.side === "home"
                  ? "text-[hsl(var(--tt-blue))]"
                  : "text-[hsl(var(--tt-red))]",
              )}
            >
              {match.motm.name}
            </span>
            <span className="shrink-0 px-1 font-bold tabular-nums text-black bg-[hsl(var(--tt-green))]">
              {match.motm.rating.toFixed(1)}
            </span>
          </div>
        </section>
      )}

      {match.lineups ? (
        <section className="mt-3">
          <SectionLabel>{t.match.lineups}</SectionLabel>
          <Lineups home={match.lineups.home} away={match.lineups.away} />
        </section>
      ) : (
        match.status === "scheduled" && (
          <p className="mt-3 py-2 text-muted-foreground">{t.match.lineupsSoon}</p>
        )
      )}

      <section className="mt-3">
        <SectionLabel>{t.match.whereToWatch}</SectionLabel>
        <div className="flex flex-col">
          {match.broadcasters.length > 0 ? (
            match.broadcasters.map((b) => <BroadcasterRow key={b.id} b={b} />)
          ) : (
            <p className="py-2 italic text-muted-foreground">{t.match.broadcasterTBC}</p>
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
