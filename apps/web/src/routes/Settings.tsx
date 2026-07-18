import type { ReactNode } from "react";
import { PageHeader, SectionLabel } from "@/components/common";
import { setSettings, useSettings, type DateFormat, type Lang, type Theme } from "@/lib/settings";
import { THEMES } from "@/lib/themes";
import { toggleCompetition, useHiddenCompetitions } from "@/lib/competitionFilter";
import { useCompetitions } from "@/hooks/useCompetitions";
import { competitionLabel } from "@/lib/labels";
import { useT } from "@/lib/i18n";
import { formatLong } from "@/lib/dates";
import { cn } from "@/lib/utils";

const LANG_OPTIONS: { value: Lang; labelKey: "french" | "english" }[] = [
  { value: "fr", labelKey: "french" },
  { value: "en", labelKey: "english" },
];

const THEME_META: Record<Theme, { name: string; tag: string }> = {
  cept1: { name: "themeCept1", tag: "themeCept1Tag" },
  neon: { name: "themeNeon", tag: "themeNeonTag" },
  amber: { name: "themeAmber", tag: "themeAmberTag" },
  green: { name: "themeGreen", tag: "themeGreenTag" },
};

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
  const { dateFormat, crt, lang, theme } = useSettings();
  const comps = useCompetitions();
  const hidden = useHiddenCompetitions();
  const t = useT();
  const sample = new Date();
  const s = t.settings as Record<string, string>;

  return (
    <>
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <SectionLabel>{t.settings.theme}</SectionLabel>
      <p className="mb-1 text-xs text-muted-foreground">{t.settings.themeHelp}</p>
      <div className="flex flex-col">
        {THEMES.map((th) => {
          const meta = THEME_META[th.id];
          return (
            <Radio key={th.id} active={theme === th.id} onClick={() => setSettings({ theme: th.id })}>
              <span className="min-w-0 flex-1">
                <span className="block uppercase">{s[meta.name]}</span>
                <span className="block text-xs text-muted-foreground">{s[meta.tag]}</span>
              </span>
              <span className="flex shrink-0 items-center gap-px" aria-hidden>
                {th.swatch.map((c, i) => (
                  <span key={i} className="h-3.5 w-3.5" style={{ background: `hsl(${c})` }} />
                ))}
              </span>
            </Radio>
          );
        })}
      </div>

      <div className="mt-5">
        <SectionLabel>{t.settings.language}</SectionLabel>
        <div className="flex flex-col">
          {LANG_OPTIONS.map((o) => (
            <Radio
              key={o.value}
              active={lang === o.value}
              onClick={() => setSettings({ lang: o.value })}
            >
              <span className="min-w-0 flex-1 uppercase">{t.settings[o.labelKey]}</span>
            </Radio>
          ))}
        </div>
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

      <div className="mt-5">
        <SectionLabel>{t.settings.competitions}</SectionLabel>
        <p className="mb-1 text-xs text-muted-foreground">{t.settings.competitionsHelp}</p>
        <div className="flex flex-col">
          {(comps ?? []).map((c) => {
            const shown = !hidden.includes(c.slug);
            return (
              <button
                key={c.slug}
                data-nav
                onClick={() => toggleCompetition(c.slug)}
                aria-pressed={shown}
                className="tt-dotted flex w-full items-center gap-3 py-2 text-left transition-colors hover:text-foreground"
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 uppercase",
                    shown ? "text-foreground" : "text-muted-foreground line-through",
                  )}
                >
                  {competitionLabel(c.name, lang)}
                </span>
                <span
                  className={cn(
                    "tt-tag py-0.5",
                    shown ? "bg-[hsl(var(--tt-green))] text-black" : "bg-muted text-muted-foreground",
                  )}
                >
                  {shown ? t.settings.on : t.settings.off}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
