import { useMemo, type ReactNode } from "react";
import type { Match } from "@lucarne/shared";
import { useSchedule } from "@/hooks/useSchedule";
import { clearChannels, toggleChannel, useChannels } from "@/lib/channels";
import { keepCompetitions, useHiddenCompetitions } from "@/lib/competitionFilter";
import { channelTt } from "@/lib/channelColor";
import { useT } from "@/lib/i18n";
import { parisDayKey } from "@/lib/time";
import { EmptyState, Loading, PageHeader, SectionLabel, Tag } from "@/components/common";
import { BroadcastersSkel } from "@/components/Skeletons";
import { MatchTable } from "@/components/DaySection";
import { cn } from "@/lib/utils";

type Channel = { slug: string; name: string; color: string; matches: Match[] };

/** Static channel-coverage guide — shown when there's nothing on today. */
const GUIDE = [
  { name: "Ligue 1+", color: "#DC2626", cover: "ligue1Most" },
  { name: "Amazon Prime", color: "#0EA5E9", cover: "ligue1Pick" },
  { name: "CANAL+", color: "#4F46E5", cover: "canal" },
  { name: "beIN SPORTS", color: "#DB2777", cover: "bein" },
  { name: "M6", color: "#14B8A6", cover: "m6" },
] as const;

function GuideRow({ name, color, covers }: { name: string; color: string; covers: string }) {
  return (
    <div className="tt-dotted flex items-center gap-3 py-2">
      <Tag ttColor={channelTt(color)} className="hrink-0 py-0.5">
        {name}
      </Tag>
      <span className="text-muted-foreground">{covers}</span>
    </div>
  );
}

function Guide() {
  const t = useT();
  return (
    <>
      <SectionLabel>{t.broadcasters.byChannel}</SectionLabel>
      <div className="flex flex-col">
        {GUIDE.map((g) => (
          <GuideRow key={g.name} name={g.name} color={g.color} covers={t.broadcasters.covers[g.cover]} />
        ))}
      </div>
      <div className="mt-5">
        <SectionLabel>{t.broadcasters.worldCup}</SectionLabel>
        <div className="flex flex-col">
          <GuideRow name="beIN SPORTS" color="#DB2777" covers={t.broadcasters.covers.wcBein} />
          <GuideRow name="M6" color="#14B8A6" covers={t.broadcasters.covers.wcM6} />
        </div>
      </div>
    </>
  );
}

/** A filter pill: the "All" reset, or one per channel (with its colour dot). */
function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 border px-2 py-0.5 uppercase transition-colors",
        active
          ? "border-[hsl(var(--tt-cyan))] bg-[hsl(var(--tt-cyan))] font-bold text-black"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {color && (
        <span className="h-2 w-2 shrink-0" style={{ background: `hsl(var(--tt-${channelTt(color)}))` }} />
      )}
      {children}
    </button>
  );
}

/** "Tonight on TV" (P600): today's matches grouped by channel, with a persistent
 * "my channels" filter. Falls back to the static coverage guide on an off-day. */
export default function Broadcasters() {
  const t = useT();
  const { days, error } = useSchedule({ days: 1 }, { live: true });
  const selected = useChannels();
  const selSet = useMemo(() => new Set(selected), [selected]);
  const hidden = useHiddenCompetitions();
  const todayKey = parisDayKey();

  const matches = useMemo(
    () => (days ? keepCompetitions(days.find((d) => d.key === todayKey)?.matches ?? [], hidden) : null),
    [days, todayKey, hidden],
  );

  // Group by channel — a match on two channels appears under both. Busiest first.
  const channels = useMemo<Channel[]>(() => {
    if (!matches) return [];
    const map = new Map<string, Channel>();
    for (const m of matches) {
      for (const b of m.broadcasters) {
        const g = map.get(b.slug) ?? { slug: b.slug, name: b.name, color: b.color, matches: [] };
        g.matches.push(m);
        map.set(b.slug, g);
      }
    }
    return [...map.values()].sort(
      (a, b) => b.matches.length - a.matches.length || a.name.localeCompare(b.name),
    );
  }, [matches]);

  const visible = selSet.size === 0 ? channels : channels.filter((c) => selSet.has(c.slug));

  if (!matches) {
    return (
      <>
        <PageHeader title={t.broadcasters.title} subtitle={t.broadcasters.onTv} />
        {error ? <Loading error /> : <BroadcastersSkel />}
      </>
    );
  }

  if (channels.length === 0) {
    return (
      <>
        <PageHeader title={t.broadcasters.title} subtitle={t.broadcasters.onTv} />
        <p className="mb-4 py-2 italic text-muted-foreground">
          {t.broadcasters.noMatchesToday}
        </p>
        <Guide />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.broadcasters.title} subtitle={t.broadcasters.onTv} />

      <div className="mb-3 flex flex-wrap items-center gap-1">
        <FilterChip active={selSet.size === 0} onClick={clearChannels}>
          {t.broadcasters.all}
        </FilterChip>
        {channels.map((c) => (
          <FilterChip
            key={c.slug}
            active={selSet.has(c.slug)}
            color={c.color}
            onClick={() => toggleChannel(c.slug)}
          >
            {c.name}
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t.broadcasters.noneToday} />
      ) : (
        visible.map((c) => (
          <section key={c.slug} className="mb-4">
            <div className="mb-1 flex items-center gap-2">
              <Tag ttColor={channelTt(c.color)} className="py-0.5">
                {c.name}
              </Tag>
              <span className="tabular-nums text-muted-foreground">{c.matches.length}</span>
            </div>
            <MatchTable groups={[{ key: c.slug, matches: c.matches }]} hideBroadcasters />
          </section>
        ))
      )}
    </>
  );
}
