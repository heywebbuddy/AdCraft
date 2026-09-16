# Adcraft

AI ad creation for growth teams: brand kit → brief → concepts → static, video and UGC ads in every size → (final release) publish and track on Meta, TikTok and Google.

The plan lives in [`docs/PLAN.md`](docs/PLAN.md).

## Layout

| Path | What |
|---|---|
| `dist/` | Marketing site (buildless static). `python3 -m http.server 4173 --directory dist` |
| `apps/app` | The product: Next.js 15, Auth.js, Inngest, Tailwind |
| `packages/db` | Drizzle schema and migrations (Postgres, or embedded PGlite for local dev) |
| `packages/ai` | Provider adapters: Claude for text, fal.ai for image and video |
| `packages/render` | Static ad templates (Satori → PNG) and Remotion compositions |
| `packages/storage` | Object storage: Cloudflare R2, or local disk in development |
| `packages/specs` | Placement specs per platform (sizes, safe zones, text limits) |
| `packages/ads` | Meta, TikTok and Google adapters (final release) |
| `packages/ui` | Design tokens and base components |

## Run it locally

```bash
pnpm install
cp .env.example .env        # AUTH_SECRET is the only required value: openssl rand -base64 32
pnpm --filter @adcraft/app dev
```

Open http://localhost:3000. With no email provider configured, sign-in accepts any address. With no `DATABASE_URL`, an embedded Postgres runs under `.data/pglite`. With no `ANTHROPIC_API_KEY` or `FAL_KEY`, generation returns labelled sample output so every flow can be exercised.

Add keys to `.env` to switch each piece on: `ANTHROPIC_API_KEY` (concepts and copy), `FAL_KEY` (scenes, cutouts, video), `RESEND_API_KEY` (magic links), `AUTH_GOOGLE_*`, `STRIPE_*` (billing), `R2_*` (storage), `INNGEST_*` (background jobs; otherwise they run inline).

## Useful commands

```bash
pnpm turbo typecheck                       # every package
pnpm --filter @adcraft/db db:generate      # new migration after a schema change
pnpm --filter @adcraft/db db:migrate       # apply to a real Postgres
```
