import { toggleFavorite, useIsFavorite } from "@/lib/favorites";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** A ★/☆ toggle that follows/unfollows a team (by its raw name). Stops event
 *  propagation so it works inside clickable match rows. */
export function FavoriteStar({ team, className }: { team: string; className?: string }) {
  const fav = useIsFavorite(team);
  const t = useT();
  const label = `${fav ? t.favorites.remove : t.favorites.add} — ${team}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(team);
      }}
      aria-pressed={fav}
      aria-label={label}
      title={label}
      className={cn(
        "shrink-0 leading-none transition-colors",
        fav
          ? "text-[hsl(var(--tt-yellow))]"
          : "text-muted-foreground/40 hover:text-[hsl(var(--tt-yellow))]",
        className,
      )}
    >
      {fav ? "★" : "☆"}
    </button>
  );
}
