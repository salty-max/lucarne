import { cn, textOn } from "@/lib/utils";
import { parisTime } from "@/lib/time";
import type { Broadcaster, Match } from "@lucarne/shared";
import { TeamLogo } from "./Logo";

type Result = "win" | "loss" | "none";

/** Leading "when" cell: kickoff time, live minute, or a full-time tag. */
function StatusCell({ m }: { m: Match }) {
  if (m.status === "live") {
    return (
      <span className="flex items-center gap-1 font-bold tabular-nums text-live">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" />
        {m.elapsed != null ? `${m.elapsed}'` : "LIVE"}
      </span>
    );
  }
  if (m.status === "finished") {
    const label = m.statusShort === "PEN" ? "Pens" : m.statusShort === "AET" ? "AET" : "FT";
    return <span className="text-xs font-semibold text-muted-foreground">{label}</span>;
  }
  if (m.status === "postponed") {
    return <span className="text-xs font-semibold text-[hsl(var(--tt-yellow))]">PP</span>;
  }
  return <span className="font-bold tabular-nums text-[hsl(var(--tt-yellow))]">{parisTime(m.kickoff)}</span>;
}

function Tag({ b }: { b: Broadcaster }) {
  return (
    <span className="tt-tag py-px" style={{ backgroundColor: b.color, color: textOn(b.color) }}>
      {b.name}
    </span>
  );
}

/** One match as a table row. A trailing spacer column absorbs the slack so the
 *  fixture packs left after the time and the broadcasters pin to the right. */
export function MatchCard({ m, onOpen }: { m: Match; onOpen?: () => void }) {
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
      "max-w-[7rem] truncate uppercase sm:max-w-[16rem]",
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
      <td className="whitespace-nowrap py-1 pr-3 text-[0.78rem]">
        <StatusCell m={m} />
      </td>
      <td className="py-1 text-right">
        <span className="flex items-center justify-end gap-1.5">
          <span className={nameCls(homeResult)}>{m.home.name}</span>
          <TeamLogo name={m.home.name} apiLogo={m.home.logo} size={16} />
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-1 text-center font-extrabold tabular-nums text-[hsl(var(--tt-yellow))]">
        {hasScore ? `${m.homeGoals}–${m.awayGoals}` : "–"}
        {pens && (
          <span className="ml-0.5 align-super text-[0.55rem] font-medium text-muted-foreground">
            ({m.homePenalties}-{m.awayPenalties})
          </span>
        )}
      </td>
      <td className="py-1">
        <span className="flex items-center gap-1.5">
          <TeamLogo name={m.away.name} apiLogo={m.away.logo} size={16} />
          <span className={nameCls(awayResult)}>{m.away.name}</span>
        </span>
      </td>
      <td className="w-full" />
      <td className="py-1 pl-3 text-right">
        {m.broadcasters.length > 0 ? (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {m.broadcasters.map((b) => (
              <Tag key={b.id} b={b} />
            ))}
          </span>
        ) : (
          <span className="whitespace-nowrap text-[0.65rem] italic text-muted-foreground">TBC</span>
        )}
      </td>
    </tr>
  );
}
