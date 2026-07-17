import { useMemo, useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import type { Day } from "@lucarne/shared";
import { useSchedule } from "@/hooks/useSchedule";
import { useCompetitions } from "@/hooks/useCompetitions";
import { parisDayKey, parisLongLabel } from "@/lib/time";
import { MatchList } from "@/components/DaySection";
import { CompetitionFilter } from "@/components/CompetitionFilter";
import { CompetitionLogo } from "@/components/Logo";
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
  const [comps, setComps] = useState<string[]>([]);

  const first = `${ym.y}-${pad(ym.m + 1)}-01`;
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const { days, error } = useSchedule({ from: first, days: daysInMonth });
  const allComps = useCompetitions();

  // Filter the month to the picked competition (client-side; we already have it).
  const byDay = useMemo(() => {
    const map = new Map<string, Day>();
    for (const d of days ?? []) {
      const matches = comps.length
        ? d.matches.filter((m) => comps.includes(m.competition.slug))
        : d.matches;
      map.set(d.key, { ...d, matches });
    }
    return map;
  }, [days, comps]);

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
  const selMatches = useMemo(() => selDay?.matches ?? [], [selDay]);
  const selLabel = selDay?.label ?? parisLongLabel(new Date(`${selected}T12:00:00Z`));

  // Group the selected day's matches by competition, ordered by the catalogue.
  const compRank = useMemo(
    () => new Map((allComps ?? []).map((c, i) => [c.slug, i])),
    [allComps],
  );
  const groups = useMemo(() => {
    const g = new Map<string, { slug: string; name: string; matches: typeof selMatches }>();
    for (const m of selMatches) {
      const grp = g.get(m.competition.slug);
      if (grp) grp.matches.push(m);
      else g.set(m.competition.slug, { slug: m.competition.slug, name: m.competition.name, matches: [m] });
    }
    return [...g.values()].sort((a, b) => (compRank.get(a.slug) ?? 99) - (compRank.get(b.slug) ?? 99));
  }, [selMatches, compRank]);

  const navBtn =
    "grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <>
      <PageHeader title="Calendar" subtitle="Browse the schedule by day" />

      <div className="mb-4">
        <CompetitionFilter value={comps} onChange={setComps} />
      </div>

      <div className="rounded-lg bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => move(-1)} aria-label="Previous month" className={navBtn}>
            ‹
          </button>
          <b className="text-sm font-semibold">
            {MONTH_NAMES[ym.m]} {ym.y}
          </b>
          <button onClick={() => move(1)} aria-label="Next month" className={navBtn}>
            ›
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {DOW.map((d) => (
            <span
              key={d}
              className="text-center text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground/70"
            >
              {d}
            </span>
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
                  "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isSel
                    ? "bg-primary font-semibold text-primary-foreground"
                    : count
                      ? "bg-muted hover:bg-accent"
                      : "text-muted-foreground/45 hover:bg-accent/50",
                  isToday && !isSel && "ring-2 ring-inset ring-primary",
                )}
              >
                {n}
                {count > 0 && (
                  <span
                    className={cn(
                      "min-w-4 rounded-full px-1 text-[0.55rem] font-bold leading-tight tabular-nums",
                      isSel ? "bg-primary-foreground/25" : "bg-primary/12 text-primary",
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
        <h2 className="mb-3 flex items-center gap-3 text-sm font-semibold text-muted-foreground">
          <span className="whitespace-nowrap">{selLabel}</span>
          <span className="h-px flex-1 bg-border" />
        </h2>
        {!days ? (
          <Loading error={error} />
        ) : selMatches.length === 0 ? (
          <EmptyState icon="🗓️" title="No match on this day" />
        ) : (
          <Accordion.Root
            type="multiple"
            key={`${selected}|${comps.join(",")}`}
            defaultValue={groups.map((g) => g.slug)}
            className="flex flex-col gap-4"
          >
            {groups.map((g) => (
              <Accordion.Item key={g.slug} value={g.slug}>
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-accent">
                    <CompetitionLogo slug={g.slug} size={20} />
                    <span className="flex-1 truncate">{g.name}</span>
                    <span className="text-xs font-normal tabular-nums text-muted-foreground">
                      {g.matches.length}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="accordion-content overflow-hidden">
                  <div className="pt-2">
                    <MatchList matches={g.matches} />
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        )}
      </div>
    </>
  );
}
