import { useState } from "react";
import { competitionLogo, teamLogo } from "@/lib/logos";
import { cn } from "@/lib/utils";

/**
 * Team crest: bundled local PNG when we have it (clubs), else the API crest
 * (national teams / anything unmapped), else the team's initials.
 */
export function TeamLogo({
  name,
  apiLogo,
  size = 22,
  className,
}: {
  name: string;
  apiLogo: string | null;
  size?: number;
  className?: string;
}) {
  const local = teamLogo(name);
  const [src, setSrc] = useState<string | null>(local ?? apiLogo);

  if (!src) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <span
        style={{ width: size, height: size }}
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-muted text-[0.55rem] font-bold text-muted-foreground",
          className,
        )}
      >
        {initials}
      </span>
    );
  }

  // Crests are designed for light backgrounds; a light "coin" keeps dark logos
  // legible on the dark theme (and looks clean on light too).
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/10",
        className,
      )}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setSrc((cur) => (cur === local ? apiLogo : null))}
        className="h-[82%] w-[82%] object-contain"
      />
    </span>
  );
}

/** Competition crest (bundled SVG), or nothing when we don't have one. */
export function CompetitionLogo({
  slug,
  size = 18,
  className,
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const src = competitionLogo(slug);
  if (!src) return null;
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-black/10",
        className,
      )}
    >
      <img src={src} alt="" className="h-[80%] w-[80%] object-contain" />
    </span>
  );
}
