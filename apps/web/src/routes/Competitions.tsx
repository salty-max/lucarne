import { Link } from "@tanstack/react-router";
import { useCompetitions } from "@/hooks/useCompetitions";
import { PageHeader, SectionLabel } from "@/components/common";
import { DottedListSkel } from "@/components/Skeletons";
import { compPageNo } from "@/lib/teletext";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { competitionLabel, countryLabel } from "@/lib/labels";

const SECTIONS = [
  { to: "/", labelKey: "liveToday", no: "100" },
  { to: "/calendar", labelKey: "calendar", no: "300" },
  { to: "/broadcasters", labelKey: "broadcasterGuide", no: "600" },
  { to: "/settings", labelKey: "settings", no: "700" },
] as const;

export default function Competitions() {
  const comps = useCompetitions();
  const { lang } = useSettings();
  const t = useT();

  return (
    <>
      <PageHeader title={t.index.title} subtitle={t.index.subtitle} />

      <div className="flex flex-col">
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="tt-dotted flex items-center gap-2 py-2 uppercase text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="text-[hsl(var(--tt-cyan))]">▸</span>
            <span className="flex-1">{t.index[s.labelKey]}</span>
            <span className="font-bold tabular-nums text-primary">{s.no}</span>
          </Link>
        ))}
      </div>

      <div className="mt-5">
        <SectionLabel>{t.index.competitions}</SectionLabel>
        {!comps ? (
          <DottedListSkel rows={10} sub />
        ) : (
          <div className="flex flex-col">
            {comps.map((c, i) => (
              <Link
                key={c.slug}
                to="/competitions/$slug"
                params={{ slug: c.slug }}
                className="tt-dotted group flex items-center gap-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate uppercase group-hover:text-[hsl(var(--tt-cyan))]">
                    {competitionLabel(c.name, lang)}
                  </span>
                  <span className="block text-muted-foreground">
                    {countryLabel(c.country, lang)} · {c.type === "cup" ? t.index.cup : t.index.league}
                  </span>
                </span>
                <span className="font-bold tabular-nums text-primary">{compPageNo(i)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
