import { useMemo, useState } from "react";
import { useSchedule } from "@/hooks/useSchedule";
import { parisDayKey, parisLongLabel } from "@/lib/time";
import { MatchList } from "@/components/DaySection";
import { EmptyState, Loading, PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function Calendar() {
  const [today] = useState(() => parisDayKey());
  const [ty, tm] = today.split("-").map(Number);
  const [ym, setYm] = useState({ y: ty, m: tm - 1 }); // m is 0-indexed
  const [selected, setSelected] = useState(today);

  const first = `${ym.y}-${pad(ym.m + 1)}-01`;
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const { days, error } = useSchedule({ from: first, days: daysInMonth });
  const byDay = useMemo(() => new Map((days ?? []).map((d) => [d.key, d])), [days]);

  const cells = useMemo(() => {
    const lead = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7; // Monday-first blanks
    const arr: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let n = 1; n <= daysInMonth; n++) arr.push(`${ym.y}-${pad(ym.m + 1)}-${pad(n)}`);
    return arr;
  }, [ym, daysInMonth]);

  const move = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);
  };

  const selDay = byDay.get(selected);
  const selMatches = selDay?.matches ?? [];
  const selLabel = selDay?.label ?? parisLongLabel(new Date(`${selected}T12:00:00Z`));

  return (
    <>
      <PageHeader title="Calendar" subtitle="Browse the schedule by day" />

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => move(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-md border hover:bg-accent">‹</button>
          <b className="text-sm">{MONTH_NAMES[ym.m]} {ym.y}</b>
          <button onClick={() => move(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-md border hover:bg-accent">›</button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {DOW.map((d) => (
            <span key={d} className="text-center text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground/70">{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((key, i) => {
            if (!key) return <span key={i} />;
            const n = Number(key.slice(8));
            const count = byDay.get(key)?.matches.length ?? 0;
            const isToday = key === today;
            const isSel = key === selected;
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  isSel
                    ? "bg-primary text-primary-foreground"
                    : count
                      ? "border bg-background hover:bg-accent"
                      : "text-muted-foreground/45 hover:bg-accent/50",
                  isToday && !isSel && "ring-2 ring-inset ring-primary",
                )}
              >
                {n}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[0.55rem] font-bold leading-tight",
                      isSel ? "bg-primary-foreground/20" : "bg-primary/15 text-primary",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selLabel}</h2>
        {!days ? (
          <Loading error={error} />
        ) : selMatches.length === 0 ? (
          <EmptyState icon="🗓️" title="No match on this day" />
        ) : (
          <MatchList matches={selMatches} />
        )}
      </div>
    </>
  );
}
