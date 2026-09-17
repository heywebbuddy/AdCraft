import { Spark } from "@/components/spark";

export default function AdminLoading() {
  return (
    <div className="admin-loading" role="status" aria-live="polite">
      <Spark size={28} animate="spin" className="text-orange" />
      <span>Loading…</span>
    </div>
  );
}
