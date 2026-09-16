import * as React from "react";
import { cn } from "../cn";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--line)] bg-white text-[var(--ink)] shadow-[0_1px_2px_rgba(36,37,33,0.04)]",
        className,
      )}
      {...props}
    />
  );
}
