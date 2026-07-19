import type { TopPlayerEntry } from "@lucarne/shared";
import { useSettings } from "@/lib/settings";
import { teamName } from "@/lib/teamNames";

/** A top-scorers / top-assists ranking as a flat teletext table: rank · player ·
 *  team · value (goals or assists). */
export function TopPlayers({ entries, valueLabel }: { entries: TopPlayerEntry[]; valueLabel: string }) {
  const { lang } = useSettings();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse tabular-nums">
        <thead>
          <tr className="border-b border-border uppercase text-muted-foreground">
            <th className="w-8 py-1 pr-2 text-right font-semibold">#</th>
            <th className="py-1 text-left font-semibold">{/* player · team */}</th>
            <th className="w-8 py-1 pl-2 text-right font-semibold">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.rank} className="border-b border-dotted border-border">
              <td className="py-1 pr-2 text-right font-bold tabular-nums text-muted-foreground">{e.rank}</td>
              <td className="min-w-0 py-1">
                <span className="font-semibold uppercase">{e.player}</span>
                <span className="truncate text-muted-foreground"> · {teamName(e.team, lang)}</span>
              </td>
              <td className="py-1 pl-2 text-right font-extrabold tabular-nums text-[hsl(var(--tt-yellow))]">
                {e.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
