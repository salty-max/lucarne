import { Link } from "@tanstack/react-router";
import { useCompetitions } from "@/hooks/useCompetitions";
import { Panel } from "@/components/primitives";
import { CompetitionLogo } from "@/components/Logo";
import { Loading, PageHeader } from "@/components/common";

export default function Competitions() {
  const comps = useCompetitions();

  return (
    <>
      <PageHeader title="Competitions" subtitle="Browse fixtures by competition" />
      {!comps ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {comps.map((c) => (
            <Link key={c.slug} to="/competitions/$slug" params={{ slug: c.slug }} className="block">
              <Panel interactive className="flex h-full items-center gap-3 p-4">
                <CompetitionLogo slug={c.slug} size={38} />
                <div className="min-w-0">
                  <div className="truncate font-semibold leading-tight">{c.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {c.country} · {c.type === "cup" ? "Cup" : "League"}
                  </div>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
