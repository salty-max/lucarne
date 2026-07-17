import type { ReactNode } from "react";
import { PageHeader, SectionLabel } from "@/components/common";
import { setSettings, useSettings, type DateFormat } from "@/lib/settings";
import { formatLong } from "@/lib/dates";
import { cn } from "@/lib/utils";

const DATE_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: "dmy", label: "Day / month / year" },
  { value: "mdy", label: "Month / day / year" },
  { value: "numeric", label: "Numeric" },
];

function Radio({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      data-nav
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "tt-dotted flex w-full items-center gap-3 py-2 text-left transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={cn(active ? "text-[hsl(var(--tt-cyan))]" : "opacity-40")}>
        {active ? "◉" : "○"}
      </span>
      {children}
    </button>
  );
}

export default function Settings() {
  const { dateFormat, crt } = useSettings();
  const sample = new Date();

  return (
    <>
      <PageHeader title="Settings" subtitle="Display preferences" />

      <SectionLabel>Date format</SectionLabel>
      <div className="flex flex-col">
        {DATE_OPTIONS.map((o) => (
          <Radio key={o.value} active={dateFormat === o.value} onClick={() => setSettings({ dateFormat: o.value })}>
            <span className="min-w-0 flex-1 truncate uppercase">{o.label}</span>
            <span className="shrink-0 text-xs uppercase text-muted-foreground">{formatLong(sample, o.value)}</span>
          </Radio>
        ))}
      </div>

      <div className="mt-5">
        <SectionLabel>Display</SectionLabel>
        <button
          data-nav
          onClick={() => setSettings({ crt: !crt })}
          aria-pressed={crt}
          className="tt-dotted flex w-full items-center gap-3 py-2 text-left transition-colors hover:text-foreground"
        >
          <span className="min-w-0 flex-1 uppercase">CRT filter</span>
          <span
            className={cn(
              "tt-tag py-0.5",
              crt ? "bg-[hsl(var(--tt-green))] text-black" : "bg-muted text-muted-foreground",
            )}
          >
            {crt ? "On" : "Off"}
          </span>
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Scanlines, phosphor glow and the TV bezel. Turn off for a flat screen.
        </p>
      </div>
    </>
  );
}
