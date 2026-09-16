# Deploying Adcraft

Two deployables: the marketing site (`dist/`, static, already hosted) and the product (`apps/app`, Next.js).

## Product app on Vercel

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
4. Point the marketing site at the app: set `window.ADCRAFT_APP_URL` (or edit `APP_URL` in `dist/app.js`).

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
