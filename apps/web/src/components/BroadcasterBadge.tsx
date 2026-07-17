import type { Broadcaster } from "@lucarne/shared";

export function BroadcasterBadge({ b }: { b: Broadcaster }) {
  return (
    <span
      title={b.note ?? b.name}
      style={{ borderColor: `${b.color}55`, backgroundColor: `${b.color}14`, color: b.color }}
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.color }} />
      {b.name}
    </span>
  );
}

export function BroadcasterList({ list }: { list: Broadcaster[] }) {
  if (list.length === 0) {
    return <span className="text-xs italic text-muted-foreground">Broadcaster TBC</span>;
  }
  // Multiple non-override broadcasters = split rights (e.g. Ligue 1+ / Amazon).
  const isSplit = list.length > 1 && list.every((b) => !b.override);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {list.map((b, i) => (
        <span key={b.id} className="inline-flex items-center gap-1.5">
          {i > 0 && isSplit && <span className="text-xs text-muted-foreground">or</span>}
          <BroadcasterBadge b={b} />
        </span>
      ))}
      {isSplit && <span className="text-xs italic text-muted-foreground">depending on selection</span>}
    </div>
  );
}
