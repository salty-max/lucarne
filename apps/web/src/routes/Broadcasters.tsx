import { PageHeader, SectionLabel, Tag } from "@/components/common";

const GUIDE = [
  { name: "Ligue 1+", color: "#DC2626", covers: "Ligue 1 — 8 of 9 matches" },
  { name: "Amazon Prime", color: "#0EA5E9", covers: "Ligue 1 — pick of the week" },
  { name: "CANAL+", color: "#4F46E5", covers: "Premier League · Champions · Europa · Conference League" },
  { name: "beIN SPORTS", color: "#DB2777", covers: "La Liga · Bundesliga · Ligue 2 · Nations League" },
  { name: "M6", color: "#14B8A6", covers: "France (free-to-air) — World Cup, Nations League" },
];

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
  return (
    <>
      <PageHeader title="Broadcasters" subtitle="Channel guide · France" />

      <SectionLabel>By channel</SectionLabel>
      <div className="flex flex-col">
        {GUIDE.map((g) => (
          <Row key={g.name} {...g} />
        ))}
      </div>

      <div className="mt-5">
        <SectionLabel>World Cup 2026</SectionLabel>
        <div className="flex flex-col">
          <Row name="beIN SPORTS" color="#DB2777" covers="All 104 matches" />
          <Row name="M6" color="#14B8A6" covers="France, semis & final (free-to-air)" />
        </div>
      </div>
    </>
  );
}
