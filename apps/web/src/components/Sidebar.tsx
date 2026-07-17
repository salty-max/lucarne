import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, Home, Trophy, X } from "lucide-react";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useLiveCount } from "@/hooks/useLiveCount";
import { CompetitionLogo } from "./Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Today", icon: Home, exact: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { to: "/competitions", label: "Competitions", icon: Trophy, exact: false },
] as const;

const rowActive =
  "data-[status=active]:bg-primary/10 data-[status=active]:font-medium data-[status=active]:text-primary";

/** The rail's content, shared by the desktop aside and the mobile Dialog. */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const comps = useCompetitions();
  const live = useLiveCount();

  return (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/" onClick={onNavigate} className="text-lg font-bold tracking-tight">
          Lucarne<span className="text-primary">.</span>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            activeOptions={{ exact: n.exact }}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              rowActive,
            )}
          >
            <n.icon className="h-4.5 w-4.5 shrink-0" />
            <span className="flex-1">{n.label}</span>
            {n.to === "/" && live > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-live">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
                {live}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-4 px-4 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Competitions
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {(comps ?? []).map((c) => (
          <Link
            key={c.slug}
            to="/competitions/$slug"
            params={{ slug: c.slug }}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              rowActive,
            )}
          >
            <CompetitionLogo slug={c.slug} size={20} />
            <span className="truncate">{c.name}</span>
          </Link>
        ))}
      </div>

      <div className="border-t p-4 text-[0.7rem] leading-relaxed text-muted-foreground/60">
        Fixtures &amp; scores via API-Football · Europe/Paris
      </div>
    </>
  );
}

export function Sidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <>
      {/* Desktop: a static rail in the flex row. */}
      <aside className="sidebar-surface hidden w-64 shrink-0 flex-col lg:sticky lg:top-0 lg:flex lg:h-screen">
        <SidebarNav />
      </aside>

      {/* Mobile: a Radix Dialog drawer (focus trap, Esc, scroll-lock, ARIA). */}
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay fixed inset-0 z-40 bg-black/50 lg:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="drawer-content sidebar-surface fixed inset-y-0 left-0 z-50 flex w-64 flex-col outline-none lg:hidden"
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close className="absolute right-3 top-3.5 z-10 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent">
              <X className="h-5 w-5" />
            </Dialog.Close>
            <SidebarNav onNavigate={() => onOpenChange(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
