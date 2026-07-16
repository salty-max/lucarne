import { Link } from "@tanstack/react-router";
import { CalendarDays, Home, Trophy, X } from "lucide-react";
import { useCompetitions } from "@/hooks/useCompetitions";
import { CompetitionLogo } from "./Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Today", icon: Home, exact: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { to: "/competitions", label: "Competitions", icon: Trophy, exact: false },
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const comps = useCompetitions();

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link to="/" onClick={onClose} className="text-lg font-bold tracking-tight">
            Lucarne<span className="text-primary">.</span>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={onClose}
              activeOptions={{ exact: n.exact }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
            >
              <n.icon className="h-[18px] w-[18px]" />
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="mt-5 px-5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Competitions
        </div>
        <div className="mt-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {(comps ?? []).map((c) => (
            <Link
              key={c.slug}
              to="/competitions/$slug"
              params={{ slug: c.slug }}
              onClick={onClose}
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:text-primary"
            >
              <CompetitionLogo slug={c.slug} size={16} />
              <span className="truncate">{c.name}</span>
            </Link>
          ))}
        </div>

        <div className="border-t px-5 py-3 text-[0.7rem] leading-relaxed text-muted-foreground/70">
          Fixtures &amp; scores via API-Football. Times in Europe/Paris.
        </div>
      </aside>
    </>
  );
}
