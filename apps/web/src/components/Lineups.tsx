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
  if (r >= 7) return "bg-[hsl(var(--tt-green))]";
  if (r >= 6) return "bg-[hsl(var(--tt-yellow))]";
  return "bg-[hsl(var(--tt-red))]";
}

function Rating({ value }: { value: number }) {
  return (
    <span className={cn("px-1 text-[9px] font-bold leading-tight tabular-nums text-black", ratingClass(value))}>
      {value.toFixed(1)}
    </span>
  );
}

/** "4-2-3-1" → [4, 2, 3, 1] (the outfield lines), or null if it doesn't parse. */
function parseFormation(f: string | null | undefined): number[] | null {
  if (!f) return null;
  const nums = f.split(/[-–]/).map((n) => Number.parseInt(n.trim(), 10));
  return nums.length >= 2 && nums.every((n) => n > 0) ? nums : null;
}

/** Split a group into balanced sub-lines of at most `cap` each, so a coarse
 *  fallback never renders a wall of players. */
function splitLine(players: LineupPlayer[], cap = 4): LineupPlayer[][] {
  if (players.length <= cap) return [players];
  const lines = Math.ceil(players.length / cap);
  const per = Math.ceil(players.length / lines);
  const out: LineupPlayer[][] = [];
  for (let i = 0; i < players.length; i += per) out.push(players.slice(i, i + per));
  return out;
}

/** Arrange a starting XI into formation lines, back (GK) to front. Three sources,
 *  best first: the API `grid` ("row:col", col 1 = team's left — the real position);
 *  else the formation string (canonical lines, ordered by listed position); else a
 *  coarse position grouping with oversized lines split. `mirror` flips each line
 *  for the away team, which attacks downward on the shared pitch. */
function pitchLines(
  xi: LineupPlayer[],
  formation: string | null | undefined,
  mirror = false,
): LineupPlayer[][] {
  const orient = (lines: LineupPlayer[][]) => (mirror ? lines.map((l) => [...l].reverse()) : lines);

  // 1. Precise: the API grid gives each player's real row + column.
  if (xi.some((p) => p.grid)) {
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

  const gk = xi.find((p) => p.pos === "G") ?? xi[0];
  const outfield = xi.filter((p) => p !== gk);

  // 2. Canonical: slice by the formation string (GK + its numbers), ordering the
  //    outfielders defence → midfield → attack.
  const sizes = parseFormation(formation);
  if (sizes && sizes.reduce((a, b) => a + b, 0) === outfield.length) {
    const rank: Record<string, number> = { D: 0, M: 1, F: 2 };
    const ordered = [...outfield].sort((a, b) => (rank[a.pos ?? "M"] ?? 1) - (rank[b.pos ?? "M"] ?? 1));
    const lines: LineupPlayer[][] = [[gk]];
    let i = 0;
    for (const n of sizes) {
      lines.push(ordered.slice(i, i + n));
      i += n;
    }
    return orient(lines);
  }

  // 3. Fallback: group by coarse position, splitting any oversized line.
  const groups = ["G", "D", "M", "F"].map((o) => xi.filter((p) => p.pos === o)).filter((l) => l.length);
  const lines = (groups.length ? groups : [xi]).flatMap((g) => splitLine(g));
  return orient(lines);
}

function PitchPlayer({ p, side }: { p: LineupPlayer; side: "home" | "away" }) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-0.5 px-0.5">
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold",
          side === "home"
            ? "bg-[hsl(var(--tt-blue))] text-[hsl(var(--tt-blue-on))]"
            : "bg-[hsl(var(--tt-red))] text-[hsl(var(--tt-red-on))]",
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

/** One team's half. Vertical pitch (mobile): lines stack, each line a row of
 *  players across the full width — home GK at the bottom, away GK at the top.
 *  Horizontal pitch (sm+): home fills left→right (GK leftmost), away right→left,
 *  each line a vertical column. */
function PitchHalf({ lines, side }: { lines: LineupPlayer[][]; side: "home" | "away" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1",
        side === "home"
          ? "flex-col-reverse sm:flex-row" // GK at bottom (mobile) / left (desktop)
          : "flex-col sm:flex-row-reverse", // GK at top (mobile) / right (desktop)
      )}
    >
      {lines.map((line, i) => (
        // Depth weighting: the GK (back line) hugs the goal; outfield lines share
        // the rest evenly. Just enough to feel natural, no per-formation template.
        <div
          key={i}
          style={{ flexGrow: i === 0 ? 0.6 : 1 }}
          className="flex min-w-0 basis-0 flex-row items-center justify-around py-0.5 sm:flex-col sm:py-1"
        >
          {line.map((p, j) => (
            <PitchPlayer key={j} p={p} side={side} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full pitch markings as SVG (outline, halfway line, centre circle + spot,
 *  penalty + goal areas, penalty spots and arcs). Two orientations — vertical for
 *  mobile, horizontal for desktop; `preserveAspectRatio="none"` + a matching
 *  container aspect keep the circles round. Real proportions (68 × 105 m). */
function PitchMarkings() {
  const line = { fill: "none", stroke: "rgb(255 255 255 / 0.35)", strokeWidth: 0.4 };
  const spot = { fill: "rgb(255 255 255 / 0.35)" };
  return (
    <>
      <svg
        viewBox="0 0 68 105"
        preserveAspectRatio="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full sm:hidden"
      >
        <g {...line}>
          <rect x="0.6" y="0.6" width="66.8" height="103.8" />
          <line x1="0.6" y1="52.5" x2="67.4" y2="52.5" />
          <circle cx="34" cy="52.5" r="9.15" />
          <path d="M13.84 0.6 V17.1 H54.16 V0.6" />
          <path d="M24.84 0.6 V6.1 H43.16 V0.6" />
          <path d="M27.2 17.1 A9.15 9.15 0 0 0 40.8 17.1" />
          <path d="M13.84 104.4 V87.9 H54.16 V104.4" />
          <path d="M24.84 104.4 V98.9 H43.16 V104.4" />
          <path d="M27.2 87.9 A9.15 9.15 0 0 1 40.8 87.9" />
        </g>
        <g {...spot}>
          <circle cx="34" cy="52.5" r="0.5" />
          <circle cx="34" cy="11" r="0.5" />
          <circle cx="34" cy="94" r="0.5" />
        </g>
      </svg>
      <svg
        viewBox="0 0 105 68"
        preserveAspectRatio="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block"
      >
        <g {...line}>
          <rect x="0.6" y="0.6" width="103.8" height="66.8" />
          <line x1="52.5" y1="0.6" x2="52.5" y2="67.4" />
          <circle cx="52.5" cy="34" r="9.15" />
          <path d="M0.6 13.84 H17.1 V54.16 H0.6" />
          <path d="M0.6 24.84 H6.1 V43.16 H0.6" />
          <path d="M17.1 27.2 A9.15 9.15 0 0 1 17.1 40.8" />
          <path d="M104.4 13.84 H87.9 V54.16 H104.4" />
          <path d="M104.4 24.84 H98.9 V43.16 H104.4" />
          <path d="M87.9 27.2 A9.15 9.15 0 0 0 87.9 40.8" />
        </g>
        <g {...spot}>
          <circle cx="52.5" cy="34" r="0.5" />
          <circle cx="11" cy="34" r="0.5" />
          <circle cx="94" cy="34" r="0.5" />
        </g>
      </svg>
    </>
  );
}

function Pitch({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  return (
    <div
      className="relative aspect-[68/105] overflow-hidden sm:aspect-[105/68]"
      style={{ background: "linear-gradient(hsl(146 48% 15%), hsl(146 52% 11%))" }}
    >
      <PitchMarkings />
      {/* Players — away on top, home on bottom (mobile); home left, away right
          (desktop). Padding keeps the goalkeepers off the goal lines. */}
      <div className="relative flex h-full flex-col-reverse px-1 py-3 sm:flex-row sm:px-3 sm:py-2">
        <PitchHalf lines={pitchLines(home.startXI, home.formation)} side="home" />
        <PitchHalf lines={pitchLines(away.startXI, away.formation, true)} side="away" />
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
