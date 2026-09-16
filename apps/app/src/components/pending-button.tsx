"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Spark } from "./spark";

/**
 * Submit button that shows the spinning spark while its form is pending.
 * Drop-in for `<button type="submit" className="btn …">`.
 */
export function PendingButton({
  children,
  pendingLabel,
  className = "btn btn-orange",
  disabled,
  ...rest
}: { children: ReactNode; pendingLabel?: string; className?: string; disabled?: boolean } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className" | "type" | "disabled"
>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${className} ${pending ? "is-pending" : ""}`.trim()} disabled={disabled || pending} aria-busy={pending} {...rest}>
      {pending ? (
        <>
          <Spark size={15} animate="spin" />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
