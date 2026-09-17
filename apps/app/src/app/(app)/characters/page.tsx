import Link from "next/link";
import { requireOrg } from "@/server/org";
import { characterStudioData } from "@/server/character-studio";
import { currentSubscription, CREDIT_COSTS } from "@/server/billing";
import { planAllows } from "@/server/platform-settings";
import { CharacterStudio } from "./studio";
import "./studio.css";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const ctx = await requireOrg();
  if (!ctx.brand) return <div className="panel p-6"><h1>Create your brand first</h1><p>Your characters and products belong to a brand workspace.</p><Link href="/brands/new" className="btn btn-orange h-11">Create a brand</Link></div>;
  const sub = await currentSubscription(ctx.org.id);
  const enabled = await planAllows(sub?.plan, "ugc");
  return <CharacterStudio key={ctx.brand.id} data={await characterStudioData(ctx.org.id, ctx.brand.id)} brandName={ctx.brand.name} balance={ctx.credits.balance} videoCredits={CREDIT_COSTS.ugcVideo30s} canEdit={ctx.role !== "viewer" && enabled} planEnabled={enabled} />;
}
