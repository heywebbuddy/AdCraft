import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import {
  db,
  dbReady,
  adAccounts,
  adSets,
  adminNotes,
  ads,
  apiKeys,
  approvals,
  auditLog,
  brandKits,
  brands,
  briefs,
  campaigns,
  characters,
  comments,
  concepts,
  creatives,
  creditLedger,
  errorEvents,
  generationEvents,
  invites,
  memberships,
  metricsDaily,
  organizations,
  products,
  projects,
  renders,
  subscriptions,
  templates,
  users,
  variants,
  type BrandKitData,
  type ConceptData,
} from "@adcraft/db";
import { getStorage, mimeFromExt, objectKey } from "@adcraft/storage";
import { getPlacement } from "@adcraft/specs";
import { normalizeDocument, type StaticAdDocument, type StaticTemplate } from "@adcraft/render";
import { normalizeVideoDocument } from "@adcraft/render/video";
import { DEMO_ADMIN_EMAIL, DEMO_EMAIL_DOMAIN, DEMO_STUDIO_EMAIL } from "@/lib/demo";
import { DEMO_WORLD_FLAG, forgetDemoOrgs } from "./demo";
import { PLANS, type PlanId } from "./billing";

/**
 * The demo world for DEMO_MODE (server/demo.ts): one rich workspace for the "Explore the ad
 * studio" door, and a handful of sample customer workspaces so the admin panel shows a healthy
 * install. Everything is seeded straight into the database.
 *
 * Costs nothing to build:
 * - Pictures and videos are files the repo already ships (the marketing site's `dist/assets/ads`),
 *   copied into storage. No AI or image API is called and nothing is hotlinked.
 * - Finished static ads are rendered by the app's own local renderer (satori + resvg, CPU only).
 * - Campaigns are published to the built-in *sandbox* ad platforms (externalId `sandbox-…`, which
 *   never leave the process) and their 30 days of numbers come from the sandbox's synthetic
 *   insights, so every screen reads real rows in the shapes the app writes itself.
 *
 * Idempotent: the workspace is found by slug; a finished world returns at once, a half-finished
 * one (crash mid-render) resumes. The rows are written in one transaction, so a failure leaves
 * nothing behind but a few stored files.
 */

export const DEMO_SEED_VERSION = 1;
export const DEMO_STUDIO_SLUG = "demo-eclat-skin";

const DAY = 86_400_000;
const daysAgo = (d: number, hour = 10) => {
  const t = new Date(Date.now() - d * DAY);
  t.setUTCHours(hour, (d * 7) % 60, 0, 0);
  return t;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export type DemoWorld = { orgId: string; studioUserId: string; adminUserId: string; created: boolean };

let running: Promise<DemoWorld> | null = null;

/** Build the demo world once per process (and once per database). Safe to call on every door click. */
export function ensureDemoWorld(opts: { assetsDir?: string } = {}): Promise<DemoWorld> {
  running ??= seedDemoWorld(opts)
    .then((w) => {
      forgetDemoOrgs();
      return w;
    })
    .catch((err) => {
      // A failed seed must not be memoised, or the demo stays broken until a restart.
      running = null;
      throw err;
    });
  return running;
}

export function forgetDemoSeed(): void {
  running = null;
}

// ---------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------

/** Where the shipped marketing images live: public/ after `site:sync`, or the repo's dist/. */
export function findAssetsDir(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.DEMO_ASSETS_DIR,
    path.resolve(process.cwd(), "public/assets/ads"),
    path.resolve(process.cwd(), "../../dist/assets/ads"),
    path.resolve(process.cwd(), "dist/assets/ads"),
    path.resolve(process.cwd(), "apps/app/public/assets/ads"),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) if (fs.existsSync(path.join(dir, "eclat-packshot.webp"))) return dir;
  throw new Error(`Demo assets not found (looked in ${candidates.join(", ")}). Set DEMO_ASSETS_DIR to the repo's dist/assets/ads.`);
}

class AssetStore {
  constructor(private dir: string, private orgId: string) {}
  private cache = new Map<string, { key: string; bytes: number; mime: string }>();
  /** Copy one shipped file into this org's storage; the same file is stored once. */
  async put(file: string, kind: "products" | "renders" | "logos" | "uploads" = "renders") {
    const id = `${kind}:${file}`;
    const hit = this.cache.get(id);
    if (hit) return hit;
    const body = fs.readFileSync(path.join(this.dir, file));
    const ext = path.extname(file).slice(1);
    const mime = mimeFromExt(file);
    const key = objectKey(this.orgId, kind, ext);
    await getStorage().put(key, body, { contentType: mime });
    const out = { key, bytes: body.byteLength, mime };
    this.cache.set(id, out);
    return out;
  }
  /** Store generated text content (the brand's SVG wordmark). */
  async putText(text: string, kind: "logos", ext: string, mime: string) {
    const key = objectKey(this.orgId, kind, ext);
    await getStorage().put(key, Buffer.from(text), { contentType: mime });
    return { key };
  }
}

/** Deterministic pseudo-random numbers, so every seeded install looks the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------------------

export async function seedDemoWorld(opts: { assetsDir?: string } = {}): Promise<DemoWorld> {
  await dbReady;
  const studioUserId = await ensureUser(db, DEMO_STUDIO_EMAIL, "Maya Laurent", daysAgo(96));
  const adminUserId = await ensureUser(db, DEMO_ADMIN_EMAIL, "Sam Okafor (demo operator)", daysAgo(120));
  // The demo admin is a platform admin while DEMO_MODE is on (also kept by syncAdminFlag).
  await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, adminUserId));

  let org = await db.query.organizations.findFirst({ where: eq(organizations.slug, DEMO_STUDIO_SLUG) });
  let created = false;
  if (!org) {
    const assetsDir = findAssetsDir(opts.assetsDir);
    try {
      await db.transaction(async (tx) => {
        const orgId = await buildStudio(tx, assetsDir, studioUserId, adminUserId);
        await buildCustomers(tx, adminUserId, orgId);
      });
      created = true;
    } catch (err) {
      // Another process may have won the race to the unique slug; anything else is real.
      org = await db.query.organizations.findFirst({ where: eq(organizations.slug, DEMO_STUDIO_SLUG) });
      if (!org) throw err;
    }
    org ??= await db.query.organizations.findFirst({ where: eq(organizations.slug, DEMO_STUDIO_SLUG) });
  }
  if (!org) throw new Error("Demo workspace was not created");
  forgetDemoOrgs();

  const seedState = (org.settings as Record<string, unknown>)?.demoSeed as { version?: number; complete?: boolean } | undefined;
  if (!seedState?.complete || (seedState.version ?? 0) < DEMO_SEED_VERSION) {
    const done = await finishStudio(org.id);
    // Leave it unfinished (the next start resumes) rather than freeze a half-rendered world.
    if (!done) return { orgId: org.id, studioUserId, adminUserId, created };
    await db
      .update(organizations)
      .set({ settings: sql`${organizations.settings} || ${JSON.stringify({ demoSeed: { version: DEMO_SEED_VERSION, complete: true, at: new Date().toISOString() } })}::jsonb` })
      .where(eq(organizations.id, org.id));
  }
  return { orgId: org.id, studioUserId, adminUserId, created };
}

async function ensureUser(x: Exec, email: string, name: string, createdAt: Date): Promise<string> {
  await x.insert(users).values({ email, name, emailVerified: createdAt, createdAt }).onConflictDoNothing();
  const row = await x.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
  if (!row) throw new Error(`Could not create ${email}`);
  return row.id;
}

// ---------------------------------------------------------------------------------------
// The studio workspace: Éclat Skin
// ---------------------------------------------------------------------------------------

const KIT: BrandKitData = {
  colors: { primary: "#3a2a24", secondary: "#c8735a", accent: "#d9825f", background: "#f7efe7", text: "#2f2420" },
  fonts: { heading: "Instrument Serif", body: "DM Sans" },
  voice: {
    tone: ["warm", "confident", "clean", "sensory"],
    doSay: ["glow", "ritual", "skin that feels like skin", "dermatologist-tested"],
    dontSay: ["flawless", "anti-ageing miracle", "cures", "overnight results guaranteed"],
  },
  tagline: "Skin, but brighter.",
  ctaStyle: "Short and direct: Shop the serum, Find your glow.",
  site: {
    url: "https://eclat-skin.example",
    importedAt: daysAgo(95).toISOString(),
    palette: ["#3a2a24", "#c8735a", "#d9825f", "#f7efe7", "#e9d8c8"],
    fonts: ["Instrument Serif", "DM Sans"],
    headline: "Clean skincare for skin that glows on its own.",
  },
};

const WORDMARK = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120"><text x="240" y="84" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="78" font-style="italic" letter-spacing="6" fill="#3a2a24">Éclat</text></svg>`;

const PRODUCTS = [
  { key: "serum", name: "Radiance Serum", file: "eclat-packshot.webp", price: "$48", desc: "Vitamin C + niacinamide serum in a frosted dropper bottle. 30 ml.", ageDays: 92 },
  { key: "cream", name: "Daily Glow Cream", file: "petal-cream.webp", price: "$42", desc: "Lightweight ceramide moisturiser with a dewy finish. 50 ml.", ageDays: 90 },
  { key: "spf", name: "Mineral Sun Shield SPF 40", file: "dune-sunscreen.webp", price: "$34", desc: "Zinc-only daily sunscreen, no white cast. 50 ml.", ageDays: 70 },
  { key: "mist", name: "Soft Focus Mist", file: "mist-spray.webp", price: "$28", desc: "Rose-water setting and hydrating mist. 100 ml.", ageDays: 64 },
  { key: "lip", name: "Overnight Lip Mask", file: "mira-lip.webp", price: "$22", desc: "Shea and peptide lip mask. 15 g.", ageDays: 41 },
  { key: "oil", name: "Botanical Face Oil", file: "kin-oil.webp", price: "$52", desc: "Squalane, rosehip and jojoba face oil. 30 ml.", ageDays: 33 },
] as const;
type ProductKey = (typeof PRODUCTS)[number]["key"];

type ConceptSeed = { title: string; status: "selected" | "proposed" | "rejected"; kind: "static" | "video" | "ugc"; data: ConceptData };
type BriefSeed = {
  key: string;
  title: string;
  product: ProductKey;
  ageDays: number;
  data: { objective: string; audience: string; offer?: string; platforms: string[]; formats: Array<"static" | "video" | "ugc">; constraints?: string[]; tone?: string };
  concepts: ConceptSeed[];
};

const c = (title: string, status: ConceptSeed["status"], kind: ConceptSeed["kind"], d: Partial<ConceptData> & Pick<ConceptData, "headline" | "hook">): ConceptSeed => ({
  title,
  status,
  kind,
  data: {
    angle: d.angle ?? "Benefit-led",
    primaryText: d.primaryText ?? `${d.hook} Dermatologist-tested, vegan, and gentle enough for every day.`,
    cta: d.cta ?? "Shop now",
    visualDirection: d.visualDirection ?? "Warm window light on travertine, soft shadows, editorial calm.",
    ...d,
  },
});

const BRIEFS: BriefSeed[] = [
  {
    key: "serum",
    title: "Radiance Serum — summer launch",
    product: "serum",
    ageDays: 31,
    data: {
      objective: "conversion",
      audience: "Women 25–40 in the US and UK who already use a 3-step routine and want visible glow without heavy actives.",
      offer: "15% off the first order with code GLOW15",
      platforms: ["meta", "instagram", "tiktok"],
      formats: ["static", "ugc"],
      constraints: ["No before/after imagery", "Say 'dermatologist-tested', never 'clinically proven'"],
      tone: "Warm, sensory, quietly confident",
    },
    concepts: [
      c("Glass-skin glow", "selected", "static", { hook: "That lit-from-within look, in two drops.", headline: "Glow that's actually yours", angle: "Sensory payoff", cta: "Shop the serum", visualDirection: "Frosted bottle on soft linen in late-afternoon light, rosemary sprig." }),
      c("The 30-second ritual", "selected", "static", { hook: "The easiest step in your routine is also the one you'll notice.", headline: "Two drops. Thirty seconds.", angle: "Routine simplicity", cta: "Find your glow" }),
      c("Real routine, real glow", "selected", "ugc", { hook: "I've tried every vitamin C serum. This is the one I finished.", headline: "The serum I actually finished", angle: "Creator testimonial", cta: "Try it for 15% off", script: "I've tried every vitamin C serum out there.\nMost of them sting, or smell like pennies.\nThis one? Two drops, morning and night.\nThree weeks in, my skin just looks awake.\nUse GLOW15 for fifteen percent off." }),
      c("Serum drop, slowed down", "selected", "video", { hook: "Watch it sink in.", headline: "Made to melt in", angle: "Texture close-up", cta: "Shop now", script: "A single golden drop.\nIt melts on contact.\nNo stickiness, just glow.\nRadiance Serum by Éclat." }),
      c("Dermatologist-tested, not hyped", "proposed", "static", { hook: "No miracle claims. Just a serum that works quietly.", headline: "Tested by derms. Loved by skin.", angle: "Trust" }),
      c("Sunrise in a bottle", "rejected", "static", { hook: "Your morning, bottled.", headline: "Sunrise in a bottle", angle: "Metaphor" }),
    ],
  },
  {
    key: "cream",
    title: "Daily Glow Cream — always-on",
    product: "cream",
    ageDays: 24,
    data: {
      objective: "consideration",
      audience: "Skincare-curious 22–35s comparing moisturisers; dry or combination skin.",
      platforms: ["meta", "google"],
      formats: ["static"],
      constraints: ["Mention ceramides", "No price in the headline"],
    },
    concepts: [
      c("Dew, not grease", "selected", "static", { hook: "Moisture you can feel, shine you can't.", headline: "Dewy, never greasy", angle: "Objection handling", cta: "See why" }),
      c("Ceramide comfort", "proposed", "static", { hook: "Your barrier will thank you by Thursday.", headline: "Ceramides, made comfy", angle: "Ingredient story" }),
      c("The last moisturiser you'll compare", "proposed", "static", { hook: "We read the reviews so you don't have to.", headline: "Stop comparing. Start glowing.", angle: "Comparison" }),
    ],
  },
  {
    key: "spf",
    title: "SPF 40 — beach season",
    product: "spf",
    ageDays: 17,
    data: {
      objective: "awareness",
      audience: "Active 20–35s who skip sunscreen because it feels heavy or leaves a cast.",
      platforms: ["tiktok", "youtube", "meta"],
      formats: ["static", "video"],
      tone: "Playful, sunny",
    },
    concepts: [
      c("Sun that feels like nothing", "selected", "static", { hook: "Zinc that disappears. Protection that doesn't.", headline: "SPF you'll forget you're wearing", angle: "Feel", cta: "Get sun-ready" }),
      c("No white cast, promise", "proposed", "static", { hook: "Every skin tone, zero ghosting.", headline: "No cast. No excuses.", angle: "Inclusivity" }),
    ],
  },
  {
    key: "lip",
    title: "Lip Mask — holiday gifting",
    product: "lip",
    ageDays: 9,
    data: {
      objective: "conversion",
      audience: "Gift buyers 25–50 shopping for stocking fillers under $25.",
      offer: "Free gift wrap through December",
      platforms: ["meta", "instagram"],
      formats: ["static"],
    },
    concepts: [
      c("Wake up to softer lips", "selected", "static", { hook: "Eight hours of work while you sleep.", headline: "Wake up to softer lips", angle: "Overnight payoff", cta: "Gift it" }),
      c("The stocking filler they'll use", "proposed", "static", { hook: "Small box, big thank-you.", headline: "The gift that gets used", angle: "Gifting" }),
      c("Mist & go", "selected", "static", { hook: "Reset your skin between meetings.", headline: "Mist. Glow. Go.", angle: "On-the-go", cta: "Shop the mist" }),
    ],
  },
];

/** Finished static ads: concept title → the scene picture and the template. */
const STATIC_ADS: Array<{ concept: string; scene: string; template: StaticTemplate; placements: string[]; ageDays: number; align?: "left" | "center" }> = [
  { concept: "Glass-skin glow", scene: "eclat-lifestyle.webp", template: "hero", placements: ["meta.feed.4x5", "meta.feed.1x1", "meta.stories.9x16"], ageDays: 30 },
  { concept: "The 30-second ritual", scene: "eclat-hands.webp", template: "minimal", placements: ["meta.feed.4x5", "meta.stories.9x16"], ageDays: 29, align: "center" },
  { concept: "Dew, not grease", scene: "petal-cream.webp", template: "split", placements: ["meta.feed.4x5", "meta.feed.1x1"], ageDays: 22 },
  { concept: "Sun that feels like nothing", scene: "dune-sunscreen.webp", template: "bold", placements: ["meta.feed.4x5", "meta.stories.9x16"], ageDays: 15, align: "center" },
  { concept: "Wake up to softer lips", scene: "mira-lip.webp", template: "hero", placements: ["meta.feed.4x5", "meta.feed.1x1"], ageDays: 7 },
  { concept: "Mist & go", scene: "mist-spray.webp", template: "minimal", placements: ["meta.feed.4x5"], ageDays: 5, align: "center" },
];

const TEAM = [
  { email: `jonas.weber@${DEMO_EMAIL_DOMAIN}`, name: "Jonas Weber", role: "editor" as const, ageDays: 88 },
  { email: `priya.shah@${DEMO_EMAIL_DOMAIN}`, name: "Priya Shah", role: "editor" as const, ageDays: 61 },
  { email: `leo.martins@${DEMO_EMAIL_DOMAIN}`, name: "Leo Martins (client)", role: "viewer" as const, ageDays: 40 },
];

async function buildStudio(tx: Tx, assetsDir: string, ownerId: string, adminId: string): Promise<string> {
  const [org] = await tx
    .insert(organizations)
    .values({
      name: "Éclat Skin Co.",
      slug: DEMO_STUDIO_SLUG,
      settings: { [DEMO_WORLD_FLAG]: true, approvalBeforePublish: false, notifyOnFinish: true, spendApprovalAbove: 250 },
      createdAt: daysAgo(96),
    })
    .returning();
  const orgId = org!.id;
  const assets = new AssetStore(assetsDir, orgId);

  // Team.
  const teamIds = new Map<string, string>();
  await tx.insert(memberships).values({ orgId, userId: ownerId, role: "owner", createdAt: daysAgo(96) });
  for (const t of TEAM) {
    const id = await ensureUser(tx, t.email, t.name, daysAgo(t.ageDays));
    teamIds.set(t.name, id);
    await tx.insert(memberships).values({ orgId, userId: id, role: t.role, createdAt: daysAgo(t.ageDays) });
  }
  // The demo operator can open the workspace too (read-only, like everyone in the demo).
  await tx.insert(memberships).values({ orgId, userId: adminId, role: "viewer", createdAt: daysAgo(90) });
  await tx.insert(invites).values({
    orgId,
    email: `studio@northpeak-films.${DEMO_EMAIL_DOMAIN}`,
    role: "editor",
    token: `demo-${randomUUID()}`,
    invitedBy: ownerId,
    expiresAt: new Date(Date.now() + 5 * DAY),
    createdAt: daysAgo(2),
  });
  const jonas = teamIds.get("Jonas Weber")!;
  const priya = teamIds.get("Priya Shah")!;
  const leo = teamIds.get("Leo Martins (client)")!;

  // Plan and credits: the top plan with a generous balance.
  const agency = PLANS.agency;
  await tx.insert(subscriptions).values([
    { orgId, plan: "studio", status: "canceled", creditsPerPeriod: PLANS.studio.credits, currentPeriodStart: daysAgo(96), currentPeriodEnd: daysAgo(66), createdAt: daysAgo(96) },
    { orgId, plan: "agency", status: "active", creditsPerPeriod: agency.credits, currentPeriodStart: daysAgo(12), currentPeriodEnd: new Date(Date.now() + 18 * DAY), createdAt: daysAgo(66) },
  ]);
  await tx.insert(creditLedger).values([
    { orgId, delta: 10, reason: "subscription_grant", referenceId: "demo:trial", meta: { trial: true }, createdAt: daysAgo(96) },
    { orgId, delta: PLANS.studio.credits, reason: "subscription_grant", referenceId: "demo:studio:1", meta: { plan: "studio" }, createdAt: daysAgo(95) },
    { orgId, delta: agency.credits, reason: "subscription_grant", referenceId: "demo:agency:1", meta: { plan: "agency" }, createdAt: daysAgo(66) },
    { orgId, delta: agency.credits, reason: "subscription_grant", referenceId: "demo:agency:2", meta: { plan: "agency" }, createdAt: daysAgo(42) },
    { orgId, delta: agency.credits, reason: "subscription_grant", referenceId: "demo:agency:3", meta: { plan: "agency" }, createdAt: daysAgo(12) },
    { orgId, delta: 300, reason: "top_up", referenceId: "demo:topup:1", meta: { pack: "3 × 100" }, createdAt: daysAgo(19) },
  ]);

  // Brand and kit.
  const [brand] = await tx
    .insert(brands)
    .values({ orgId, name: "Éclat Skin", website: "https://eclat-skin.example", industry: "Beauty & skincare", createdAt: daysAgo(96) })
    .returning();
  const brandId = brand!.id;
  const logo = await assets.putText(WORDMARK, "logos", "svg", "image/svg+xml");
  const kit: BrandKitData = { ...KIT, logoUrl: `/api/files/${logo.key}` };
  await tx.insert(brandKits).values([
    { orgId, brandId, version: 1, isActive: false, data: { ...KIT, voice: { tone: ["warm", "clean"] } }, createdAt: daysAgo(95) },
    { orgId, brandId, version: 2, isActive: true, data: kit, createdAt: daysAgo(58) },
  ]);

  // Products.
  const productIds = new Map<ProductKey, { id: string; imageKey: string; name: string }>();
  for (const p of PRODUCTS) {
    const img = await assets.put(p.file, "products");
    const [row] = await tx
      .insert(products)
      .values({
        orgId,
        brandId,
        name: p.name,
        description: p.desc,
        price: p.price,
        url: `https://eclat-skin.example/products/${p.key}`,
        imageKey: img.key,
        cutoutKey: img.key,
        attributes: { width: 864, height: 1152, bytes: img.bytes, originalName: p.file, cutout: { status: "ready", model: "birefnet", removed: false, updatedAt: daysAgo(p.ageDays).toISOString() } },
        createdAt: daysAgo(p.ageDays),
      })
      .returning({ id: products.id });
    productIds.set(p.key, { id: row!.id, imageKey: img.key, name: p.name });
  }

  // Briefs, concepts and their (finished) concept runs.
  const conceptIds = new Map<string, { id: string; briefId: string; data: ConceptData; product: ProductKey; kind: ConceptSeed["kind"] }>();
  const event = (e: Omit<typeof generationEvents.$inferInsert, "orgId">) => ({ orgId, userId: ownerId, ...e });
  const events: Array<typeof generationEvents.$inferInsert> = [];
  const spend: Array<typeof creditLedger.$inferInsert> = [];
  for (const b of BRIEFS) {
    const [project] = await tx.insert(projects).values({ orgId, brandId, name: b.title, createdAt: daysAgo(b.ageDays) }).returning({ id: projects.id });
    const [brief] = await tx
      .insert(briefs)
      .values({ orgId, projectId: project!.id, productId: productIds.get(b.product)!.id, title: b.title, data: b.data as never, createdAt: daysAgo(b.ageDays) })
      .returning({ id: briefs.id });
    const briefId = brief!.id;
    const rows = await tx
      .insert(concepts)
      .values(b.concepts.map((cs) => ({ orgId, briefId, title: cs.title, kind: cs.kind, status: cs.status, data: cs.data, model: "claude-opus-5", createdAt: daysAgo(b.ageDays, 11) })))
      .returning({ id: concepts.id, title: concepts.title });
    for (const r of rows) {
      const cs = b.concepts.find((x) => x.title === r.title)!;
      conceptIds.set(r.title, { id: r.id, briefId, data: cs.data, product: b.product, kind: cs.kind });
    }
    const eventId = randomUUID();
    events.push(
      event({
        id: eventId,
        briefId,
        capability: "text",
        provider: "anthropic",
        model: "claude-opus-5",
        status: "succeeded",
        credits: 1,
        costUsd: "0.046210",
        durationMs: 14_200,
        inputTokens: 3_812,
        outputTokens: 2_604,
        operationId: `demo:concepts:${briefId}`,
        meta: { label: `${b.title} · concepts`, detail: `${b.concepts.length} hooks and angles`, requestedConcepts: 8, concepts: b.concepts.length },
        createdAt: daysAgo(b.ageDays, 11),
      }),
    );
    spend.push({ orgId, delta: -1, reason: "generation", referenceId: eventId, meta: { briefId, capability: "text" }, createdAt: daysAgo(b.ageDays, 11) });
  }

  // Static ads: document, sizes, and the scene picture. Rendered after the transaction.
  const creativeIds = new Map<string, string>();
  for (const s of STATIC_ADS) {
    const cpt = conceptIds.get(s.concept)!;
    const scene = await assets.put(s.scene, "renders");
    const product = productIds.get(cpt.product)!;
    const doc: StaticAdDocument = normalizeDocument({
      mode: "editable",
      template: s.template,
      scene: { kind: "image", key: scene.key },
      // The scene already shows the product, so no separate cutout layer.
      product: null,
      headline: cpt.data.headline,
      subhead: cpt.data.hook.length <= 110 ? cpt.data.hook : undefined,
      cta: cpt.data.cta,
      brand: {
        name: "Éclat Skin",
        logoUrl: kit.logoUrl,
        colors: { primary: KIT.colors.primary, accent: KIT.colors.accent!, background: KIT.colors.background!, text: KIT.colors.text! },
        fonts: KIT.fonts,
      },
      layout: { align: s.align ?? "left", headlineSize: s.template === "bold" ? 96 : 84, overlay: s.template === "minimal" ? 0.35 : 0.55 },
      meta: { model: "nano-banana-pro", conceptId: cpt.id, productId: product.id, visualDirection: cpt.data.visualDirection, tone: KIT.voice?.tone ?? [] },
    });
    const [cr] = await tx
      .insert(creatives)
      .values({ orgId, conceptId: cpt.id, kind: "static", name: s.concept, document: doc as unknown as Record<string, unknown>, createdAt: daysAgo(s.ageDays, 14), updatedAt: daysAgo(s.ageDays, 15) })
      .returning({ id: creatives.id });
    const creativeId = cr!.id;
    creativeIds.set(s.concept, creativeId);
    await tx.insert(variants).values(
      s.placements.map((id) => {
        const p = getPlacement(id);
        return { orgId, creativeId, placementId: p.id, ratio: p.ratio, width: p.width, height: p.height, createdAt: daysAgo(s.ageDays, 14) };
      }),
    );
    const eventId = randomUUID();
    events.push(
      event({
        id: eventId,
        briefId: cpt.briefId,
        creativeId,
        capability: "image",
        provider: "fal",
        model: "nano-banana-pro",
        status: "succeeded",
        credits: 2,
        costUsd: "0.150000",
        durationMs: 21_400,
        units: "1",
        operationId: `demo:static:${creativeId}`,
        meta: { label: `${s.concept} · scene`, detail: "Nano Banana Pro · 4:5", template: s.template, sceneKey: scene.key },
        createdAt: daysAgo(s.ageDays, 14),
      }),
    );
    spend.push({ orgId, delta: -2, reason: "generation", referenceId: eventId, meta: { creativeId, model: "nano-banana-pro", capability: "image" }, createdAt: daysAgo(s.ageDays, 14) });
  }

  // A UGC video and a product video, finished, from the shipped clips.
  const videos = [
    { concept: "Real routine, real glow", kind: "ugc" as const, file: "eclat-ugc.mp4", poster: "eclat-ugc-1.webp", ageDays: 26, credits: 40 },
    { concept: "Serum drop, slowed down", kind: "video" as const, file: "eclat-drop.mp4", poster: "eclat-packshot.webp", ageDays: 27, credits: 20 },
  ];
  const videoVariants = new Map<string, { variantId: string; renderId: string; placementId: string }[]>();
  for (const v of videos) {
    const cpt = conceptIds.get(v.concept)!;
    const clip = await assets.put(v.file, "renders");
    const poster = await assets.put(v.poster, "renders");
    const product = productIds.get(cpt.product)!;
    const lines = (cpt.data.script ?? "").split("\n").filter(Boolean);
    const doc = normalizeVideoDocument({
      kind: v.kind,
      model: "kling-3.0",
      imageModel: "nano-banana-pro",
      ratio: "9:16",
      script: cpt.data.script ?? "",
      scenes: lines.map((line, i) => ({ id: `scene-${i + 1}`, line, caption: line, prompt: cpt.data.visualDirection, durationSec: v.kind === "ugc" ? 6 : 3, hookText: i === 0 ? cpt.data.hook : undefined, still: { key: poster.key } })),
      product: { id: product.id, name: product.name, cutout: { key: product.imageKey } },
      brand: { name: "Éclat Skin", colors: { primary: KIT.colors.primary, accent: KIT.colors.accent!, background: KIT.colors.background!, text: KIT.colors.text! }, fonts: { heading: "Instrument Serif", body: "DM Sans" } },
      captions: { style: v.kind === "ugc" ? "bold" : "clean", position: "bottom" },
      endCard: { headline: cpt.data.headline, cta: cpt.data.cta, durationSec: 2.5 },
      voice: v.kind === "ugc" ? { voiceId: "21m00Tcm4TlvDq8ikWAM", provider: "elevenlabs" } : undefined,
      presenter: v.kind === "ugc" ? { avatarId: "demo-presenter-nia", image: { key: poster.key } } : undefined,
      aiLabel: v.kind === "ugc",
      meta: { conceptId: cpt.id, productId: product.id, visualDirection: cpt.data.visualDirection },
    });
    const [cr] = await tx
      .insert(creatives)
      .values({ orgId, conceptId: cpt.id, kind: v.kind, name: v.concept, document: doc as unknown as Record<string, unknown>, createdAt: daysAgo(v.ageDays, 13), updatedAt: daysAgo(v.ageDays, 16) })
      .returning({ id: creatives.id });
    const creativeId = cr!.id;
    creativeIds.set(v.concept, creativeId);
    const placements = v.kind === "ugc" ? ["meta.stories.9x16", "tiktok.infeed.9x16"] : ["meta.stories.9x16"];
    const made: { variantId: string; renderId: string; placementId: string }[] = [];
    for (const id of placements) {
      const p = getPlacement(id);
      const [variant] = await tx
        .insert(variants)
        .values({ orgId, creativeId, placementId: p.id, ratio: p.ratio, width: p.width, height: p.height, durationSec: 5, createdAt: daysAgo(v.ageDays, 13) })
        .returning({ id: variants.id });
      const [render] = await tx
        .insert(renders)
        .values({
          orgId,
          variantId: variant!.id,
          status: "succeeded",
          engine: "remotion-local",
          outputKey: clip.key,
          mimeType: "video/mp4",
          fileBytes: clip.bytes,
          meta: { placementId: p.id, ratio: p.ratio, kind: v.kind, model: "kling-3.0", durationMs: 48_000, width: p.width, height: p.height, posterKey: poster.key },
          createdAt: daysAgo(v.ageDays, 16),
        })
        .returning({ id: renders.id });
      made.push({ variantId: variant!.id, renderId: render!.id, placementId: p.id });
    }
    videoVariants.set(v.concept, made);
    const rootId = randomUUID();
    const at = daysAgo(v.ageDays, 13);
    events.push(
      event({
        id: rootId,
        briefId: cpt.briefId,
        creativeId,
        capability: "video",
        provider: v.kind === "ugc" ? "heygen" : "fal",
        model: v.kind === "ugc" ? "heygen-avatar-v2" : "kling-3.0",
        status: "succeeded",
        credits: v.credits,
        costUsd: v.kind === "ugc" ? "2.400000" : "1.120000",
        durationMs: v.kind === "ugc" ? 412_000 : 236_000,
        units: v.kind === "ugc" ? "30" : "15",
        operationId: `demo:video:${creativeId}`,
        meta: { label: `${v.concept} · ${v.kind === "ugc" ? "UGC video" : "product video"}`, detail: `${placements.length} of ${placements.length} sizes ready`, step: "done", root: true, kind: v.kind },
        createdAt: at,
      }),
    );
    const steps =
      v.kind === "ugc"
        ? [
            { capability: "voice", provider: "elevenlabs", model: "eleven_multilingual_v2", label: "Voice-over", detail: "54 words", step: "voice", cost: "0.081000" },
            { capability: "presenter", provider: "heygen", model: "heygen-avatar-v2", label: "Presenter", detail: "demo-presenter-nia", step: "presenter", cost: "2.000000" },
            { capability: "image", provider: "fal", model: "nano-banana-pro", label: "B-roll 1 still", detail: cpt.data.visualDirection.slice(0, 80), step: "broll", cost: "0.150000" },
          ]
        : lines.map((_, i) => ({ capability: "video", provider: "fal", model: "kling-3.0", label: `Scene ${i + 1} clip`, detail: "3 s · Kling 3.0", step: "clips", cost: "0.280000" }));
    steps.forEach((st, i) =>
      events.push(event({ id: randomUUID(), briefId: cpt.briefId, creativeId, capability: st.capability, provider: st.provider, model: st.model, status: "succeeded", credits: 0, costUsd: st.cost, durationMs: 30_000 + i * 9_000, operationId: `demo:video:${creativeId}:${i}`, meta: { label: st.label, detail: st.detail, step: st.step }, createdAt: new Date(at.getTime() + (i + 1) * 60_000) })),
    );
    spend.push({ orgId, delta: -v.credits, reason: "generation", referenceId: rootId, meta: { creativeId, capability: v.kind }, createdAt: at });
  }

  // Older activity (before these briefs) so usage over 30 days looks lived-in.
  const r = rng(7);
  for (let i = 0; i < 46; i++) {
    const d = 2 + Math.floor(r() * 60);
    const isText = r() < 0.35;
    // The demo workspace is healthy: failures live in the sample customers (admin panel).
    const failed = false;
    const id = randomUUID();
    const credits = isText ? 1 : 2;
    events.push(
      event({
        id,
        capability: isText ? "text" : "image",
        provider: isText ? "anthropic" : "fal",
        model: isText ? "claude-opus-5" : r() < 0.5 ? "nano-banana-pro" : "seedream-4.5",
        status: failed ? "failed" : "succeeded",
        credits,
        costUsd: isText ? (0.03 + r() * 0.03).toFixed(6) : (0.06 + r() * 0.09).toFixed(6),
        durationMs: Math.round((isText ? 9_000 : 16_000) + r() * 12_000),
        error: null,
        operationId: `demo:history:${orgId}:${i}`,
        meta: { label: isText ? "Concept run" : "Static scene", detail: isText ? "8 hooks and angles" : "4:5" },
        createdAt: daysAgo(d, 9 + Math.floor(r() * 8)),
      }),
    );
    if (!failed) spend.push({ orgId, delta: -credits, reason: "generation", referenceId: id, meta: { capability: isText ? "text" : "image" }, createdAt: daysAgo(d) });
  }
  await tx.insert(generationEvents).values(events);
  await tx.insert(creditLedger).values(spend);

  // A character for the character studio.
  const nia = await assets.put("eclat-ugc-1.webp", "renders");
  const look2 = await assets.put("eclat-ugc-2.webp", "renders");
  const look3 = await assets.put("eclat-ugc-3.webp", "renders");
  await tx.insert(characters).values({
    orgId,
    brandId,
    name: "Nia",
    description: "Late-20s skincare creator, natural curls, cream knit, bright bathroom with a round mirror.",
    personality: "Warm, candid, a little funny; talks like a friend, never like an ad.",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    imageModel: "nano-banana-pro",
    portraitKey: nia.key,
    motion: { expressiveness: "medium", prompt: "Holds the bottle up to camera on the first line." },
    looks: [
      { id: "look-original", name: "Original", imageKey: nia.key, prompt: "Bathroom mirror, morning light", model: "nano-banana-pro" },
      { id: "look-vanity", name: "Vanity close-up", imageKey: look2.key, prompt: "Close-up at the vanity, soft daylight", model: "nano-banana-pro" },
      { id: "look-sofa", name: "Living room", imageKey: look3.key, prompt: "Sitting on a linen sofa, holding the serum", model: "nano-banana-pro" },
    ],
    heygen: { type: "photo", consent: "not_required" },
    status: "ready",
    createdAt: daysAgo(28),
  });

  // Review and approvals.
  const glass = creativeIds.get("Glass-skin glow")!;
  const ritual = creativeIds.get("The 30-second ritual")!;
  const dew = creativeIds.get("Dew, not grease")!;
  const ugc = creativeIds.get("Real routine, real glow")!;
  const sun = creativeIds.get("Sun that feels like nothing")!;
  await tx.insert(approvals).values([
    { orgId, creativeId: glass, status: "approved", requestedBy: jonas, decidedBy: ownerId, decidedAt: daysAgo(28), note: "Love it. Ship the 4:5 first.", createdAt: daysAgo(29), updatedAt: daysAgo(28) },
    { orgId, creativeId: ugc, status: "approved", requestedBy: priya, decidedBy: leo, decidedAt: daysAgo(25), note: null, createdAt: daysAgo(26), updatedAt: daysAgo(25) },
    { orgId, creativeId: sun, status: "approved", requestedBy: priya, decidedBy: ownerId, decidedAt: daysAgo(14), note: null, createdAt: daysAgo(15), updatedAt: daysAgo(14) },
    { orgId, creativeId: ritual, status: "in_review", requestedBy: jonas, note: "Second option for the launch set.", createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { orgId, creativeId: dew, status: "changes_requested", requestedBy: priya, decidedBy: leo, decidedAt: daysAgo(2), note: "Can we try 'Dewy, never greasy' in the brand terracotta instead of espresso?", createdAt: daysAgo(4), updatedAt: daysAgo(2) },
  ]);
  await tx.insert(comments).values([
    { orgId, creativeId: glass, authorId: jonas, authorName: "Jonas Weber", body: "Pushed the headline up a touch so it clears the Stories safe zone.", resolvedAt: daysAgo(28), createdAt: daysAgo(29, 15) },
    { orgId, creativeId: glass, authorId: ownerId, authorName: "Maya Laurent", body: "Perfect. Approving.", createdAt: daysAgo(28, 9) },
    { orgId, creativeId: ritual, authorId: priya, authorName: "Priya Shah", body: "Centered layout feels calmer, but the CTA might get lost on 9:16.", createdAt: daysAgo(3, 12) },
    { orgId, creativeId: ritual, authorId: jonas, authorName: "Jonas Weber", body: "Agreed. Bumping the CTA weight on the next pass.", createdAt: daysAgo(3, 13) },
    { orgId, creativeId: dew, authorId: leo, authorName: "Leo Martins (client)", body: "The product reads well. Copy colour feels a bit heavy.", createdAt: daysAgo(2, 10) },
    { orgId, creativeId: ugc, authorId: leo, authorName: "Leo Martins (client)", body: "This is the one. Can we get a 15 s cut for TikTok next?", createdAt: daysAgo(25, 16) },
  ]);
  await tx.insert(templates).values({
    orgId,
    brandId,
    name: "Hero — serum launch",
    kind: "static",
    document: { template: "hero", layout: { align: "left", headlineSize: 84, overlay: 0.55 } },
    isShared: true,
    createdBy: jonas,
    createdAt: daysAgo(27),
  });

  // API access (the plaintext was never kept; the key only exists to show the list).
  const { generateApiKey } = await import("./api-auth");
  const live = generateApiKey();
  const old = generateApiKey();
  await tx.insert(apiKeys).values([
    { orgId, name: "Shopify product sync", hashedKey: live.hashed, prefix: live.prefix, createdBy: ownerId, lastUsedAt: daysAgo(0, 7), createdAt: daysAgo(50) },
    { orgId, name: "Old Zapier zap", hashedKey: old.hashed, prefix: old.prefix, createdBy: jonas, lastUsedAt: daysAgo(44), revokedAt: daysAgo(40), createdAt: daysAgo(80) },
  ]);

  // Ad accounts (sandbox: nothing ever leaves the process) and draft campaigns, published after the transaction.
  const { encryptTokens } = await import("./crypto");
  const tokens = encryptTokens({ accessToken: "sandbox-demo", expiresAt: new Date(Date.now() + 3650 * DAY), scope: "sandbox" });
  const [meta] = await tx
    .insert(adAccounts)
    .values({ orgId, brandId, platform: "meta", externalId: "sandbox-meta", name: "Éclat Skin — Meta Ads", currency: "USD", timezone: "America/New_York", status: "connected", ...tokens, lastSyncedAt: daysAgo(0, 6), createdAt: daysAgo(60) })
    .returning({ id: adAccounts.id });
  const [tiktok] = await tx
    .insert(adAccounts)
    .values({ orgId, brandId, platform: "tiktok", externalId: "sandbox-tiktok", name: "Éclat Skin — TikTok", currency: "USD", timezone: "America/New_York", status: "connected", ...tokens, lastSyncedAt: daysAgo(0, 6), createdAt: daysAgo(45) })
    .returning({ id: adAccounts.id });

  const staticVariants = async (concept: string, ids: string[]) => {
    const creativeId = creativeIds.get(concept)!;
    const rows = await tx.select().from(variants).where(and(eq(variants.creativeId, creativeId), inArray(variants.placementId, ids)));
    return rows.map((v) => ({ variantId: v.id, renderId: null as string | null, placementId: v.placementId, concept }));
  };
  const plan: Array<{ name: string; account: string; platform: "meta" | "tiktok"; objective: string; mode: "active" | "paused"; budget: number; ageDays: number; ads: Array<{ variantId: string; renderId: string | null; placementId: string; concept: string }> }> = [
    { name: "Radiance Serum — Summer launch", account: meta!.id, platform: "meta", objective: "sales", mode: "active", budget: 150, ageDays: 31, ads: [...(await staticVariants("Glass-skin glow", ["meta.feed.4x5", "meta.stories.9x16"])), ...(await staticVariants("The 30-second ritual", ["meta.feed.4x5"]))] },
    { name: "Daily Glow Cream — Always-on", account: meta!.id, platform: "meta", objective: "traffic", mode: "active", budget: 80, ageDays: 30, ads: await staticVariants("Dew, not grease", ["meta.feed.4x5", "meta.feed.1x1"]) },
    { name: "Serum UGC — TikTok Spark", account: tiktok!.id, platform: "tiktok", objective: "sales", mode: "active", budget: 120, ageDays: 30, ads: (videoVariants.get("Real routine, real glow") ?? []).filter((v) => v.placementId === "tiktok.infeed.9x16").map((v) => ({ ...v, concept: "Real routine, real glow" })) },
    { name: "SPF 40 — Beach season", account: meta!.id, platform: "meta", objective: "awareness", mode: "active", budget: 60, ageDays: 16, ads: await staticVariants("Sun that feels like nothing", ["meta.feed.4x5", "meta.stories.9x16"]) },
    { name: "Lip Mask — Holiday teaser", account: meta!.id, platform: "meta", objective: "engagement", mode: "paused", budget: 40, ageDays: 6, ads: await staticVariants("Wake up to softer lips", ["meta.feed.4x5"]) },
  ];
  for (const cmp of plan) {
    const campaignId = randomUUID();
    const setId = randomUUID();
    const placements = [...new Set(cmp.ads.map((a) => a.placementId))];
    const targeting = { countries: ["US", "GB"], ageMin: 22, ageMax: 45, genders: ["female"], interests: ["Skincare", "Clean beauty", "Sephora"] };
    await tx.insert(campaigns).values({
      id: campaignId,
      orgId,
      adAccountId: cmp.account,
      name: cmp.name,
      objective: cmp.objective,
      status: "draft",
      dailyBudgetMinor: cmp.budget * 100,
      operationId: randomUUID(),
      externalId: `draft:${campaignId}`,
      platform: cmp.platform,
      raw: {
        objective: cmp.objective,
        targeting,
        placements,
        schedule: { startAt: daysAgo(cmp.ageDays).toISOString() },
        currency: "USD",
        brandId,
        extra: { brandName: "Éclat Skin" },
        publishMode: cmp.mode,
        error: null,
        log: [{ at: daysAgo(cmp.ageDays).toISOString(), message: "Draft created by Maya Laurent" }],
      },
      createdAt: daysAgo(cmp.ageDays),
    });
    await tx.insert(adSets).values({
      id: setId,
      orgId,
      campaignId,
      name: `${cmp.name} · ${placements.map((p) => getPlacement(p).label).join(" + ")}`,
      status: "draft",
      targeting,
      placements,
      dailyBudgetMinor: cmp.budget * 100,
      operationId: randomUUID(),
      externalId: `draft:${setId}`,
      platform: cmp.platform,
      raw: {},
      createdAt: daysAgo(cmp.ageDays),
    });
    for (const ad of cmp.ads) {
      const adId = randomUUID();
      const cpt = conceptIds.get(ad.concept)!;
      const name = `${ad.concept} · ${getPlacement(ad.placementId).label}`;
      // The sandbox disapproves about one ad in seven, keyed on the operation id. Pick ids so the
      // demo shows exactly one disapproval (a realistic "fix and resubmit" in Needs attention)
      // instead of a campaign that randomly never spends.
      const wantApproved = !(ad.concept === "Glass-skin glow" && ad.placementId === "meta.stories.9x16");
      const operationId = await sandboxOperationId(cmp.platform, name, wantApproved);
      await tx.insert(ads).values({
        id: adId,
        orgId,
        adSetId: setId,
        variantId: ad.variantId,
        name,
        status: "draft",
        operationId,
        externalId: `draft:${adId}`,
        platform: cmp.platform,
        // Static renders do not exist yet; finishStudio fills renderId in before publishing.
        raw: { renderId: ad.renderId ?? undefined, placementId: ad.placementId, creativeName: ad.concept, copy: { headline: cpt.data.headline, primaryText: cpt.data.primaryText, cta: cpt.data.cta, landingUrl: "https://eclat-skin.example/shop" } },
        createdAt: daysAgo(cmp.ageDays),
      });
    }
  }

  // Workspace audit trail.
  const audit = (actorId: string | null, action: string, targetType: string, targetId: string | null, d: number, meta: Record<string, unknown> = {}) => ({ orgId, actorId, action, targetType, targetId, meta, createdAt: daysAgo(d, 12) });
  await tx.insert(auditLog).values([
    audit(ownerId, "member.invited", "invite", null, 89, { email: TEAM[0]!.email, role: "editor" }),
    audit(jonas, "member.joined", "membership", jonas, 88),
    audit(ownerId, "member.invited", "invite", null, 62, { email: TEAM[1]!.email, role: "editor" }),
    audit(priya, "member.joined", "membership", priya, 61),
    audit(ownerId, "member.invited", "invite", null, 41, { email: TEAM[2]!.email, role: "viewer" }),
    audit(leo, "member.joined", "membership", leo, 40),
    audit(ownerId, "api_key.created", "api_key", null, 50, { name: "Shopify product sync" }),
    audit(jonas, "api_key.revoked", "api_key", null, 40, { name: "Old Zapier zap" }),
    audit(jonas, "approval.requested", "creative", glass, 29),
    audit(ownerId, "approval.approved", "creative", glass, 28),
    audit(jonas, "template.created", "template", null, 27, { name: "Hero — serum launch" }),
    audit(leo, "approval.approved", "creative", ugc, 25),
    audit(ownerId, "settings.guardrails", "organization", orgId, 20, { spendApprovalAbove: 250 }),
    audit(priya, "approval.approved", "creative", sun, 14),
    audit(leo, "approval.changes_requested", "creative", dew, 2, { note: "Copy colour feels a bit heavy." }),
    audit(jonas, "approval.requested", "creative", ritual, 3),
    audit(ownerId, "member.invited", "invite", null, 2, { email: `studio@northpeak-films.${DEMO_EMAIL_DOMAIN}`, role: "editor" }),
  ]);

  return orgId;
}

/** An operation id whose sandbox ad review comes back as wanted (the sandbox is pure and local). */
async function sandboxOperationId(platform: "meta" | "tiktok", name: string, approved: boolean): Promise<string> {
  const { SandboxAdsProvider } = await import("@adcraft/ads");
  const sandbox = new SandboxAdsProvider(platform);
  for (let i = 0; i < 200; i++) {
    const operationId = randomUUID();
    const created = await sandbox.createAd({ tokens: { accessToken: "sandbox" }, accountExternalId: `sandbox-${platform}`, operationId } as never, {
      status: "active",
      name,
      uploaded: { externalId: "sandbox-upload", kind: "image" },
    } as never);
    if ((created.review?.status === "approved") === approved) return operationId;
  }
  return randomUUID();
}

/**
 * The steps that run the app's own (free, local) machinery: render the static ads, publish the
 * campaigns to the sandbox platforms and pull their 30 days of sandbox numbers. Each step is
 * idempotent, so a half-finished world resumes here.
 */
async function finishStudio(orgId: string): Promise<boolean> {
  const { runRenderPipeline } = await import("@/pipelines/render");
  const { runPublishPipeline } = await import("@/pipelines/publish");
  const { runInsightsPipeline } = await import("@/pipelines/insights");

  // 1. Render every static ad at every size (satori, CPU only; skips sizes already rendered).
  const statics = await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.orgId, orgId), eq(creatives.kind, "static")));
  for (const s of statics) await runRenderPipeline({ orgId, creativeId: s.id });

  // 2. Point draft ads at their finished render, then publish (sandbox).
  const pending = await db.select().from(ads).where(and(eq(ads.orgId, orgId), like(ads.externalId, "draft:%")));
  for (const ad of pending) {
    const raw = (ad.raw ?? {}) as Record<string, unknown>;
    if (raw.renderId || !ad.variantId) continue;
    const [render] = await db
      .select({ id: renders.id })
      .from(renders)
      .where(and(eq(renders.variantId, ad.variantId), eq(renders.status, "succeeded")))
      .limit(1);
    if (render) await db.update(ads).set({ raw: { ...raw, renderId: render.id } }).where(eq(ads.id, ad.id));
  }
  const drafts = await db.select({ id: campaigns.id, createdAt: campaigns.createdAt }).from(campaigns).where(and(eq(campaigns.orgId, orgId), like(campaigns.externalId, "draft:%")));
  for (const cmp of drafts) await runPublishPipeline({ orgId, campaignId: cmp.id });
  // Publishing stamps "now"; the campaigns have been live since their creation date.
  for (const cmp of drafts) {
    await db.update(campaigns).set({ lastSyncedAt: new Date() }).where(eq(campaigns.id, cmp.id));
    await db.update(adSets).set({ createdAt: cmp.createdAt }).where(eq(adSets.campaignId, cmp.id));
  }

  // 3. Thirty days of numbers from the sandbox (synthetic, deterministic per ad).
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(metricsDaily).where(eq(metricsDaily.orgId, orgId));
  if (!n) {
    await runInsightsPipeline({ orgId });
    // An ad only spends from the day its campaign started.
    await db.execute(sql`
      delete from ${metricsDaily} m
      using ${ads} a, ${adSets} s, ${campaigns} c
      where m.ad_id = a.id and a.ad_set_id = s.id and s.campaign_id = c.id
        and m.org_id = ${orgId} and m.date < (c.created_at at time zone 'UTC')::date
    `);
    // The paused teaser has not spent since it was paused.
    await db.execute(sql`
      delete from ${metricsDaily} m
      using ${ads} a, ${adSets} s, ${campaigns} c
      where m.ad_id = a.id and a.ad_set_id = s.id and s.campaign_id = c.id
        and m.org_id = ${orgId} and c.status = 'paused' and m.date > (c.created_at at time zone 'UTC')::date + 2
    `);
  }

  // Sizes with no finished render yet.
  const [{ failedRenders }] = await db
    .select({ failedRenders: sql<number>`count(*)::int` })
    .from(variants)
    .where(and(eq(variants.orgId, orgId), sql`not exists (select 1 from ${renders} r where r.variant_id = ${variants.id} and r.status = 'succeeded')`));
  const unpublished = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.orgId, orgId), like(campaigns.externalId, "draft:%")));
  if (failedRenders || unpublished.length) {
    console.warn(`[demo] demo world incomplete: ${failedRenders} render(s) not finished, ${unpublished.length} campaign(s) not published; will retry on next start`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------
// Sample customers for the admin panel
// ---------------------------------------------------------------------------------------

type CustomerSeed = {
  name: string;
  slug: string;
  owner: string;
  team: string[];
  plan: PlanId | null;
  status: "active" | "trialing" | "past_due" | "canceled";
  ageDays: number;
  /** Generations per 30 days. */
  activity: number;
  topUps?: number;
  suspended?: boolean;
  deletionRequested?: boolean;
  note?: string;
};

const CUSTOMERS: CustomerSeed[] = [
  { name: "Northwind Coffee Roasters", slug: "demo-northwind-coffee", owner: "Hannah Cole", team: ["Marcus Bell", "Ivy Tran"], plan: "studio", status: "active", ageDays: 140, activity: 70, topUps: 2, note: "Asked about a Shopify product feed import. Pointed them at the API docs." },
  { name: "Kinfolk Running Co.", slug: "demo-kinfolk-running", owner: "Diego Alvarez", team: ["Sara Lindqvist", "Tom Becker", "Ama Owusu"], plan: "agency", status: "active", ageDays: 118, activity: 120, topUps: 3 },
  { name: "Halo Home Goods", slug: "demo-halo-home", owner: "Rachel Kim", team: ["Ben Foster"], plan: "studio", status: "active", ageDays: 77, activity: 45 },
  { name: "Brightside Pet Supply", slug: "demo-brightside-pets", owner: "Owen Price", team: [], plan: "starter", status: "active", ageDays: 52, activity: 22 },
  { name: "Juniper & Co. Creative", slug: "demo-juniper-agency", owner: "Lena Fischer", team: ["Noah Reid", "Chloe Martin", "Arjun Mehta", "Zoe Clarke"], plan: "agency", status: "active", ageDays: 101, activity: 150, topUps: 1, note: "Agency on the annual plan. Renewal call booked for next month." },
  { name: "Lumen Audio", slug: "demo-lumen-audio", owner: "Felix Wagner", team: ["Mia Rossi"], plan: "studio", status: "past_due", ageDays: 66, activity: 18 },
  { name: "Tidewater Apparel", slug: "demo-tidewater-apparel", owner: "Grace Holloway", team: [], plan: "starter", status: "trialing", ageDays: 6, activity: 8 },
  { name: "Fernhill Botanicals", slug: "demo-fernhill-botanicals", owner: "Isla Murray", team: [], plan: null, status: "trialing", ageDays: 3, activity: 4 },
  { name: "Copperline Cookware", slug: "demo-copperline-cookware", owner: "Victor Hughes", team: [], plan: "starter", status: "canceled", ageDays: 133, activity: 2, deletionRequested: true },
  { name: "Quickflip Deals", slug: "demo-quickflip-deals", owner: "Ray Dunn", team: [], plan: null, status: "trialing", ageDays: 24, activity: 3, suspended: true, note: "Suspended: repeated prohibited-claims generations (weight-loss guarantees). Owner notified." },
];

const MIX: Array<{ capability: string; provider: string; model: string; credits: number; cost: [number, number]; ms: [number, number]; weight: number }> = [
  { capability: "text", provider: "anthropic", model: "claude-opus-5", credits: 1, cost: [0.025, 0.07], ms: [7_000, 16_000], weight: 30 },
  { capability: "image", provider: "fal", model: "nano-banana-pro", credits: 2, cost: [0.12, 0.15], ms: [14_000, 26_000], weight: 28 },
  { capability: "image", provider: "fal", model: "seedream-4.5", credits: 2, cost: [0.03, 0.04], ms: [10_000, 18_000], weight: 14 },
  { capability: "image", provider: "openai", model: "gpt-image-2", credits: 3, cost: [0.17, 0.25], ms: [22_000, 40_000], weight: 8 },
  { capability: "video", provider: "fal", model: "kling-3.0", credits: 20, cost: [0.9, 1.6], ms: [150_000, 260_000], weight: 6 },
  { capability: "video", provider: "fal", model: "veo-3.1", credits: 20, cost: [1.8, 3.2], ms: [160_000, 300_000], weight: 2 },
  { capability: "presenter", provider: "heygen", model: "heygen-avatar-v2", credits: 40, cost: [1.6, 2.4], ms: [300_000, 520_000], weight: 4 },
  { capability: "voice", provider: "elevenlabs", model: "eleven_multilingual_v2", credits: 0, cost: [0.04, 0.09], ms: [3_000, 7_000], weight: 4 },
];
const ERRORS: Record<string, string[]> = {
  text: ["Anthropic: overloaded (529). The run was retried and finished.", "Brief rejected by the claims guardrail: \"guaranteed weight loss\"."],
  image: ["fal: upstream timed out after 120 s (504). No credits charged.", "Content policy: the image model declined this prompt (health claim). No credits charged."],
  video: ["fal: Kling job failed (scene 3 still was flagged). No credits charged."],
  presenter: ["HeyGen: avatar render timed out; the presenter clip was not produced."],
  voice: ["ElevenLabs: voice quota reached for this minute (429). Retried."],
};

const email = (name: string, slug: string) => `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@${slug.replace(/^demo-/, "")}.${DEMO_EMAIL_DOMAIN}`;

async function buildCustomers(tx: Tx, adminId: string, studioOrgId: string): Promise<void> {
  const r = rng(42);
  const pick = () => {
    const total = MIX.reduce((n, m) => n + m.weight, 0);
    let x = r() * total;
    for (const m of MIX) if ((x -= m.weight) < 0) return m;
    return MIX[0]!;
  };
  const adminAudit: Array<typeof auditLog.$inferInsert> = [];
  for (const [ci, cs] of CUSTOMERS.entries()) {
    const [org] = await tx
      .insert(organizations)
      .values({
        name: cs.name,
        slug: cs.slug,
        settings: { [DEMO_WORLD_FLAG]: true, ...(cs.deletionRequested ? { deletionRequestedAt: daysAgo(1).toISOString(), deletionReason: "Moving to an in-house team." } : {}) },
        suspendedAt: cs.suspended ? daysAgo(4) : null,
        createdAt: daysAgo(cs.ageDays),
      })
      .returning({ id: organizations.id });
    const orgId = org!.id;
    const ownerId = await ensureUser(tx, email(cs.owner, cs.slug), cs.owner, daysAgo(cs.ageDays));
    await tx.insert(memberships).values({ orgId, userId: ownerId, role: "owner", createdAt: daysAgo(cs.ageDays) });
    for (const [i, name] of cs.team.entries()) {
      const age = Math.max(1, cs.ageDays - 5 - i * 9);
      const id = await ensureUser(tx, email(name, cs.slug), name, daysAgo(age));
      await tx.insert(memberships).values({ orgId, userId: id, role: i === cs.team.length - 1 && i > 0 ? "viewer" : "editor", createdAt: daysAgo(age) });
    }
    const [brand] = await tx.insert(brands).values({ orgId, name: cs.name.replace(/ (Co\.|Roasters|Supply|Creative)$/, ""), createdAt: daysAgo(cs.ageDays) }).returning({ id: brands.id });
    await tx.insert(brandKits).values({ orgId, brandId: brand!.id, data: { colors: { primary: ["#1f3a5f", "#2d4a3e", "#5b2a86", "#a0522d", "#0f766e"][ci % 5]! }, fonts: { heading: "DM Sans", body: "DM Sans" } }, createdAt: daysAgo(cs.ageDays) });

    // Plan and credits.
    if (cs.plan) {
      const p = PLANS[cs.plan];
      const start = cs.status === "trialing" ? daysAgo(cs.ageDays) : daysAgo((cs.ageDays % 30) + 1);
      await tx.insert(subscriptions).values({
        orgId,
        plan: cs.plan,
        status: cs.status,
        creditsPerPeriod: p.credits,
        stripeSubscriptionId: null,
        currentPeriodStart: start,
        currentPeriodEnd: new Date(start.getTime() + 30 * DAY),
        cancelAt: cs.status === "canceled" ? daysAgo(2) : null,
        createdAt: daysAgo(cs.ageDays - 1),
      });
      const periods = cs.status === "trialing" ? 1 : Math.min(4, Math.ceil(cs.ageDays / 30));
      await tx.insert(creditLedger).values(
        Array.from({ length: periods }, (_, i) => ({ orgId, delta: p.credits, reason: "subscription_grant" as const, referenceId: `demo:${cs.slug}:grant:${i}`, meta: { plan: cs.plan }, createdAt: daysAgo(Math.max(0, cs.ageDays - 1 - i * 30)) })),
      );
    }
    await tx.insert(creditLedger).values({ orgId, delta: 10, reason: "subscription_grant", referenceId: `demo:${cs.slug}:trial`, meta: { trial: true }, createdAt: daysAgo(cs.ageDays) });
    for (let i = 0; i < (cs.topUps ?? 0); i++) {
      await tx.insert(creditLedger).values({ orgId, delta: 100, reason: "top_up", referenceId: `demo:${cs.slug}:topup:${i}`, meta: { pack: "100 credits" }, createdAt: daysAgo(3 + Math.floor(r() * 25)) });
    }

    // A project chain to hang creatives on.
    const [project] = await tx.insert(projects).values({ orgId, brandId: brand!.id, name: "Always-on", createdAt: daysAgo(cs.ageDays) }).returning({ id: projects.id });
    const [brief] = await tx
      .insert(briefs)
      .values({ orgId, projectId: project!.id, title: "Always-on creative", data: { objective: "conversion", audience: "Existing customers and lookalikes", platforms: ["meta"], formats: ["static"] }, createdAt: daysAgo(cs.ageDays) })
      .returning({ id: briefs.id });
    const [concept] = await tx
      .insert(concepts)
      .values({ orgId, briefId: brief!.id, title: "Hero offer", kind: "static", status: "selected", data: { hook: "New season, new favourites.", angle: "Offer", headline: "New season favourites", primaryText: "Fresh drops, same quality.", cta: "Shop now", visualDirection: "Clean studio product shot." }, createdAt: daysAgo(cs.ageDays) })
      .returning({ id: concepts.id });

    // Generations and spend over the last 30 days (a little older history too).
    const events: Array<typeof generationEvents.$inferInsert> = [];
    const spend: Array<typeof creditLedger.$inferInsert> = [];
    const made: Array<typeof creatives.$inferInsert> = [];
    const window = Math.min(cs.ageDays, 45);
    for (let i = 0; i < cs.activity; i++) {
      const m = pick();
      const d = r() * window;
      const failed = r() < (cs.suspended ? 0.35 : 0.02);
      const id = randomUUID();
      const at = new Date(Date.now() - d * DAY);
      events.push({
        id,
        orgId,
        userId: ownerId,
        capability: m.capability,
        provider: m.provider,
        model: m.model,
        status: failed ? "failed" : "succeeded",
        credits: m.credits,
        costUsd: (m.cost[0] + r() * (m.cost[1] - m.cost[0])).toFixed(6),
        durationMs: Math.round(m.ms[0] + r() * (m.ms[1] - m.ms[0])),
        inputTokens: m.capability === "text" ? 2_500 + Math.floor(r() * 2_500) : null,
        outputTokens: m.capability === "text" ? 1_500 + Math.floor(r() * 1_800) : null,
        error: failed ? (ERRORS[m.capability] ?? ERRORS.image!)[Math.floor(r() * (ERRORS[m.capability] ?? ERRORS.image!).length)]! : null,
        operationId: `demo:${cs.slug}:${i}`,
        meta: { label: m.capability === "text" ? "Concept run" : m.capability === "image" ? "Static scene" : m.capability === "video" ? "Product video" : m.capability === "presenter" ? "UGC presenter" : "Voice-over", detail: m.model },
        createdAt: at,
      });
      if (!failed && m.credits) spend.push({ orgId, delta: -m.credits, reason: "generation", referenceId: id, meta: { capability: m.capability, model: m.model }, createdAt: at });
      if (!failed && m.capability === "image") made.push({ orgId, conceptId: concept!.id, kind: "static", name: `Hero offer ${made.length + 1}`, document: { template: "hero", headline: "New season favourites", cta: "Shop now" }, createdAt: at, updatedAt: at });
    }
    if (events.length) await tx.insert(generationEvents).values(events);
    if (spend.length) await tx.insert(creditLedger).values(spend);
    if (made.length) await tx.insert(creatives).values(made);

    if (cs.note) await tx.insert(adminNotes).values({ orgId, authorId: adminId, body: cs.note, createdAt: daysAgo(Math.max(1, Math.floor(cs.ageDays / 3))) });
    if (cs.plan && cs.status === "active" && ci % 2 === 1) adminAudit.push({ orgId, actorId: adminId, action: "admin.credits_adjusted", targetType: "organization", targetId: orgId, meta: { delta: 50, reason: "Goodwill: failed video render" }, createdAt: daysAgo(9 + ci) });
    if (cs.suspended) adminAudit.push({ orgId, actorId: adminId, action: "admin.org_suspended", targetType: "organization", targetId: orgId, meta: { reason: "Prohibited claims" }, createdAt: daysAgo(4) });
    if (cs.plan === "agency") adminAudit.push({ orgId, actorId: adminId, action: "admin.plan_changed", targetType: "organization", targetId: orgId, meta: { from: "studio", to: "agency" }, createdAt: daysAgo(cs.ageDays - 20) });
    if (cs.note) adminAudit.push({ orgId, actorId: adminId, action: "admin.note_added", targetType: "organization", targetId: orgId, meta: {}, createdAt: daysAgo(Math.max(1, Math.floor(cs.ageDays / 3))) });
  }
  // The demo workspace itself, as the operator sees it.
  await tx.insert(adminNotes).values({ orgId: studioOrgId, authorId: adminId, body: "Upgraded to Agency after the summer launch brief. Heavy UGC user; check HeyGen headroom before Black Friday.", createdAt: daysAgo(40) });
  adminAudit.push({ orgId: studioOrgId, actorId: adminId, action: "admin.plan_changed", targetType: "organization", targetId: studioOrgId, meta: { from: "studio", to: "agency" }, createdAt: daysAgo(66) });
  await tx.insert(auditLog).values(adminAudit);

  // A few errors for Admin → Errors.
  const ids = await tx.select({ id: organizations.id, slug: organizations.slug }).from(organizations).where(like(organizations.slug, "demo-%"));
  const bySlug = new Map(ids.map((o) => [o.slug, o.id]));
  await tx.insert(errorEvents).values([
    { orgId: bySlug.get("demo-kinfolk-running") ?? null, route: "/campaigns/[campaignId]", method: "POST", path: "/campaigns/…", name: "AdsApiError", message: "Meta API: application request limit reached (#4). Retry after 5 minutes.", count: 6, lastSeenAt: daysAgo(1, 15), createdAt: daysAgo(3) },
    { orgId: bySlug.get("demo-juniper-agency") ?? null, route: "/api/uploads", method: "POST", path: "/api/uploads", name: "Error", message: "Keep the file under 600 MB.", count: 2, lastSeenAt: daysAgo(2, 11), createdAt: daysAgo(2) },
    { orgId: studioOrgId, route: "/videos/[creativeId]", method: "GET", path: "/videos/…", name: "TypeError", message: "Cannot read properties of undefined (reading 'durationSec')", count: 1, lastSeenAt: daysAgo(6, 9), createdAt: daysAgo(6) },
  ]);
}
