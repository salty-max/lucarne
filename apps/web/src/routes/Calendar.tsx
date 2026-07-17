import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Match } from "@lucarne/shared";
import { useSchedule } from "@/hooks/useSchedule";
import { useCompetitions } from "@/hooks/useCompetitions";
import { parisDayKey } from "@/lib/time";
import { dayKeyToDate, weekdayShort } from "@/lib/dates";
import { MatchTable } from "@/components/DaySection";
import { EmptyState, Loading, PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WINDOW = 7; // day cells shown at once (fixed, never scrolls)
const pad = (n: number) => String(n).padStart(2, "0");

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap border border-border px-2 py-0.5 text-[0.72rem] uppercase transition-colors",
        active
          ? "border-[hsl(var(--tt-cyan))] bg-[hsl(var(--tt-cyan))] font-bold text-black"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function Calendar() {
  const todayKey = useMemo(() => parisDayKey(), []);
  const [view, setView] = useState(() => {
    const [y, m] = todayKey.split("-").map(Number);
    return { y, m: m - 1 }; // m is 0-indexed
  });

  const first = `${view.y}-${pad(view.m + 1)}-01`;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const { days, error } = useSchedule({ from: first, days: daysInMonth });
  const allComps = useCompetitions();

  const dayList = useMemo(() => days ?? [], [days]);
  const [sel, setSel] = useState(0);
  const [start, setStart] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);

  // On (re)load of a month, land on today if it's in view, else the first day.
  useEffect(() => {
    if (dayList.length === 0) {
      setSel(0);
      setStart(0);
      return;
    }
    const i = dayList.findIndex((d) => d.key >= todayKey);
    setSel(i === -1 ? 0 : i);
  }, [dayList, todayKey]);

  // Shift the fixed window only when the selection crosses an edge.
  useEffect(() => {
    const max = Math.max(0, dayList.length - WINDOW);
    setStart((s) => {
      let ns = s;
      if (sel < s) ns = sel;
      else if (sel >= s + WINDOW) ns = sel - WINDOW + 1;
      return Math.max(0, Math.min(ns, max));
    });
  }, [sel, dayList.length]);

  const moveMonth = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const presentComps = useMemo(() => {
    const slugs = new Set<string>();
    for (const d of dayList) for (const m of d.matches) slugs.add(m.competition.slug);
    return (allComps ?? []).filter((c) => slugs.has(c.slug));
  }, [dayList, allComps]);

  const selDay = dayList[Math.min(sel, Math.max(0, dayList.length - 1))];
  const matches = (selDay?.matches ?? []).filter((m) => !filter || m.competition.slug === filter);

  const rank = useMemo(() => new Map((allComps ?? []).map((c, i) => [c.slug, i])), [allComps]);
  const groups = useMemo(() => {
    const g = new Map<string, { slug: string; name: string; matches: Match[] }>();
    for (const m of matches) {
      const grp = g.get(m.competition.slug);
      if (grp) grp.matches.push(m);
      else g.set(m.competition.slug, { slug: m.competition.slug, name: m.competition.name, matches: [m] });
    }
    return [...g.values()].sort((a, b) => (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99));
  }, [matches, rank]);

  const visible = dayList.slice(start, start + WINDOW);
  const step = (delta: number) => setSel((s) => Math.max(0, Math.min(s + delta, dayList.length - 1)));

  return (
    <>
      <PageHeader title="Calendar" subtitle="Pick a day" />

      {/* Month selector */}
      <div className="mb-2 flex items-stretch gap-1">
        <button
          onClick={() => moveMonth(-1)}
          aria-label="Previous month"
          className="grid w-7 place-items-center border border-border text-muted-foreground hover:bg-accent"
        >
          ‹
        </button>
        <div className="tt-bar tt-bar-yellow flex-1 justify-center text-xs">
          {MONTHS[view.m]} {view.y}
        </div>
        <button
          onClick={() => moveMonth(1)}
          aria-label="Next month"
          className="grid w-7 place-items-center border border-border text-muted-foreground hover:bg-accent"
        >
          ›
        </button>
      </div>

      {!days ? (
        <Loading error={error} />
      ) : dayList.length === 0 ? (
        <EmptyState title="No matches this month" />
      ) : (
        <>
          {/* Fixed day window — shifts at the edges, never scrolls */}
          <div className="mb-2 flex items-stretch gap-1">
            <button
              onClick={() => step(-1)}
              disabled={sel === 0}
              aria-label="Previous day"
              className="grid w-6 place-items-center border border-border text-muted-foreground hover:bg-accent disabled:opacity-30"
            >
              ◄
            </button>
            <div className="grid flex-1 grid-cols-7 gap-1">
              {visible.map((d, i) => {
                const idx = start + i;
                const active = idx === sel;
                const isToday = d.key === todayKey;
                const wd = weekdayShort(dayKeyToDate(d.key)).slice(0, 3);
                return (
                  <button
                    key={d.key}
                    onClick={() => setSel(idx)}
                    aria-selected={active}
                    className={cn(
                      "flex min-w-0 flex-col items-center border px-0.5 py-1 leading-tight",
                      active
                        ? "border-[hsl(var(--tt-yellow))] bg-[hsl(var(--tt-yellow))] font-bold text-black"
                        : isToday
                          ? "border-[hsl(var(--tt-cyan))] text-foreground hover:bg-accent"
                          : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <span className="text-[0.6rem] uppercase opacity-80">{wd}</span>
                    <span className="text-sm font-bold tabular-nums">{d.key.slice(8)}</span>
                    <span className={cn("text-[0.55rem] tabular-nums", active ? "opacity-70" : "text-primary")}>
                      {d.matches.length}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => step(1)}
              disabled={sel >= dayList.length - 1}
              aria-label="Next day"
              className="grid w-6 place-items-center border border-border text-muted-foreground hover:bg-accent disabled:opacity-30"
            >
              ►
            </button>
          </div>

          {/* Competition filter — wraps, never scrolls */}
          <div className="mb-3 flex flex-wrap items-center gap-1">
            <Chip active={!filter} onClick={() => setFilter(null)}>
              All
            </Chip>
            {presentComps.map((c) => (
              <Chip
                key={c.slug}
                active={filter === c.slug}
                onClick={() => setFilter(filter === c.slug ? null : c.slug)}
              >
                {c.name}
              </Chip>
            ))}
          </div>

          {groups.length === 0 ? (
            <EmptyState title="No matches for this filter" />
          ) : (
            <MatchTable
              groups={groups.map((g) => ({
                key: g.slug,
                label: g.name,
                matches: g.matches,
                tone: "cyan" as const,
              }))}
            />
          )}
        </>
      )}
    </>
  );
}
