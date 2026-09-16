import { Badge, Card } from "@adcraft/ui";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-4xl text-ink">Dashboard</h1>
        <Badge>Placeholder</Badge>
      </div>
      <Card className="p-6">
        <p className="text-muted">
          The real dashboard is being designed. This route group is protected by Auth.js middleware.
        </p>
      </Card>
    </div>
  );
}
