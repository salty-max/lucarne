import { Link } from "@tanstack/react-router";
import { useCompetitions } from "@/hooks/useCompetitions";
import { Loading, PageHeader, SectionLabel } from "@/components/common";
import { compPageNo } from "@/lib/teletext";

const SECTIONS = [
  { to: "/", label: "Live & today", no: "100" },
  { to: "/calendar", label: "Calendar", no: "300" },
  { to: "/broadcasters", label: "Broadcaster guide", no: "600" },
  { to: "/settings", label: "Settings", no: "700" },
] as const;

export default function Competitions() {
  const comps = useCompetitions();

  return (
    <>
      <PageHeader title="Index" subtitle="Page directory" />

      <div className="flex flex-col">
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="tt-dotted flex items-center gap-2 py-2 text-sm uppercase text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="text-[hsl(var(--tt-cyan))]">▸</span>
            <span className="flex-1">{s.label}</span>
            <span className="font-bold tabular-nums text-primary">{s.no}</span>
          </Link>
        ))}
      </div>

      <div className="mt-5">
        <SectionLabel>Competitions</SectionLabel>
        {!comps ? (
          <Loading />
        ) : (
          <div className="flex flex-col">
            {comps.map((c, i) => (
              <Link
                key={c.slug}
                to="/competitions/$slug"
                params={{ slug: c.slug }}
                className="tt-dotted group flex items-center gap-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate uppercase group-hover:text-[hsl(var(--tt-cyan))]">
                    {c.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.country} · {c.type === "cup" ? "Cup" : "League"}
                  </span>
                </span>
                <span className="font-bold tabular-nums text-primary">{compPageNo(i)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
