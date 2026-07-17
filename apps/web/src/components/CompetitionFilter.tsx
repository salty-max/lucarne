import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Check, ChevronDown, ListFilter, Search, X } from "lucide-react";
import { useCompetitions } from "@/hooks/useCompetitions";
import { CompetitionLogo } from "./Logo";
import { cn } from "@/lib/utils";

/**
 * Multi-select, type-to-filter competition picker. Built on Radix Popover +
 * Checkbox for keyboard/focus/dismiss accessibility. `value` is the selected
 * slugs; empty = no filter.
 */
export function CompetitionFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (slugs: string[]) => void;
}) {
  const comps = useCompetitions() ?? [];
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const options = comps.filter(
    (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
  );
  const selected = comps.filter((c) => value.includes(c.slug));

  const toggle = (slug: string) =>
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            {value.length ? `${value.length} selected` : "Filter by competition"}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="popover-content z-30 w-72 rounded-lg border bg-card p-1 shadow-lg"
          >
            <div className="flex items-center gap-2 border-b px-2 pb-2 pt-1">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search competitions…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ScrollArea.Root type="auto" className="overflow-hidden">
              <ScrollArea.Viewport className="max-h-64 w-full">
                <ul className="py-1 pr-1.5">
                  {options.map((c) => {
                    const checked = value.includes(c.slug);
                    return (
                      <li key={c.slug}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                          <Checkbox.Root
                            checked={checked}
                            onCheckedChange={() => toggle(c.slug)}
                            className="grid h-4 w-4 shrink-0 place-items-center rounded border border-muted-foreground/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                          >
                            <Checkbox.Indicator>
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </Checkbox.Indicator>
                          </Checkbox.Root>
                          <CompetitionLogo slug={c.slug} size={18} />
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{c.country}</span>
                        </label>
                      </li>
                    );
                  })}
                  {options.length === 0 && (
                    <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No competition found
                    </li>
                  )}
                </ul>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar
                orientation="vertical"
                className="flex w-2 touch-none select-none py-1"
              >
                <ScrollArea.Thumb className="flex-1 rounded-full bg-muted-foreground/30" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            {value.length > 0 && (
              <div className="border-t p-1">
                <button
                  onClick={() => onChange([])}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {selected.map((c) => (
        <span
          key={c.slug}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg bg-muted py-1.5 pl-2.5 pr-1.5 text-sm font-medium",
          )}
        >
          <CompetitionLogo slug={c.slug} size={16} />
          <span className="max-w-40 truncate">{c.name}</span>
          <button
            onClick={() => toggle(c.slug)}
            aria-label={`Remove ${c.name}`}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
