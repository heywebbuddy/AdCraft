import * as React from "react";
import { cn } from "../cn";

export type BadgeVariant = "neutral" | "orange" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-[var(--line)] text-[var(--ink)]",
  orange: "bg-[var(--orange)] text-white",
  outline: "border border-[var(--line)] text-[var(--muted)]",
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
