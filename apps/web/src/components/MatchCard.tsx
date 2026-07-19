import { cn } from "@/lib/utils";
import { parisTime } from "@/lib/time";
import type { Match } from "@lucarne/shared";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { teamName } from "@/lib/teamNames";
import { channelTt } from "@/lib/channelColor";
import { LiveDot, Tag } from "./common";

type Result = "win" | "loss" | "none";

/** Leading "when" cell: kickoff time, live minute, or a full-time tag. */
function StatusCell({ m }: { m: Match }) {
  const t = useT();
  if (m.status === "live") {
    // HT / shootout / extra-time break get their own tag; otherwise the running
    // minute (which keeps counting through stoppage 90'+ and extra time to 120').
    const label =
      m.statusShort === "HT"
        ? t.card.ht
        : m.statusShort === "P"
          ? t.card.pens
          : m.statusShort === "BT"
            ? t.card.bt
            : m.elapsed != null
              ? `${m.elapsed}'`
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
      "inline-block max-w-[7rem] truncate align-middle uppercase sm:max-w-[16rem]",
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
      <td className="whitespace-nowrap py-2.5 pr-3 align-middle sm:py-1.5">
        <StatusCell m={m} />
      </td>
      <td className="py-2.5 align-middle sm:py-1.5">
        <span className="flex items-center gap-2">
          <span className={nameCls(homeResult)}>{teamName(m.home.name, lang)}</span>
          <span className="hrink-0 whitespace-nowrap text-center font-extrabold tabular-nums">
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
      <td className="w-full" />
      <td className="whitespace-nowrap py-2.5 pl-3 text-right align-middle sm:py-1.5">
        {hideBroadcasters ? null : m.broadcasters.length > 0 ? (
          <span className="inline-flex items-center justify-end gap-1">
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
