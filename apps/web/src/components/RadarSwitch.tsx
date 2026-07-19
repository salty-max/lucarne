import { cn } from "@/lib/utils";

/**
 * Square teletext toggle for "surveillance" (radar). On = green (on the radar:
 * live details + notifs), off = muted grey. Stops click propagation so it works
 * inside a clickable match row.
 */
export function RadarSwitch({
  on,
  onToggle,
  label,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative inline-block h-[15px] w-[26px] shrink-0 border align-middle transition-colors",
        on ? "border-[hsl(var(--tt-green))] bg-[hsl(var(--tt-green))]/15" : "border-border bg-transparent",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-[1px] block h-[9px] w-[9px] transition-all",
          on ? "right-[1.5px] bg-[hsl(var(--tt-green))]" : "left-[1.5px] bg-muted-foreground",
        )}
      />
    </button>
  );
}
