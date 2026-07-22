import { cn } from "@/lib/utils";
import { eventMinute, parisTime } from "@/lib/time";
import type { Match } from "@lucarne/shared";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { teamName } from "@/lib/teamNames";
import { channelTt } from "@/lib/channelColor";
import { useWatch } from "@/hooks/useWatch";
import { LiveDot, Tag } from "./common";
import { RadarSwitch } from "./RadarSwitch";

type Result = "win" | "loss" | "none";

/** Leading "when" cell: kickoff time, live minute, or a full-time tag. */
function StatusCell({ m }: { m: Match }) {
  const t = useT();
  if (m.status === "live") {
    // HT / shootout / extra-time break get their own tag; otherwise the running
    // minute — with stoppage as 90+X (the API caps `elapsed` at 90 and carries
    // the added minutes in `elapsedExtra`), up to 120' in extra time.
    const label =
      m.statusShort === "HT"
        ? t.card.ht
        : m.statusShort === "P"
          ? t.card.pens
          : m.statusShort === "BT"
            ? t.card.bt
            : m.elapsed != null
              ? eventMinute(m.elapsed, m.elapsedExtra)
              : t.card.live;
    return (
      <span className="flex items-center gap-1 font-bold tabular-nums text-live">
        <LiveDot />
        {label}
      </span>
    );
  }
  if (m.status === "finished") {
    const label = m.statusShort === "PEN" ? t.card.pens : m.statusShort === "AET" ? t.card.aet : t.card.ft;
    return <span className="font-semibold text-muted-foreground">{label}</span>;
  }
  if (m.status === "postponed") {
    return <span className="font-semibold text-[hsl(var(--tt-yellow))]">{t.card.pp}</span>;
  }
  return <span className="font-bold tabular-nums text-[hsl(var(--tt-yellow))]">{parisTime(m.kickoff)}</span>;
}

/** One match as a table row. A trailing spacer column absorbs the slack so the
 * fixture packs left after the time and the broadcasters pin to the right. */
export function MatchCard({
  m,
  onOpen,
  hideBroadcasters,
}: {
  m: Match;
  onOpen?: () => void;
  hideBroadcasters?: boolean;
}) {
  const { lang } = useSettings();
  const t = useT();
  const { isWatched, toggle } = useWatch();
  const watchable = m.status === "scheduled" || m.status === "live";
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
  const hasScore = m.homeGoals != null && m.awayGoals != null;

  const nameCls = (r: Result) =>
    cn(
      // min-w-0 lets the name shrink & ellipsize when the row is tight (narrow
      // phones) instead of forcing the table wider than the viewport.
      "min-w-0 max-w-[7rem] truncate align-middle uppercase sm:max-w-[16rem]",
      r === "win" ? "font-bold text-[hsl(var(--tt-green))]" : "text-foreground",
    );

  return (
    <tr
      data-nav
      onClick={onOpen}
      className={cn(
        "cursor-pointer border-b border-dotted border-border align-middle transition-colors hover:bg-accent",
        m.status === "live" && "bg-live/5",
      )}
    >
      <td
        className="py-2.5 pl-0.5 pr-2 align-middle sm:py-1.5"
        onClick={watchable ? (e) => e.stopPropagation() : undefined}
      >
        {watchable && (
          <RadarSwitch on={isWatched(m)} onToggle={() => toggle(m)} label={t.watch.watch} />
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 align-middle sm:py-1.5">
        <StatusCell m={m} />
      </td>
      {/* Flexible fixture column: absorbs the row's slack (packing left after
          the time, broadcasters pinned right) AND shrinks the team names when
          space is tight, so the row never forces a horizontal scroll. `max-w-0`
          stops the auto-table from sizing this column to the names' intrinsic
          width — the trick that lets the names actually truncate on narrow phones. */}
      <td className="w-full max-w-0 py-2.5 align-middle sm:py-1.5">
        <span className="flex items-center gap-2">
          <span className={nameCls(homeResult)}>{teamName(m.home.name, lang)}</span>
          <span className="shrink-0 whitespace-nowrap text-center font-extrabold tabular-nums">
            {hasScore ? (
              <span className="block leading-none text-[hsl(var(--tt-yellow))]">
                {m.homeGoals}–{m.awayGoals}
              </span>
            ) : (
              <span className="block leading-none text-muted-foreground">—</span>
            )}
            {pens && (
              <span className="mt-0.5 block font-medium leading-none text-muted-foreground">
                ({m.homePenalties}-{m.awayPenalties})
              </span>
            )}
          </span>
          <span className={nameCls(awayResult)}>{teamName(m.away.name, lang)}</span>
        </span>
      </td>
      <td className="py-2.5 pl-3 text-right align-middle sm:py-1.5">
        {hideBroadcasters ? null : m.broadcasters.length > 0 ? (
          // Wrap to a second line (right-aligned) when the row is too tight for
          // all broadcasters — stays one line whenever there's room (desktop).
          <span className="flex flex-wrap items-center justify-end gap-1">
            {m.broadcasters.map((b) => (
              <Tag key={b.id} ttColor={channelTt(b.color)}>
                {b.name}
              </Tag>
            ))}
          </span>
        ) : (
          <span className="italic text-muted-foreground">{t.card.tbc}</span>
        )}
      </td>
    </tr>
  );
}
