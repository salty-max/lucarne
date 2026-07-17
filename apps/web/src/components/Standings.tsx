import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { StandingGroup } from "@lucarne/shared";
import { cn } from "@/lib/utils";

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

type Zone = { key: string; color: string; label: string };

/** Map a qualification/relegation note to a teletext zone. Order matters:
 *  play-offs must win over the promotion/relegation keywords they contain, and
 *  "Round of N"/knockout descriptions mean *advanced* (green), not a play-off. */
function zoneOf(desc: string | null): Zone | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (/play-?off/.test(d)) return { key: "playoff", color: "--tt-yellow", label: "Play-offs" };
  if (/relegat|eliminat/.test(d)) return { key: "releg", color: "--live", label: "Relegation" };
  if (/promot/.test(d)) return { key: "promo", color: "--tt-green", label: "Promotion" };
  if (/champions league/.test(d)) return { key: "ucl", color: "--tt-green", label: "Champions League" };
  if (/europa/.test(d)) return { key: "uel", color: "--tt-cyan", label: "Europa League" };
  if (/conference|ecl/.test(d)) return { key: "uecl", color: "--tt-blue", label: "Conference League" };
  if (/round of|knockout|advance|qualif|next/.test(d))
    return { key: "adv", color: "--tt-green", label: "Qualified" };
  return null;
}

const ZONE_ORDER = ["promo", "ucl", "adv", "uel", "uecl", "playoff", "releg"];

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn("px-1 py-1 text-right font-bold text-[hsl(var(--tt-cyan))]", className)}>
      {children}
    </th>
  );
}

/** One table with a deterministic (table-fixed) column layout so every group's
 *  columns line up, on their own and side by side. `zones` off before kickoff. */
function GroupTable({ group, zones }: { group: StandingGroup; zones: boolean }) {
  return (
    <section>
      {group.label !== "Overall" && <h3 className="tt-bar mb-1 text-xs">{group.label}</h3>}
      <table className="w-full table-fixed border-collapse text-sm tabular-nums">
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-8" />
          <col className="hidden w-8 sm:table-column" />
          <col className="hidden w-8 sm:table-column" />
          <col className="hidden w-8 sm:table-column" />
          <col className="w-11" />
          <col className="hidden w-14 lg:table-column" />
          <col className="w-9" />
        </colgroup>
        <thead>
          <tr>
            <Th className="text-center">#</Th>
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
          {group.rows.map((r) => {
            const zone = zones ? zoneOf(r.description) : null;
            return (
              <tr key={`${r.rank}-${r.team.name}`} className="border-b border-dotted border-border">
                <td
                  className="px-1 py-1 text-center font-bold text-[hsl(var(--tt-yellow))]"
                  style={zone ? { boxShadow: `inset 3px 0 0 hsl(var(${zone.color}))` } : undefined}
                  title={zone ? (r.description ?? undefined) : undefined}
                >
                  {r.rank}
                </td>
                <td className="truncate px-1 py-1 uppercase">{r.team.shortName ?? r.team.name}</td>
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
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Distinct zones present, in a sensible order, for the legend. */
function legendZones(groups: StandingGroup[]): Zone[] {
  const map = new Map<string, Zone>();
  for (const g of groups) for (const r of g.rows) {
    const z = zoneOf(r.description);
    if (z) map.set(z.key, z);
  }
  return ZONE_ORDER.map((k) => map.get(k)).filter((z): z is Zone => z != null);
}

/** The legend, portaled into the shell slot so it sits glued above the footer
 *  (never scrolls, never jumps). */
function Legend({ zones }: { zones: Zone[] }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("tt-legend-slot")), []);
  if (!slot) return null;
  return createPortal(
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
      {zones.map((z) => (
        <span key={z.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5" style={{ background: `hsl(var(${z.color}))` }} />
          {z.label}
        </span>
      ))}
    </div>,
    slot,
  );
}

/** League table(s): one for a plain league, several for a group cup. Zone
 *  accents + legend only show once the competition has kicked off. */
export function Standings({ groups }: { groups: StandingGroup[] }) {
  const started = groups.some((g) => g.rows.some((r) => r.played > 0));
  const zones = started ? legendZones(groups) : [];
  return (
    <div>
      <div className={cn("grid gap-4", groups.length > 1 && "lg:grid-cols-2")}>
        {groups.map((g) => (
          <GroupTable key={g.label} group={g} zones={started} />
        ))}
      </div>
      {zones.length > 0 && <Legend zones={zones} />}
    </div>
  );
}
