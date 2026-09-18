# Deploying Adcraft

Two deployables: the marketing site (`dist/`, static, already hosted) and the product (`apps/app`, Next.js).

## Product app on Railway (current production)

Repo: https://github.com/heywebbuddy/AdCraft — Railway project **adcraft**, services **app** and **Postgres**,
app URL https://app-production-9ee2.up.railway.app.

One always-on container built from the root `Dockerfile` (`railway.json` points at it): Node 22 on Debian
bookworm with the Chromium libraries Remotion needs, Chrome Headless Shell downloaded at build time, and
`scripts/start.sh` as the entrypoint — it runs `drizzle-kit migrate` against `DATABASE_URL`, then `next start`.
Background jobs run on **Inngest Cloud** (`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` on the service, app id
`adcraft`, synced by `curl -X PUT https://<domain>/api/inngest` after a deploy that changes functions — the SDK
also re-syncs itself); the hourly `insights/cron` is registered there. Video renders happen in the same container; uploads and renders live on the `/data` volume (`LOCAL_STORAGE_DIR=/data/files`) until
the `R2_*` variables are set.

- Deploy: `railway up --service app --detach` from the repo root (the CLI is linked to the project), or
  connect the GitHub repo in the Railway dashboard (Service → Settings → Source) for deploys on push.
- Variables live on the **app** service (`railway variable list --service app`). `DATABASE_URL` is a reference
  to `${{Postgres.DATABASE_URL}}`; `AUTH_URL` is the public domain; `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY`
  were generated for production (not the local ones).
- Health check: `/api/health` (Railway waits up to 300 s for it after each deploy).
- Still to do by hand: a Stripe webhook endpoint for `https://<domain>/api/stripe/webhook` (then set
  `STRIPE_WEBHOOK_SECRET`), the Railway domain in Google's OAuth redirect list if Google sign-in is wanted
  (`AUTH_GOOGLE_ID/SECRET`), and R2 credentials for durable media once traffic is real.

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
- **Backups**: `DATABASE_URL=… ./scripts/backup-db.sh` (cron nightly) — gzip `pg_dump`, 14-day retention, optional upload to `R2_BACKUP_BUCKET`.
- **Guardrails**: platform defaults in `platform_settings.guardrails` (monthly provider budget per workspace, spend-approval threshold, HeyGen voice slots, rate limit); per-workspace overrides under Settings → Guardrails.
