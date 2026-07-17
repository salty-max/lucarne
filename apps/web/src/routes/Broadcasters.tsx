import { PageHeader, SectionLabel, Tag } from "@/components/common";
import { useT } from "@/lib/i18n";

const GUIDE = [
  { name: "Ligue 1+", color: "#DC2626", cover: "ligue1Most" },
  { name: "Amazon Prime", color: "#0EA5E9", cover: "ligue1Pick" },
  { name: "CANAL+", color: "#4F46E5", cover: "canal" },
  { name: "beIN SPORTS", color: "#DB2777", cover: "bein" },
  { name: "M6", color: "#14B8A6", cover: "m6" },
] as const;

function Row({ name, color, covers }: { name: string; color: string; covers: string }) {
  return (
    <div className="tt-dotted flex items-center gap-3 py-2">
      <Tag color={color} className="shrink-0 py-0.5">
        {name}
      </Tag>
      <span className="text-sm text-muted-foreground">{covers}</span>
    </div>
  );
}

export default function Broadcasters() {
  const t = useT();
  return (
    <>
      <PageHeader title={t.broadcasters.title} subtitle={t.broadcasters.subtitle} />

      <SectionLabel>{t.broadcasters.byChannel}</SectionLabel>
      <div className="flex flex-col">
        {GUIDE.map((g) => (
          <Row key={g.name} name={g.name} color={g.color} covers={t.broadcasters.covers[g.cover]} />
        ))}
      </div>

      <div className="mt-5">
        <SectionLabel>{t.broadcasters.worldCup}</SectionLabel>
        <div className="flex flex-col">
          <Row name="beIN SPORTS" color="#DB2777" covers={t.broadcasters.covers.wcBein} />
          <Row name="M6" color="#14B8A6" covers={t.broadcasters.covers.wcM6} />
        </div>
      </div>
    </>
  );
}
