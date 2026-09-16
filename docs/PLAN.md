# Adcraft — Product & Engineering Plan

Status: v1.2 · 2026-09-17 · Owner: Ratnesh

> **Build status (17 Sep 2026):** all four releases are implemented in the monorepo and run end to end locally with sandbox providers wherever an API key is missing. See section 13 for what remains before go-live.

Adcraft is a SaaS where a brand uploads its product, gets ad creative in every format (static, carousel, product video, UGC-style video), publishes it straight to Meta, Instagram, TikTok, Google and YouTube, and tracks what wins. This document is the plan to get from the current marketing site to a fully working product.

---

## 1. Where we are

| Area | Today |
|---|---|
| Marketing site | Buildless static site in `dist/` (home, showcase, pricing). Sample creative is hard-coded; workflow canvas is a fake three-step demo. |
| Product | None. No auth, no backend, no generation, no ad platform connections. |
| Pricing | Illustrative tiers: Starter $29, Studio $79, Agency $199 per month. Credits undefined. |
| Brand | Paper `#f8f7f3`, ink `#242521`, orange `#e65c32`, DM Sans + Instrument Serif. |

The site stays as the marketing front door. The app is built as a separate application under `app.adcraft.*` and the site's CTAs point to it.

## 2. What we are building

### Users

- **Founder / small DTC brand** who has product photos and no design team. Wants ads live this week.
- **Performance marketer** at a growing brand. Wants volume: 20 variations, resized for every placement, and a read on what works.
- **Small agency** running several clients. Wants brand workspaces, client review and one dashboard.

### The core loop

1. **Brand kit** — product images, logo, colours, tone, target customer, offers. Set once.
2. **Brief** — "Launch the Everyday Serum for Q4, target women 25-40, angle: morning routine."
3. **Concepts** — Adcraft proposes hooks, angles and scripts, each mapped to a format and platform.
4. **Generate** — static ads, carousels, product videos, UGC-style videos, in every required aspect ratio.
5. **Review** — edit copy, swap images, regenerate a scene, approve.
6. **Publish** — pick ad account, campaign, audience, budget; push to Meta / TikTok / Google.
7. **Track** — spend, impressions, CTR, CPA, ROAS per creative; "make more like the winner" feeds back into step 3.

### Formats by platform

| Format | Meta / Instagram | TikTok | Google | YouTube |
|---|---|---|---|---|
| Static image (1:1, 4:5, 9:16) | Feed, Stories, Reels cover | In-feed image | Demand Gen, Display | — |
| Carousel | Feed | — | Demand Gen | — |
| Product video (9:16, 1:1, 16:9) | Reels, Stories, Feed | In-feed | Demand Gen | In-stream, Shorts |
| UGC-style video (9:16) | Reels, Stories | In-feed (primary) | — | Shorts |
| Copy (headline, primary text, CTA) | Yes | Yes | RSA / Demand Gen | Yes |

Platform specs (max lengths, safe zones, file limits) live in one `specs` table and drive both the renderer and the pre-publish validator.

## 3. Product scope by release

### Release 1 — Creative Studio (weeks 1–8)

Ship a product people pay for before any ad platform work.

- Auth, organisations, brand workspaces, roles (owner, editor, viewer).
- Brand kit: logo, colours, fonts, tone, product library with automatic background removal.
- Brief → concept generation (hooks, angles, copy, scripts) with Claude.
- Static ad generation: AI background/scene + layered template (headline, product cutout, CTA, logo). Output PNG/JPG in 1:1, 4:5, 9:16, 16:9.
- Carousel builder (2–10 cards).
- Editor: change copy, swap background, move elements, regenerate a single layer.
- Export and download, brand-level asset library.
- Credits, Stripe subscriptions, usage metering.
- Replace the fake workflow canvas on the marketing site with real screenshots and a signup CTA.

### Release 2 — Video & UGC (weeks 9–16)

- Script → storyboard → scenes. Each scene is an image-to-video clip generated from the product cutout.
- Video assembly: scenes, captions, music, logo end-card, rendered server-side with Remotion + ffmpeg.
- UGC-style videos: AI presenter (licensed avatar provider) with voice-over, product B-roll, on-screen hooks and captions. Clear AI-generated labelling to meet platform rules.
- Auto-resize video to 9:16, 1:1, 16:9 with safe-zone aware reframing.
- Review comments and approvals (Studio tier and up).

### Release 3 — Team, agency & scale (weeks 17–22)

- Review comments and approvals, client review workspaces with share links.
- Shared templates and brand kits across workspaces.
- Team seats, audit log, priority generation queue for Agency tier.
- Bulk generation: one brief → N variations across formats, sizes and models.
- Public API and Zapier-style webhooks for exporting creative.

### Release 4 — Connect, Publish & Track (weeks 23–34, final phase)

All social and ad platform integration lands here, after the creative product is proven.

- Connect ad accounts via OAuth: Meta (covers Instagram), TikTok, Google Ads (covers YouTube).
- Campaign builder: objective, audience, placements, budget, schedule, creative assignment. One Adcraft form mapped to each platform's native objects.
- Policy pre-check: text length, safe zones, restricted claims, AI content disclosure. Hard failures block publish, soft ones warn.
- Publish as paused or active; store platform IDs for every object we create; sync status and platform review outcomes back.
- Hourly insights sync: spend, impressions, clicks, CTR, CPM, CPC, conversions, CPA, ROAS, video views, thumb-stop rate.
- Dashboards at account, campaign and creative level. Creative is the primary unit; every ad rolls up to the Adcraft creative it came from.
- Alerts for creative fatigue, overspend and disapprovals. "Make more like this" feeds winning attributes back into concept generation.
- Reports export (CSV, PDF), scheduled email digest.

Until Release 4 ships, users download or export creative and upload it to the platforms themselves. The export flow includes per-platform spec checks so files are accepted first time.

## 4. Architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router), TypeScript, Tailwind + the Adcraft tokens | One codebase for app + API routes, strong hosting story on Vercel |
| API | Next.js route handlers + tRPC (or Hono if we split later) | Type-safe end to end |
| Database | Postgres (Neon or Supabase) with Drizzle ORM | Relational data with tenants, campaigns, metrics |
| Auth | Auth.js (email magic link + Google OAuth) with our own organisations and memberships tables | No per-user vendor cost; org model owned in our schema |
| Jobs | Inngest (or Trigger.dev) | Durable, retriable, step-based workflows for generation and sync |
| Storage / CDN | Cloudflare R2 + Cloudflare Images | Cheap egress for media |
| Video rendering | Remotion on Lambda + ffmpeg | Programmatic video from React components, scales to zero |
| Billing | Stripe Billing + metered usage | Subscriptions and credit top-ups |
| Analytics DB | Postgres partitioned `metrics_daily` first; ClickHouse later if needed | Keep one DB until scale forces a split |
| Observability | Sentry, OpenTelemetry, PostHog | Errors, traces, product analytics |

### AI providers

| Task | Provider | Notes |
|---|---|---|
| Concepts, copy, scripts, policy review, brief parsing | Claude Opus 5 (`claude-opus-5`), Claude Haiku 4.5 for cheap bulk variations | Structured outputs for every generation so the app gets typed JSON. Prompt caching on the brand kit. |
| Image generation with product fidelity | Nano Banana Pro (default), Seedream 4.5, Flux 2 Max — via fal.ai or vendor APIs | User-selectable in the studio. Product cutout is passed as a reference image so the product is not hallucinated. Nano Banana Pro for text-in-image and product edits; Seedream 4.5 for photoreal lifestyle scenes; Flux 2 Max for stylised backgrounds. |
| Background removal, upscaling | fal.ai / Replicate models | Commodity |
| Image-to-video and text-to-video | Kling 3.0 (default), Veo 3.1, Seedance 2.5, Seedance 2.0 — via fal.ai or vendor APIs | User-selectable in the studio. Abstracted behind one `VideoProvider` interface; each provider declares supported durations, ratios, audio and cost per second. Seedance 2.0 kept as the low-cost draft option. |
| UGC presenter | HeyGen or Hedra API | Licensed stock avatars only; users can upload their own with consent |
| Voice | ElevenLabs | Voice cloning only with explicit consent flow |
| Music | Licensed library (e.g. Epidemic Sound API) or generated | Rights must cover paid ads |

All providers sit behind `packages/ai` with a single interface per capability. The studio shows a model picker (Video: Kling 3.0, Veo 3.1, Seedance 2.5, Seedance 2.0; Image: Nano Banana Pro, Seedream 4.5, Flux 2 Max) with a sensible default per task, and credits are priced per model. Every call records cost in a `generation_events` table so credits and gross margin are exact.

### Static ad rendering

Static ads are not raw AI images. They are layered documents: an AI-generated scene layer plus text, product cutout, logo and CTA layers rendered by our own template engine (React → Satori/Playwright → PNG). This gives correct typography, editable text, exact brand colours and free resizing. AI is used where it is good (scenes, backgrounds, styles) and not where it is weak (small text, logos).

### Ad platform integration layer

```
packages/ads/
  types.ts          // Campaign, AdSet, Ad, Creative, Metrics — one normalised model
  provider.ts       // interface AdsProvider { connect, listAccounts, createCampaign, createAdSet,
                    //   uploadCreative, createAd, setStatus, fetchInsights, validate }
  meta/             // Marketing API v21+: campaigns, ad sets, ad creatives, insights
  tiktok/           // Marketing API: campaigns, ad groups, ads, video upload, reports
  google/           // Google Ads API: campaigns, ad groups, assets, Demand Gen, reports
```

Rules:

- Every platform object we create stores `external_id`, `platform`, `raw` payload and `last_synced_at`.
- Writes are idempotent jobs with an `operation_id`; retries never duplicate campaigns.
- Insights sync is an hourly job per connected account, backfilling 7 days on first connect.
- Tokens are encrypted at rest (KMS) and refreshed by a scheduled job before expiry.

### Data model (core)

```
organizations ─┬─ memberships ─ users
               ├─ subscriptions, credit_ledger
               └─ brands ─┬─ brand_kits, products (assets)
                          ├─ projects ─ briefs ─ concepts
                          │                   └─ creatives ─ variants (format × ratio) ─ renders
                          ├─ ad_accounts (platform, tokens, status)
                          │     └─ campaigns ─ ad_sets ─ ads (→ variant)
                          └─ metrics_daily (ad_id, date, spend, impressions, clicks, conv, ...)
generation_events (provider, model, cost_usd, credits, duration, status)
```

### Generation pipeline (job graph)

```
brief.submitted
  → concepts.generate (Claude, structured output)          ~10 s
  → for each selected concept:
      static:  scene.generate → template.compose → render.sizes → variant.ready
      video:   script.generate → storyboard → scene.image × N → scene.video × N
               → assemble (Remotion) → resize → variant.ready
      ugc:     script.generate → presenter.generate → broll.generate → assemble → variant.ready
  → publish.requested → validate → upload creative → create objects → sync status
```

Each arrow is an Inngest step: retried, resumable, and visible in the UI as progress.

## 5. Credits and pricing

Map plans to credits so gross margin is protected. Working assumptions (validate with real provider costs in week 2):

| Action | Credits | Approx. cost to us |
|---|---|---|
| Concept set (10 hooks + copy) | 1 | $0.05 |
| Static ad, all sizes | 2 | $0.10–0.20 |
| Product video, 15 s | 20 | $1.50–3.00 |
| UGC video, 30 s with presenter | 40 | $3.00–6.00 |
| Resize existing creative | 0 | render only |

| Plan | Price | Credits / month | Brands | Extras |
|---|---|---|---|---|
| Starter | $29 | 150 | 1 | 2 ad accounts |
| Studio | $79 | 500 | 3 | Team review, 5 ad accounts, video priority |
| Agency | $199 | 1,500 | 10 | Client workspaces, shared kits, priority queue |
| Top-ups | $10 / 100 credits | — | — | — |

Ad spend is always billed by the platform directly to the customer's own ad account. Adcraft never touches media budgets in v1.

## 6. Compliance and platform approvals

Submit applications by week 14 so approvals land before Release 4 starts in week 23. They cost nothing to file early.

| Platform | What is needed | Lead time |
|---|---|---|
| Meta Marketing API | Business verification, app review for `ads_management`, `ads_read`, `business_management`; Advanced Access | 2–6 weeks |
| TikTok Marketing API | Developer app, approval for campaign management and reporting scopes | 2–4 weeks |
| Google Ads API | Developer token; Basic access application needs a working UI and design doc | 2–6 weeks |

Other obligations:

- AI-generated content disclosure where required (Meta, TikTok labels for realistic AI people).
- Presenter and voice: licensed avatars only, consent capture for custom likeness, no real-person impersonation.
- Ad policy pre-check for restricted categories (health claims, finance, alcohol).
- GDPR/CCPA: data processing agreement, deletion flow, EU region option for storage.
- SOC 2 readiness later; encrypt tokens now.

## 7. Repository layout (monorepo)

```
adcraft/
  apps/
    web/          # marketing site (current dist/ moved here, or kept static)
    app/          # Next.js product
  packages/
    ai/           # provider adapters: text, image, video, voice, presenter
    ads/          # Meta, TikTok, Google adapters + normalised model
    render/       # static templates (React → PNG), Remotion compositions
    db/           # Drizzle schema, migrations
    ui/           # Adcraft design tokens + components
    specs/        # platform placement specs
  infra/          # Vercel, Inngest, R2, Remotion Lambda config
```

## 8. Milestones

| Week | Milestone | Demo |
|---|---|---|
| 2 | Foundations | Sign up with Auth.js, create brand, upload product with background removed, Stripe test subscription |
| 4 | Concepts + static v1 | Brief → 10 concepts → 3 static ads in 4 sizes with Nano Banana Pro |
| 6 | Editor + carousel | Edit copy and layers, carousel export, asset library |
| 8 | **Release 1 launch** | Paid beta with 20 brands, marketing site updated |
| 12 | Product video | Script → storyboard → 15 s video in 3 ratios with Kling 3.0 |
| 14 | API applications filed | Meta, TikTok, Google Ads developer applications submitted |
| 16 | **Release 2** | UGC video with presenter, model picker across all seven models |
| 20 | Collaboration | Approvals, client workspaces, shared kits |
| 22 | **Release 3** | Bulk generation, public API, Agency tier complete |
| 26 | Meta connect | OAuth, publish a paused campaign to a sandbox account |
| 30 | All platforms publish | Meta + TikTok + Google with policy pre-check |
| 34 | **Release 4** | Full loop: brief → publish → track → "more like this" |

## 9. Team and cost

- 1 full-stack lead (you) + Claude Code, plus 1 designer part-time from week 4 and 1 backend/integrations engineer from week 20 for the ads APIs. Two people can hit the dates; one person adds ~40%.
- Infra at beta scale: ~$300–600 / month (Vercel, Neon, R2, Inngest, Remotion Lambda). Generation cost scales with credits and is covered by pricing above.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Ad API approvals slip | File by week 14; build against sandbox accounts; Releases 1–3 do not depend on them |
| Video quality inconsistent across providers | Provider interface + eval set of 30 products across Kling 3.0, Veo 3.1 and Seedance 2.5; pick per-use-case defaults; show users 2 takes |
| Generation cost erodes margin | Credits tied to measured cost; caching; Haiku for bulk variations; hard monthly caps |
| Product looks wrong in AI scenes | Reference-image models plus product cutout composited as a layer, never repainted |
| Platform policy rejections | Validator built from the specs table; surface platform review results in-app |
| Deepfake / likeness misuse | Stock avatars by default; consent flow with verification for custom likeness |

## 11. Decisions (confirmed 2026-09-17)

1. **Stack:** Next.js + Postgres (Drizzle) + Inngest + Remotion. Confirmed.
2. **Auth:** Auth.js with our own organisations model. Confirmed.
3. **Default models:** Kling 3.0 for video, Nano Banana Pro for image; all seven models available in the picker. Confirmed.
4. **Sequencing:** all social and ad platform integration (connect, publish, track) is the final phase, Release 4. Confirmed.
5. **Open:** who owns the Meta, TikTok and Google developer applications (needs a verified business). Decide before week 14.

## 12. Immediate next steps (week 1)

- Create the monorepo, move the marketing site to `apps/web`, scaffold `apps/app`.
- Set up Postgres, brand workspaces, Stripe skeleton.
- Set up Auth.js (magic link + Google) with organisations, memberships and roles in Drizzle.
- Build the `packages/ai` interfaces and the first Claude concept generator with structured outputs.
- Run a provider bake-off: 10 real product photos → static scenes with Nano Banana Pro, Seedream 4.5 and Flux 2 Max, and 5 s clips with Kling 3.0, Veo 3.1, Seedance 2.5 and Seedance 2.0; record cost and quality.

## 13. What remains before go-live (as of 17 Sep 2026)

Everything below is wiring and verification, not new product surface.

| Area | Status | To do |
|---|---|---|
| Concepts (Claude Opus 5) | Built, sample mode without key | Add `ANTHROPIC_API_KEY`; review prompt output on 10 real briefs |
| Image scenes and cutouts (fal.ai) | Built, gradient placeholder without key | Add `FAL_KEY`; verify the three endpoint ids and per-image costs; tune prompts per model |
| Video (Kling / Veo / Seedance) | Built, Ken Burns fallback without key | Verify fal endpoint ids for Seedance 2.x; measure cost per second; Remotion Lambda for scale |
| UGC (HeyGen + ElevenLabs) | Built, presenter card fallback | Add keys; refresh stock avatar and voice ids; consent flow for custom likeness |
| Ad platforms | Built against documented APIs, sandbox without keys | File Meta / TikTok / Google developer apps; test each adapter against a real sandbox account; AI-disclosure fields |
| Billing | Built | Create Stripe products and set `STRIPE_PRICE_*`; test webhook with the Stripe CLI |
| Email | Built | `RESEND_API_KEY` for magic links and invites |
| Database | PGlite locally, Postgres via `DATABASE_URL` | Provision Neon/Supabase; run `db:migrate` |
| Storage | Local disk locally, R2 via env | Create the R2 bucket and public base |
| Jobs | Inline locally, Inngest via env | Create the Inngest app; hourly insights cron is registered |
| Hosting | Not deployed | Vercel for the app; keep `dist/` on its current static host; set `ADCRAFT_APP_URL` on the site |
| Compliance | Not started | Privacy policy, terms, DPA, data deletion flow |
