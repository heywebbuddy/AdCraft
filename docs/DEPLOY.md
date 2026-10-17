# Deploying Adcraft

Two deployables: the marketing site (`dist/`, static, already hosted) and the product (`apps/app`, Next.js).

## Product app on Railway (current production)

Repo: https://github.com/heywebbuddy/AdCraft — Railway project **adcraft**, services **app** and **Postgres**,
app URL https://www.adcrafts.co (Railway service domain remains https://app-production-9ee2.up.railway.app).

Custom domains (DNS at onlydomains.com, NS `ns*.onlydomains.com`; record TTLs are 24 h and Railway's checker lags
~20 min after a change — `railway domain status <domain> --service app` shows what it currently sees):
- **Canonical host: `https://www.adcrafts.co`** — CNAME `www` → `qts11frr.up.railway.app` (+ TXT `_railway-verify.www`);
  live with a valid certificate. `AUTH_URL` points here, so magic links and OAuth callbacks use `www`.
- **Apex `adcrafts.co` → redirect to www** at onlydomains (URL forwarding), not a Railway domain. A CNAME at `@`
  next to SOA/NS is rejected by strict resolvers, which made Railway's check flap and the certificate never issue
  (tried 19 Sep 2026; removed). If onlydomains ever offers a real ALIAS/ANAME record, the apex can be added back
  with `railway domain adcrafts.co --service app`.

One always-on container built from the root `Dockerfile` (`railway.json` points at it): Node 22 on Debian
bookworm with the Chromium libraries Remotion needs, Chrome Headless Shell downloaded at build time, and
`scripts/start.sh` as the entrypoint — it runs `drizzle-kit migrate` against `DATABASE_URL`, then `next start`.
Background jobs run on **Inngest Cloud** (`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` on the service, app id
`adcraft`, synced by `curl -X PUT https://<domain>/api/inngest` after a deploy that changes functions — the SDK
also re-syncs itself); the hourly `insights/cron` is registered there. Video renders happen in the same container; uploads and renders live on the `/data` volume (`LOCAL_STORAGE_DIR=/data/files`) until
all four `R2_*` variables are set. The bucket `adcraft-media` (APAC, Standard) already exists; `R2_BUCKET` is set on the app
service. Create a Cloudflare **R2 Object Read & Write** API token and add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and
`R2_SECRET_ACCESS_KEY` (optional `R2_PUBLIC_BASE` for a public/CDN URL). The R2 MCP can create buckets, not tokens.

- Deploy: `railway up --service app --detach` from the repo root (the CLI is linked to the project), or
  connect the GitHub repo in the Railway dashboard (Service → Settings → Source) for deploys on push.
- Variables live on the **app** service (`railway variable list --service app`). `DATABASE_URL` is a reference
  to `${{Postgres.DATABASE_URL}}`; `AUTH_URL` is the public domain; `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY`
  were generated for production (not the local ones).
- Health check: `/api/health` (Railway waits up to 300 s for it after each deploy).
- Still to do by hand: R2 API token keys (see above), a Stripe webhook endpoint for
  `https://<domain>/api/stripe/webhook` (then set `STRIPE_WEBHOOK_SECRET`) when paid billing goes live,
  the Railway domain in Google's OAuth redirect list if Google sign-in is wanted (`AUTH_GOOGLE_ID/SECRET`),
  Meta (`META_APP_ID` / `META_APP_SECRET`) and Google Ads (`GOOGLE_ADS_*`) plus the OAuth redirects
  `https://www.adcrafts.co/api/connect/meta/callback` and `https://www.adcrafts.co/api/connect/google/callback`.
  Stripe is left as-is for now.
- Public legal pages: `/privacy`, `/terms`, `/dpa`. Owners request workspace deletion under Settings → Privacy.

## Product app on Vercel (alternative)

1. Push the repo to GitHub and import it in Vercel. Set **Root Directory** to `apps/app` and enable
   "Include source files outside of the Root Directory" (the monorepo packages live in `packages/`).
   `apps/app/vercel.json` carries the install and build commands.
2. Environment variables (Production and Preview):
   - Required: `DATABASE_URL` (Neon or Supabase Postgres), `AUTH_SECRET`, `AUTH_URL` (the deployed origin), `ANTHROPIC_API_KEY`, `FAL_KEY`
   - Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`
   - Jobs: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (create an Inngest app pointed at `/api/inngest`)
   - Email: `RESEND_API_KEY`, `EMAIL_FROM`; Google sign-in: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - Billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
   - Video/UGC: `ELEVENLABS_API_KEY`, `HEYGEN_API_KEY`
   - Ads (leave unset to keep sandbox providers): `META_*`, `TIKTOK_*`, `GOOGLE_ADS_*`, `TOKEN_ENCRYPTION_KEY`
3. Run migrations once against the production database: `DATABASE_URL=… pnpm --filter @adcraft/db db:migrate`.
4. The app serves the marketing site itself at `/`, `/showcase` and `/pricing` (copied from `dist/` on every build). If you keep `dist/` on its own static host too, set `window.ADCRAFT_APP_URL` there so its buttons point at the app.

## What does not run on Vercel functions

- **Video assembly** uses Remotion with a headless Chromium. That does not fit a serverless function.
  Options, in order of effort: a small always-on worker (Fly.io or Railway) that runs the Inngest
  functions for `video/generate` and `ugc/generate`, or Remotion Lambda (`LambdaVideoRenderer` stub in
  `packages/render/src/video/render.ts`).
- **Long generations** must go through Inngest in production (set the two Inngest keys). The inline
  job mode is for local development only; a Vercel request would time out on a video job.
- Static rendering (Satori + resvg) and image generation run fine in functions.

## Database

- Local: Docker `adcraft-postgres` on port 5433 (`docker start adcraft-postgres` after a reboot), or the
  embedded PGlite when `DATABASE_URL` is empty.
- Production: Neon or Supabase. Enable connection pooling and use the pooled URL.

## Platform developer applications (file before Release 4 goes live)

- Meta: business verification, app review for `ads_management`, `ads_read`, `business_management`.
- TikTok: Marketing API app with campaign management and reporting scopes.
- Google Ads: developer token and Basic access; needs a working UI and design doc.

## Local development with the real services

- **Inngest**: `.env` sets `INNGEST_DEV=1` so events go to the Inngest Dev Server instead of Inngest Cloud
  (Cloud cannot reach localhost). Run it with `pnpm inngest` (or the "inngest" launch config) next to the app;
  the dashboard is at http://localhost:8288. Remove `INNGEST_DEV` in production.
- **Stripe**: prices live in the test account (`STRIPE_PRICE_*` in `.env`, products carry tax code
  `txcd_10103001` because Managed Payments is on by default). Webhooks reach localhost through
  `stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:3000/api/stripe/webhook`; its `whsec_…`
  is `STRIPE_WEBHOOK_SECRET`. Recreate the prices in live mode before launch.
- **Resend**: `EMAIL_FROM` must use a domain verified in Resend. The dev sign-in stays available outside
  production alongside magic links (`DEV_LOGIN=0` hides it).

## Smoke suite (Playwright)

`pnpm --filter @adcraft/app e2e` runs the golden path against a running dev server (`BASE_URL`, default localhost:3000): sign-in → dashboard → library → brief pre-fill → creative Next panel → five-step campaign builder publishing paused on a sandbox account → performance sync → guardrails → `/api/health`. It spends no provider money (no concept/image generation) and skips politely when the brand has no products or finished creatives. Needs `DEV_LOGIN` on and `E2E_EMAIL` (default `ratnesh@adcraft.local`). Run it before every deploy; archive the `E2E …` campaigns it leaves behind if you run it against a shared database.

## Operations

- **Health**: `GET /api/health` → 200 when database and storage answer (503 otherwise); includes per-check latency.
- **Errors**: unhandled server errors are logged with route and digest; set `SENTRY_DSN` to also post them as Sentry events (no SDK).
- **Storage**: R2 bucket `adcraft-media` (`R2_*` on the service) since 19 Sep 2026. Files written to disk before that were copied in with `scripts/migrate-storage-to-r2.mjs` (run it inside the container: `railway ssh --service app -- sh -c 'cd /app && node scripts/migrate-storage-to-r2.mjs /data/files'`); it skips objects already present, so it is safe to re-run.
- **Backups**: `DATABASE_URL=… ./scripts/backup-db.sh` (cron nightly) — gzip `pg_dump`, 14-day retention, optional upload to `R2_BACKUP_BUCKET`.
- **Guardrails**: platform defaults in `platform_settings.guardrails` (monthly provider budget per workspace, spend-approval threshold, HeyGen voice slots, rate limit); per-workspace overrides under Settings → Guardrails.

## Read-only public demo (`DEMO_MODE`)

`DEMO_MODE=true` (off by default) turns on a public, read-only demo on the same install as real customers.

**What visitors get.** The sign-in page shows two doors. "Explore the ad studio" signs the visitor into `demo-studio@demo.invalid`, owner of the *Éclat Skin Co.* workspace (Agency plan, a few thousand credits). "Explore the admin panel" signs them into `demo-admin@demo.invalid`, a platform admin while `DEMO_MODE` is on, whatever `ADMIN_EMAILS` says. One click, no password, no email: the sign-in goes through a server-side `demo` credentials provider that picks the account by door name. A slim strip across the studio and the admin says "You're exploring a read-only demo · Start your own workspace".

**The demo world** is built once, at startup (`instrumentation.ts`), or on the first door click (`server/demo-seed.ts`, idempotent; found by the slug `demo-eclat-skin`). It costs nothing to build: product photos and the UGC and product videos are files the repo ships (`dist/assets/ads`, copied to `public/assets/ads` at build), the finished static ads are rendered by the app's own local Satori renderer, and the campaigns are published to the built-in sandbox ad platforms (`sandbox-…` accounts never leave the process) with 30 days of the sandbox's synthetic numbers. It also creates ten sample customer workspaces (subscriptions, credits, usage, failures, notes, audit entries) so the admin panel looks like a healthy install. Every demo-world address is on the reserved `demo.invalid` domain; every demo-world workspace carries `settings.demoWorld = true`.

**Read-only, on the server.** `requireViewer`, `requireOrg` and `requireAdmin` (`server/org.ts`, `server/admin.ts`) refuse a demo-world account whenever the request is not a page render, i.e. inside any Server Action, Route Handler or `after()` callback (`server/demo.ts`). This is deny-by-default: a new action is covered as soon as it asks who the viewer is. A handful of read-only actions (activity tray poll, voice and presenter pickers, CSV and ZIP downloads) opt out with `readOrg()`; `apps/app/tests/demo.test.ts` pins that list. On top of that:

- `dispatch()` (`server/jobs.ts`), the entry to every paid pipeline (AI text, image, video, voice, presenter, Remotion renders, ad publishing), refuses demo-world workspaces whoever asks; the hourly insights cron skips them.
- Route handlers that write (`/api/uploads`, `/api/connect/*`) return 403 or redirect with the demo message.
- No email is ever sent to a `.invalid` address; share-link comments and approvals on demo workspaces are refused.
- Sign-in for any `demo.invalid` address is refused on every other provider (magic link, Google, dev sign-in), and entirely when `DEMO_MODE` is off. A demo session that outlives the flag is signed out on its next request, and the demo admin loses admin rights.
- Refusals carry the digest `ADCRAFT_DEMO_READ_ONLY`: the error page shows "This is a shared demo — changes are switched off." and they are not written to Admin → Errors.

**The admin panel is scoped.** The demo admin sees the demo world only: no real customer's workspace, email, usage, money or files, no view-as-support, no names of real admins, no bucket name, no detailed health errors. A real admin on a `DEMO_MODE` install sees everything *except* the demo world, so the sample customers never inflate real MRR, sign-ups or usage.

**Turning it on (live site).** Set `DEMO_MODE=true` on the service and redeploy. Nothing else is required: `AUTH_SECRET` (already set) encrypts the sandbox ad-account tokens, storage (R2 or the `/data` volume) receives about 25 MB of demo images, renders and videos once. Keep `STRIPE_*`, provider keys and `ADMIN_EMAILS` as they are; real customers keep using them. To remove the demo later, set `DEMO_MODE` back to off (doors disappear, demo sessions are signed out) and, if wanted, delete the workspaces whose slug starts with `demo-` and the users on `demo.invalid`.

