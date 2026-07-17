import type { ReactNode } from "react";
import { PageHeader, SectionLabel } from "@/components/common";
import { setSettings, useSettings, type DateFormat, type Lang } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { formatLong } from "@/lib/dates";
import { cn } from "@/lib/utils";

const LANG_OPTIONS: { value: Lang; labelKey: "french" | "english" }[] = [
  { value: "fr", labelKey: "french" },
  { value: "en", labelKey: "english" },
];

const DATE_OPTIONS: { value: DateFormat; labelKey: "dmy" | "mdy" | "numeric" }[] = [
  { value: "dmy", labelKey: "dmy" },
  { value: "mdy", labelKey: "mdy" },
  { value: "numeric", labelKey: "numeric" },
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
  const { dateFormat, crt, lang } = useSettings();
  const t = useT();
  const sample = new Date();

  return (
    <>
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <SectionLabel>{t.settings.language}</SectionLabel>
      <div className="flex flex-col">
        {LANG_OPTIONS.map((o) => (
          <Radio key={o.value} active={lang === o.value} onClick={() => setSettings({ lang: o.value })}>
            <span className="min-w-0 flex-1 uppercase">{t.settings[o.labelKey]}</span>
          </Radio>
        ))}
      </div>

      <div className="mt-5">
        <SectionLabel>{t.settings.dateFormat}</SectionLabel>
        <div className="flex flex-col">
          {DATE_OPTIONS.map((o) => (
            <Radio
              key={o.value}
              active={dateFormat === o.value}
              onClick={() => setSettings({ dateFormat: o.value })}
            >
              <span className="min-w-0 flex-1 truncate uppercase">{t.settings[o.labelKey]}</span>
              <span className="shrink-0 text-xs uppercase text-muted-foreground">
                {formatLong(sample, o.value, lang)}
              </span>
            </Radio>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <SectionLabel>{t.settings.display}</SectionLabel>
        <button
          data-nav
          onClick={() => setSettings({ crt: !crt })}
          aria-pressed={crt}
          className="tt-dotted flex w-full items-center gap-3 py-2 text-left transition-colors hover:text-foreground"
        >
          <span className="min-w-0 flex-1 uppercase">{t.settings.crt}</span>
          <span
            className={cn(
              "tt-tag py-0.5",
              crt ? "bg-[hsl(var(--tt-green))] text-black" : "bg-muted text-muted-foreground",
            )}
          >
            {crt ? t.settings.on : t.settings.off}
          </span>
        </button>
        <p className="mt-2 text-xs text-muted-foreground">{t.settings.crtHelp}</p>
      </div>
    </>
  );
}
