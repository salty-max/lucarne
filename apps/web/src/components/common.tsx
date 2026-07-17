import type { ReactNode } from "react";
import { Skeleton } from "@/components/primitives";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
  );
}

export function SectionLabel({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <h2
      className={cn(
        "mb-3 flex items-center gap-2 text-sm font-semibold",
        live ? "text-live" : "text-foreground",
      )}
    >
      {live && <span className="live-dot h-2 w-2 rounded-full bg-live" />}
      {children}
    </h2>
  );
}

export function LivePill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-xs font-semibold text-live">
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
      {count} live
    </span>
  );
}

export function Loading({ error }: { error?: boolean }) {
  if (error) {
    return (
      <p className="rounded-lg bg-muted/50 p-8 text-center text-sm text-muted-foreground">
        Couldn't load right now — retrying…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-22 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "⚽",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-10 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-2 font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
