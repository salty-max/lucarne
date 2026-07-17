import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Custom UI primitives (replacing the old shadcn ui/ layer): a rounded Panel,
 * a pill Chip, and a Skeleton. Clean, soft-elevated, single blue accent.
 */

/** A flat, borderless surface — reads against the page by tone, not a border.
 *  `interactive` gives it a subtle tonal hover. */
export function Panel({
  className,
  interactive,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-card",
        interactive && "transition-colors hover:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

const chipVariants = cva(
  "inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        muted: "bg-muted text-muted-foreground",
        accent: "bg-primary text-primary-foreground",
        live: "bg-live/10 text-live",
        outline: "border text-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: { variant: "muted", size: "sm" },
  },
);

export function Chip({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
  return <span className={cn(chipVariants({ variant, size }), className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} {...props} />;
}
