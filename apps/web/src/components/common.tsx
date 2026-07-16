import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
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
        "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide",
        live ? "text-live" : "text-muted-foreground",
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
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-1 text-xs font-semibold text-live">
      <span className="live-dot h-2 w-2 rounded-full bg-live" />
      {count} live
    </span>
  );
}

export function Loading({ error }: { error?: boolean }) {
  if (error) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Couldn't load right now — retrying…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[84px] w-full rounded-lg" />
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
    <div className="rounded-lg border border-dashed p-8 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-2 font-medium">{title}</p>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
