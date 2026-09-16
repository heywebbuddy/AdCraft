import { Spark } from "@/components/spark";

/** Route-level loading state for every app page: the spark, spinning. */
export default function Loading() {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <Spark size={34} animate="spin" className="text-orange" />
      <span>Loading…</span>
    </div>
  );
}
