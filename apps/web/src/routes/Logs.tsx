import { EmptyState, Loading, PageHeader } from "@/components/common";
import { DottedListSkel } from "@/components/Skeletons";
import { useLogs } from "@/hooks/useLogs";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { RunLogEntry } from "@lucarne/shared";

const stampFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Europe/Paris",
});

/** Render a job's result object as compact "key value" pairs — drop the error
 * (shown separately) and bare booleans like `polled: true` (just noise). */
function summarize(detail: Record<string, unknown> | null): { pairs: string; err: string | null } {
  if (!detail) return { pairs: "", err: null };
  const err = typeof detail.err === "string" ? detail.err : null;
  const pairs = Object.entries(detail)
    .filter(([k, v]) => k !== "err" && typeof v !== "boolean")
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  return { pairs, err };
}

function Row({ r }: { r: RunLogEntry }) {
  const { pairs, err } = summarize(r.detail);
  return (
    <div data-nav className="tt-dotted flex items-baseline gap-2 py-1 ">
      <span className="hrink-0 tabular-nums text-muted-foreground">
        {stampFmt.format(new Date(r.at)).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "font-bold uppercase",
            r.ok ? "text-[hsl(var(--tt-green))]" : "text-[hsl(var(--tt-red))]",
          )}
        >
          {r.job}
        </span>
        {pairs && <span className="text-muted-foreground"> · {pairs}</span>}
        {err && <span className="text-[hsl(var(--tt-red))]"> · {err}</span>}
      </span>
      <span className="hrink-0 tabular-nums text-muted-foreground">
        {r.ms != null ? `${r.ms}ms` : ""}
      </span>
    </div>
  );
}

export default function Logs() {
  const { runs, error } = useLogs(100);
  const t = useT();

  if (!runs) {
    return (
      <>
        <PageHeader title={t.logs.title} subtitle={t.logs.subtitle} />
        {error ? <Loading error /> : <DottedListSkel rows={14} lead />}
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.logs.title} subtitle={t.logs.subtitle} />
      {runs.length === 0 ? (
        <EmptyState title={t.logs.empty} />
      ) : (
        <div className="flex flex-col">
          {runs.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </div>
      )}
    </>
  );
}
