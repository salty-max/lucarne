import type { ReactNode } from "react";
import type { StandingGroup } from "@lucarne/shared";
import { cn } from "@/lib/utils";
import { TeamLogo } from "./Logo";

/** Last five results as coloured dots. */
function FormDots({ form }: { form: string | null }) {
  if (!form) return null;
  const recent = form.slice(-5).split("");
  return (
    <span className="flex items-center justify-end gap-1">
      {recent.map((c, i) => (
        <span
          key={i}
          title={c}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            c === "W" ? "bg-primary" : c === "L" ? "bg-live" : "bg-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

/** Left accent for a qualification / relegation zone (best-effort from the
 *  API's free-text description). */
function zoneTone(desc: string | null): string {
  if (!desc) return "border-transparent";
  const d = desc.toLowerCase();
  if (/releg|eliminat/.test(d)) return "border-live";
  if (/promot|qualif|champion|advance|round|final|play-?off|next/.test(d)) return "border-primary";
  return "border-muted-foreground/40";
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("px-1.5 py-2 text-right font-medium", className)}>{children}</th>;
}

function GroupTable({ group }: { group: StandingGroup }) {
  return (
    <section className="overflow-hidden rounded-lg bg-card">
      {group.label !== "Overall" && (
        <h3 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {group.label}
        </h3>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-[11px] text-muted-foreground">
            <tr className="border-b">
              <Th className="w-8 text-center">#</Th>
              <th className="px-1.5 py-2 text-left font-medium">Équipe</th>
              <Th>J</Th>
              <Th className="hidden sm:table-cell">G</Th>
              <Th className="hidden sm:table-cell">N</Th>
              <Th className="hidden sm:table-cell">P</Th>
              <Th className="hidden md:table-cell">BP</Th>
              <Th className="hidden md:table-cell">BC</Th>
              <Th>Diff</Th>
              <Th className="hidden lg:table-cell">Forme</Th>
              <Th className="pr-3">Pts</Th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r) => (
              <tr key={`${r.rank}-${r.team.name}`} className="border-b border-border/60 last:border-0">
                <td
                  className={cn(
                    "border-l-2 py-2 pl-2 text-center text-muted-foreground",
                    zoneTone(r.description),
                  )}
                >
                  {r.rank}
                </td>
                <td className="max-w-0 py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <TeamLogo name={r.team.name} apiLogo={r.team.logo} size={20} />
                    <span className="truncate font-medium">{r.team.shortName ?? r.team.name}</span>
                  </div>
                </td>
                <td className="px-1.5 text-right text-muted-foreground">{r.played}</td>
                <td className="hidden px-1.5 text-right text-muted-foreground sm:table-cell">{r.win}</td>
                <td className="hidden px-1.5 text-right text-muted-foreground sm:table-cell">{r.draw}</td>
                <td className="hidden px-1.5 text-right text-muted-foreground sm:table-cell">{r.lose}</td>
                <td className="hidden px-1.5 text-right text-muted-foreground md:table-cell">
                  {r.goalsFor}
                </td>
                <td className="hidden px-1.5 text-right text-muted-foreground md:table-cell">
                  {r.goalsAgainst}
                </td>
                <td className="px-1.5 text-right text-muted-foreground">
                  {r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}
                </td>
                <td className="hidden px-1.5 lg:table-cell">
                  <FormDots form={r.form} />
                </td>
                <td className="pr-3 text-right font-bold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** League table(s): one for a plain league, several for a group cup. */
export function Standings({ groups }: { groups: StandingGroup[] }) {
  return (
    <div className={cn("grid gap-4", groups.length > 1 && "lg:grid-cols-2")}>
      {groups.map((g) => (
        <GroupTable key={g.label} group={g} />
      ))}
    </div>
  );
}
