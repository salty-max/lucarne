import { Menu } from "lucide-react";
import { useLiveCount } from "@/hooks/useLiveCount";
import { LivePill } from "./common";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ onMenu }: { onMenu: () => void }) {
  const live = useLiveCount();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="text-lg font-bold tracking-tight lg:hidden">
        Lucarne<span className="text-primary">.</span>
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <LivePill count={live} />
        <ThemeToggle />
      </div>
    </header>
  );
}
