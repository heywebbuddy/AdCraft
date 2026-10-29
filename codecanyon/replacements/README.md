# Adcraft

AI ad creation, product videos and UGC stories in one Next.js application.
Start with [the buyer guide](documentation/index.html) for setup, provider keys,
billing, deployment and troubleshooting.

## Quick start

Requirements: Node.js 22 or newer and pnpm 9.15.9.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Set `AUTH_SECRET` to the output of `openssl rand -base64 32`.
Leave `DATABASE_URL` empty for the embedded local database.
Set `ADMIN_EMAILS` to your local test email if you want to test the admin panel.

```bash
pnpm --filter @adcraft/app dev
```

Open http://localhost:3000 and use the development sign-in box at `/sign-in`.
Create a workspace and brand. Add a product by hand or import a website.
Text concepts offer sample output without keys. Static ad generation,
the public HeyGen catalog, live voice tools and other provider features require
the matching provider account and key. Sample output is for testing the workflow.

## Production

Use PostgreSQL and a persistent Node server or container. Configure Resend or Google
sign-in, a unique `AUTH_SECRET`, your public `AUTH_URL` and durable media storage.
Development sign-in is disabled in production. Set `DEV_LOGIN=0` explicitly too.

```bash
pnpm --filter @adcraft/db db:migrate
pnpm build
pnpm --filter @adcraft/app start
```

The migration command reads `.env` at the project root. The Docker entrypoint runs
migrations automatically. See [deployment instructions](documentation/DEPLOY.md).

Photographic demo images and videos in the listing are preview-only and are not
included in the download. The website contains editable SVG placeholders; replace
them with your own licensed product photos and media.

AI generation, email, hosting, ad spend and payment processing are separate services.
The purchase includes source code, not accounts or usage credits for those services.
Read [third-party notices](THIRD-PARTY-NOTICES.md), including Remotion's product-video
licensing terms, before commercial use.

## Project folders

| Folder | Contents |
| --- | --- |
| `apps/app` | Next.js application and tests |
| `packages/db` | Database schema and SQL migrations |
| `packages/ai` | AI model and provider adapters |
| `packages/render` | Image layouts and video rendering |
| `packages/storage` | R2 and local media storage |
| `packages/ads` | Ad platform adapters and sandbox accounts |
| `packages/specs` | Placement sizes and limits |
| `packages/ui` | Shared UI components |
| `apps/app/public` | Editable website pages and required public media |
| `documentation` | Buyer guide in HTML |

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm --filter @adcraft/app e2e` runs against a separately started development server.
It needs a test workspace; product and creative steps skip when no examples exist.
Never point the sandbox smoke suite at a live customer account.
