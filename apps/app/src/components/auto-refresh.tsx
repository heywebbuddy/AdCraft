"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server component tree on an interval while something is processing. */
export function AutoRefresh({ everyMs = 3000, active = true }: { everyMs?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, active]);
  return null;
}
