import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** A flat teletext placeholder block. Size it via className (`h-*`, `w-*`). */
export function Skel({ className }: { className?: string }) {
  return <span className={cn("tt-skel block", className)} aria-hidden />;
}

/** Skeleton wrapper: one synchronised pulse for every block inside, plus a
 * screen-reader "loading" announcement so the placeholder isn't silent. */
function Wrap({ children, className }: { children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className={cn("animate-pulse", className)}>
      <span className="sr-only">{t.loading}</span>
      {children}
    </div>
  );
}

/** One placeholder match row — mirrors MatchCard's four cells and row height so
 * the real rows drop in without a vertical jump. */
function MatchRowSkel() {
  return (
    <tr className="border-b border-dotted border-border">
      <td className="py-2.5 pr-3 align-middle sm:py-1.5">
        <Skel className="h-4 w-8" />
      </td>
      <td className="py-2.5 align-middle sm:py-1.5">
        <span className="flex items-center gap-2">
          <Skel className="h-4 w-24 sm:w-40" />
          <Skel className="h-4 w-6" />
          <Skel className="h-4 w-24 sm:w-40" />
        </span>
      </td>
      <td className="w-full" />
      <td className="py-2.5 pl-3 align-middle sm:py-1.5">
        <Skel className="ml-auto h-4 w-12" />
      </td>
    </tr>
  );
}

/** The raw match table (no Wrap) — section bars + rows, same markup as
 * MatchTable. `sections` gives the row count per section. */
function matchTable(sections: number[]) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse ">
        <tbody>
          {sections.map((rows, s) => (
            <Fragment key={s}>
              <tr>
                <td colSpan={6} className="pt-4 first:pt-0">
                  <Skel className="h-5 w-full" />
                </td>
              </tr>
              {Array.from({ length: rows }).map((_, i) => (
                <MatchRowSkel key={i} />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Placeholder for a grouped list of match rows (Today, Competition matches). */
export function MatchTableSkel({ sections = [4, 4] }: { sections?: number[] }) {
  return <Wrap>{matchTable(sections)}</Wrap>;
}

/** Placeholder for a dotted list (competitions index, logs). `sub` adds a second
 * muted line; `lead` adds a leading fixed-width block (e.g. a timestamp). */
export function DottedListSkel({
  rows = 8,
  sub = false,
  lead = false,
}: {
  rows?: number;
  sub?: boolean;
  lead?: boolean;
}) {
  return (
    <Wrap className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="tt-dotted flex items-center gap-2 py-2">
          {lead && <Skel className="h-3.5 w-24 shrink-0" />}
          <div className="min-w-0 flex-1">
            <Skel className="h-4 w-40 max-w-[70%]" />
            {sub && <Skel className="mt-1.5 h-2.5 w-24" />}
          </div>
          <Skel className="h-3.5 w-9 shrink-0" />
        </div>
      ))}
    </Wrap>
  );
}

/** Full match-detail placeholder: comp bar, scoreboard, two event sections. */
export function MatchDetailSkel() {
  return (
    <Wrap>
      <Skel className="mb-2 h-4 w-32" />
      <Skel className="h-5 w-full" />
      <div className="flex flex-col items-center gap-2 py-3">
        <Skel className="h-9 w-24" />
        <div className="flex items-center gap-2">
          <Skel className="h-4 w-24" />
          <Skel className="h-4 w-4" />
          <Skel className="h-4 w-24" />
        </div>
        <Skel className="h-4 w-16" />
      </div>
      {[0, 1].map((s) => (
        <div key={s} className="mt-3">
          <Skel className="h-5 w-full" />
          <div className="mt-1 flex flex-col gap-1.5">
            {[0, 1, 2].map((r) => (
              <Skel key={r} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ))}
    </Wrap>
  );
}

/** Calendar body placeholder: day strip + filter chips + match table. The month
 * bar above it is static, so it stays put while this loads. */
export function CalendarSkel() {
  return (
    <Wrap>
      <div className="mb-2 flex items-stretch gap-1">
        <Skel className="h-12 w-6 shrink-0" />
        <div className="grid flex-1 grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skel key={i} className="h-12" />
          ))}
        </div>
        <Skel className="h-12 w-6 shrink-0" />
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skel key={i} className="h-6 w-16" />
        ))}
      </div>
      {matchTable([4, 4])}
    </Wrap>
  );
}

/** Broadcasters (on-TV-tonight) placeholder: channel filter chips + per-channel
 * match groups. The page header stays static above. */
export function BroadcastersSkel() {
  return (
    <Wrap>
      <div className="mb-3 flex flex-wrap gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skel key={i} className="h-6 w-16" />
        ))}
      </div>
      {[0, 1].map((c) => (
        <div key={c} className="mb-4">
          <Skel className="mb-1 h-5 w-24" />
          {matchTable([3])}
        </div>
      ))}
    </Wrap>
  );
}
