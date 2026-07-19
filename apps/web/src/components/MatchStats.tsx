import type { MatchStatistics, TeamStats } from "@lucarne/shared";
import { useT } from "@/lib/i18n";

/** Rows below possession, in display order. `pct` appends %, `dp` sets decimals. */
const ROWS: { key: Exclude<keyof TeamStats, "possession">; pct?: boolean; dp?: number }[] = [
  { key: "shots" },
  { key: "shotsOnTarget" },
  { key: "shotsOffTarget" },
  { key: "blockedShots" },
  { key: "shotsInsideBox" },
  { key: "shotsOutsideBox" },
  { key: "xg", dp: 2 },
  { key: "corners" },
  { key: "fouls" },
  { key: "yellowCards" },
  { key: "redCards" },
  { key: "offsides" },
  { key: "saves" },
  { key: "goalsPrevented", dp: 2 },
  { key: "passAccuracy", pct: true },
];

const fmt = (v: number | null, pct?: boolean, dp?: number) =>
  v == null ? "—" : `${dp != null ? v.toFixed(dp) : v}${pct ? "%" : ""}`;

/** Teletext match statistics: a possession bar (home green / away cyan) plus a
 * centred label column with each team's value on its side. */
export function MatchStats({ stats }: { stats: MatchStatistics }) {
  const t = useT();
  const { home, away } = stats;
  const rows = ROWS.filter((r) => home[r.key] != null || away[r.key] != null);
  const possession = home.possession != null && away.possession != null;

  if (!possession && rows.length === 0) return null;

  return (
    <div className="flex flex-col">
      {possession && (
        <div className="border-b border-dotted border-border py-1.5">
          <div className="flex items-center justify-between font-bold tabular-nums">
            <span className="text-[hsl(var(--tt-blue))]">{home.possession}%</span>
            <span className="uppercase text-muted-foreground">{t.stats.possession}</span>
            <span className="text-[hsl(var(--tt-red))]">{away.possession}%</span>
          </div>
          <div className="mt-1 flex h-2 overflow-hidden">
            <span
              style={{ width: `${home.possession}%` }}
              className="border-r-2 border-background bg-[hsl(var(--tt-blue))]"
            />
            <span style={{ width: `${away.possession}%` }} className="bg-[hsl(var(--tt-red))]" />
          </div>
        </div>
      )}
      {rows.map((r) => (
        <div
          key={r.key}
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-dotted border-border py-1 "
        >
          <span className="text-left font-bold tabular-nums text-[hsl(var(--tt-blue))]">
            {fmt(home[r.key], r.pct, r.dp)}
          </span>
          <span className="text-center uppercase text-muted-foreground">{t.stats[r.key]}</span>
          <span className="text-right font-bold tabular-nums text-[hsl(var(--tt-red))]">
            {fmt(away[r.key], r.pct, r.dp)}
          </span>
        </div>
      ))}
    </div>
  );
}
