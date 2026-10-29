# Deploying Adcraft

Adcraft is one Next.js application plus a PostgreSQL database and a place to keep files.
It needs a **persistent Node process**, not a serverless function: video rendering, the
inline job runtime and the screenshot browser all need a long-lived process, a writable
temporary directory and more than a few seconds of wall clock.

Hosts that work: any container host (Railway, Render, Fly, Koyeb, AWS App Runner, Google
Cloud Run with a minimum instance, a plain VPS with Docker). Hosts that do not: shared
PHP hosting, cPanel, and pure-serverless platforms.

## 1. Build the image

A production `Dockerfile` is in the project root. It installs dependencies, builds the
application, creates an unprivileged user, applies database migrations at boot and serves
on `$PORT`.

```bash
docker build -t adcraft .
docker run -p 3000:3000 --env-file .env adcraft
```

## 2. Provision PostgreSQL

Version 15 or newer; 18 is what the included `pg_dump` client matches. Set `DATABASE_URL`.
Migrations run automatically on startup — to apply them by hand:

```bash
pnpm --filter @adcraft/db db:migrate
```

## 3. Set the environment

Minimum for a working production install:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | your public address, e.g. `https://ads.example.com` |
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_EMAILS` | your address, comma-separated for more |
| `DEV_LOGIN` | `0` — hides the development sign-in box |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes; defaults to a key derived from `AUTH_SECRET` |

`.env.example` documents the available settings. Configure Resend or Google sign-in
before production use: development sign-in is disabled in production. Add provider keys
for live generation and catalog features; supported paths provide samples without keys.

## 4. Attach durable storage

Generated images and video must outlive a deploy.

- **Object storage (recommended):** set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`. Cloudflare R2, or any S3-compatible bucket.
- **Mounted volume:** mount a disk and point `LOCAL_STORAGE_DIR` at it (the Dockerfile
  defaults to `/data/files`).

A container's own filesystem is wiped on every deploy. Without one of the two, every
generated asset disappears when you redeploy.

## 5. Background jobs

Leave `INNGEST_*` blank and the pipelines run inline in the web process — simplest, and
fine for a small installation.

For retries, concurrency control, a dashboard and the hourly insights sync, create an
Inngest Cloud app, point it at `https://your-domain.com/api/inngest`, and set
`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.

## 6. Custom domain

Point your domain at the host, set `AUTH_URL` to match, and redeploy. `AUTH_URL` must be
the address users actually visit, or sign-in links and OAuth callbacks will not return to
the right place.

## 7. Platform developer applications

Each ad platform needs an application of your own before it can serve anyone but you.
Set each one's OAuth redirect to:

```
https://your-domain.com/api/connect/meta/callback
https://your-domain.com/api/connect/tiktok/callback
https://your-domain.com/api/connect/google/callback
```

Meta, TikTok and Google each review an application before it leaves development mode.
Until then, those platforms run in sandbox for everyone except your own ad accounts.

## 8. Billing

Create your Stripe products, recurring prices and top-up in your own account. Set
plan and credits metadata to match `apps/app/src/server/billing.ts`, then copy the
price IDs into the corresponding `STRIPE_PRICE_*` environment variables. Add the
`/api/stripe/webhook` endpoint and signing secret. The complete steps and required
events are in the [buyer guide](index.html#billing). Test billing in Stripe test mode.

## Operations

**Health.** `GET /api/health` reports the database, storage and job runtime with latency,
and returns 503 when the database or storage is failing. Point your uptime monitor at it.
Detail is hidden from anyone who is not a platform admin.

**Errors.** Unhandled server errors are recorded with route, message, stack and release,
repeats collapsed into a count, 14-day retention, listed at **Admin → Errors**. Set
`SENTRY_DSN` to mirror them to Sentry.

**Backups.** A nightly job (03:15 UTC) dumps the database, gzips it and writes it to your
bucket under `db/`, pruning past `BACKUP_RETENTION_DAYS` (14). It needs a `pg_dump` whose
major version matches the server; the Dockerfile installs the PostgreSQL 18 client.
Restore with:

```bash
gunzip -c adcraft-<timestamp>.sql.gz | psql "$DATABASE_URL"
```

**Smoke suite.** `pnpm --filter @adcraft/app e2e` runs the golden path against a running
server (`BASE_URL`, default `http://localhost:3000`): sign-in → dashboard → library →
brief pre-fill → creative panel → the five-step campaign builder publishing paused on a
sandbox account → performance sync → guardrails → `/api/health`. It spends no provider
money and skips politely when the brand has no products or finished creatives. Needs
`DEV_LOGIN` on and `E2E_EMAIL` set to an existing user. Run it before every deploy.

## What does not run on serverless functions

- **Video rendering** — minutes long, needs a headless browser and ~2 GB.
- **Website import screenshots** — spawns a headless browser.
- **Inline job mode** — without Inngest, pipelines run in the request process and outlive
  the response.

If you deploy the web tier to a serverless platform, run these on a separate always-on
worker and move jobs to Inngest Cloud.
