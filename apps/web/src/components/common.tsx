import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold uppercase tracking-tight text-[hsl(var(--tt-cyan))]">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {right}
      </div>
      <div className="tt-rainbow mt-2" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </header>
  );
}

/** The big branded teletext masthead (used on the landing). */
export function TeletextHero({ subtitle }: { subtitle?: string }) {
  return (
    <div className="mb-5">
      <div className="text-4xl font-bold uppercase leading-none tracking-tight text-[hsl(var(--tt-cyan))]">
        Lucarne<span className="text-primary">.</span>
      </div>
      {subtitle && (
        <div className="mt-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">{subtitle}</div>
      )}
      <div className="tt-rainbow mt-2" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

/** A full-width teletext colour bar for section headers. */
export function SectionLabel({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <h2 className={cn("tt-bar mb-2 text-xs", live && "tt-bar-live")}>
      {live && <span className="live-dot h-2 w-2 rounded-full bg-current" />}
      {children}
    </h2>
  );
}

export function LivePill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="tt-tag bg-live py-0.5 text-white">
      <span className="live-dot mr-1 h-1.5 w-1.5 rounded-full bg-current" />
      {count} LIVE
    </span>
  );
}

export function Loading({ error }: { error?: boolean }) {
  return (
    <p
      className={cn(
        "py-10 text-center text-sm uppercase tracking-widest",
        error ? "text-live" : "animate-pulse text-muted-foreground",
      )}
    >
      {error ? "Couldn't load — retrying…" : "Loading…"}
    </p>
  );
}

export function EmptyState({
  icon = "◹",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <div className="text-3xl text-muted-foreground/50">{icon}</div>
      <p className="mt-2 font-bold uppercase tracking-wide">{title}</p>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
