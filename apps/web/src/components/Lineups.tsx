import type { LineupPlayer, TeamLineup } from "@lucarne/shared";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/** Rating badge colour — green (good) / yellow (ok) / red (poor). The red badge
 *  (a pill) reads distinctly from the away team's red number disc. */
function ratingClass(r: number): string {
  if (r >= 7) return "bg-[hsl(var(--tt-green))] text-black";
  if (r >= 6) return "bg-[hsl(var(--tt-yellow))] text-black";
  return "bg-[hsl(var(--tt-red))] text-white";
}

function Rating({ value }: { value: number }) {
  return (
    <span className={cn("rounded px-1 text-[9px] font-bold leading-tight tabular-nums", ratingClass(value))}>
      {value.toFixed(1)}
    </span>
  );
}

/** Group a starting XI into formation lines, back (GK) to front, by the API grid
 *  "row:col" (col 1 = the team's left). `mirror` reverses each line for the away
 *  team, which attacks downward on the shared pitch. */
function pitchLines(xi: LineupPlayer[], mirror = false): LineupPlayer[][] {
  const orient = (lines: LineupPlayer[][]) => (mirror ? lines.map((l) => [...l].reverse()) : lines);

  if (!xi.some((p) => p.grid)) {
    const byPos = ["G", "D", "M", "F"].map((o) => xi.filter((p) => p.pos === o)).filter((l) => l.length);
    return orient(byPos.length ? byPos : [xi]);
  }
  const rows = new Map<number, LineupPlayer[]>();
  for (const p of xi) {
    const row = Number((p.grid ?? "0:0").split(":")[0]);
    (rows.get(row) ?? rows.set(row, []).get(row)!).push(p);
  }
  const lines = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ps]) =>
      ps.sort(
        (a, b) => Number((a.grid ?? "0:0").split(":")[1]) - Number((b.grid ?? "0:0").split(":")[1]),
      ),
    );
  return orient(lines);
}

function PitchPlayer({ p, side }: { p: LineupPlayer; side: "home" | "away" }) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-0.5 px-0.5">
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold",
          side === "home" ? "bg-[hsl(var(--tt-blue))] text-black" : "bg-[hsl(var(--tt-red))] text-white",
        )}
      >
        {p.number ?? ""}
      </span>
      <span className="max-w-full truncate text-center text-[9px] leading-tight text-foreground/90">
        {lastName(p.name)}
      </span>
      {p.rating != null && <Rating value={p.rating} />}
    </div>
  );
}

/** One team's half. Horizontal pitch: home fills left→right (GK leftmost),
 *  away fills right→left. Each formation line is a vertical column of players. */
function PitchHalf({ lines, side }: { lines: LineupPlayer[][]; side: "home" | "away" }) {
  return (
    <div className={cn("flex flex-1", side === "home" ? "flex-row" : "flex-row-reverse")}>
      {lines.map((line, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-around py-1">
          {line.map((p, j) => (
            <PitchPlayer key={j} p={p} side={side} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Pitch({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  return (
    <div
      className="relative aspect-16/11 overflow-hidden"
      style={{ background: "linear-gradient(hsl(146 48% 15%), hsl(146 52% 11%))" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/30" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30"
      />
      <div className="relative flex h-full flex-row">
        <PitchHalf lines={pitchLines(home.startXI)} side="home" />
        <PitchHalf lines={pitchLines(away.startXI, true)} side="away" />
      </div>
    </div>
  );
}

function Bench({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  const t = useT();
  const col = (subs: LineupPlayer[], align: "left" | "right") => (
    <ul className="flex min-w-0 flex-col gap-1">
      {subs.map((p, i) => (
        <li
          key={i}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            align === "right" && "flex-row-reverse text-right",
          )}
        >
          <span className="min-w-[1.6ch] tabular-nums text-muted-foreground">{p.number ?? ""}</span>
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {p.rating != null && <Rating value={p.rating} />}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t.match.substitutes}
      </p>
      <div className="grid grid-cols-2 gap-x-4">
        {col(home.substitutes, "left")}
        {col(away.substitutes, "right")}
      </div>
    </div>
  );
}

/** Formation pitch + bench + coaches for a match's two lineups. */
export function Lineups({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  const t = useT();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-bold">
        <span className="flex items-center gap-1.5 text-[hsl(var(--tt-blue))]">
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--tt-blue))]" />
          {home.formation ?? "—"}
        </span>
        <span className="flex items-center gap-1.5 text-[hsl(var(--tt-red))]">
          {away.formation ?? "—"}
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--tt-red))]" />
        </span>
      </div>
      <Pitch home={home} away={away} />
      <Bench home={home} away={away} />
      {(home.coach || away.coach) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{home.coach ? `${t.match.coach} · ${home.coach}` : ""}</span>
          <span className="truncate text-right">{away.coach ? `${away.coach} · ${t.match.coach}` : ""}</span>
        </div>
      )}
    </div>
  );
}
