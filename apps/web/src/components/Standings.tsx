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

/** Qualification / relegation zone → coloured inset bar on the rank cell. */
function zoneClass(desc: string | null): string {
  if (!desc) return "";
  const d = desc.toLowerCase();
  if (/releg|eliminat/.test(d)) return "shadow-[inset_3px_0_0_hsl(var(--live))]";
  if (/promot|qualif|champion|advance|round|final|play-?off|next/.test(d))
    return "shadow-[inset_3px_0_0_hsl(var(--tt-green))]";
  return "shadow-[inset_3px_0_0_hsl(var(--tt-blue))]";
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn("px-1 py-1 text-right font-bold text-[hsl(var(--tt-cyan))]", className)}>
      {children}
    </th>
  );
}

function GroupTable({ group }: { group: StandingGroup }) {
  return (
    <section>
      {group.label !== "Overall" && (
        <h3 className="tt-bar mb-1 text-xs">{group.label}</h3>
      )}
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr>
            <Th className="w-6 text-center">#</Th>
            <th className="px-1 py-1 text-left font-bold text-[hsl(var(--tt-cyan))]">Team</th>
            <Th>Pl</Th>
            <Th className="hidden sm:table-cell">W</Th>
            <Th className="hidden sm:table-cell">D</Th>
            <Th className="hidden sm:table-cell">L</Th>
            <Th>GD</Th>
            <Th className="hidden lg:table-cell">Form</Th>
            <Th>Pts</Th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r) => (
            <tr key={`${r.rank}-${r.team.name}`} className="border-b border-dotted border-border">
              <td
                className={cn(
                  "px-1 py-1 text-center font-bold text-[hsl(var(--tt-yellow))]",
                  zoneClass(r.description),
                )}
              >
                {r.rank}
              </td>
              <td className="max-w-0 truncate px-1 py-1">
                <span className="flex items-center gap-1.5">
                  <TeamLogo name={r.team.name} apiLogo={r.team.logo} size={16} />
                  <span className="truncate uppercase">{r.team.shortName ?? r.team.name}</span>
                </span>
              </td>
              <td className="px-1 text-right text-muted-foreground">{r.played}</td>
              <td className="hidden px-1 text-right text-muted-foreground sm:table-cell">{r.win}</td>
              <td className="hidden px-1 text-right text-muted-foreground sm:table-cell">{r.draw}</td>
              <td className="hidden px-1 text-right text-muted-foreground sm:table-cell">{r.lose}</td>
              <td className="px-1 text-right text-muted-foreground">
                {r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}
              </td>
              <td className="hidden px-1 lg:table-cell">
                <FormDots form={r.form} />
              </td>
              <td className="px-1 text-right font-extrabold text-[hsl(var(--tt-green))]">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
