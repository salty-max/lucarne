import type { ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { competitionLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap border border-border px-2 py-0.5 uppercase transition-colors",
        active
          ? "border-[hsl(var(--tt-cyan))] bg-[hsl(var(--tt-cyan))] font-bold text-black"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export type FilterComp = { slug: string; name: string };

/** Single-select competition filter — an "All" chip plus one per present
 *  competition. Shared by Calendar, Direct and Radar. Renders nothing when
 *  there's fewer than two competitions to pick between (a filter would be moot). */
export function CompetitionFilter({
  comps,
  value,
  onChange,
}: {
  comps: FilterComp[];
  value: string | null;
  onChange: (slug: string | null) => void;
}) {
  const { lang } = useSettings();
  const t = useT();
  if (comps.length < 2) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1">
      <Chip active={!value} onClick={() => onChange(null)}>
        {t.calendar.all}
      </Chip>
      {comps.map((c) => (
        <Chip
          key={c.slug}
          active={value === c.slug}
          onClick={() => onChange(value === c.slug ? null : c.slug)}
        >
          {competitionLabel(c.name, lang)}
        </Chip>
      ))}
    </div>
  );
}
