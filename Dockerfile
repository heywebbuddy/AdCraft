# Adcraft product app (apps/app) for Railway — one always-on container that serves the
# Next.js app, runs pipelines inline (no Inngest keys needed) and renders video with
# Remotion's headless Chromium. Database: the Railway Postgres service. Files: a volume
# at /data (LOCAL_STORAGE_DIR) unless the R2_* variables are set.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# Chromium's shared libraries (Remotion) plus fonts so rendered text is not tofu.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 \
      libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 \
      libdrm2 libxshmfence1 libx11-xcb1 libxcb-dri3-0 libxext6 libgtk-3-0 \
      fonts-liberation fonts-noto-color-emoji fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY dist ./dist
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
# Download Chrome Headless Shell now so the first video render does not pay for it.
RUN cd apps/app && node -e "require('@remotion/renderer').ensureBrowser().then(()=>console.log('chrome ready'))"
RUN pnpm turbo build --filter=@adcraft/app
# Drop dev-only files the runtime never reads.
RUN rm -rf apps/app/.next/cache

FROM build AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 LOCAL_STORAGE_DIR=/data/files
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
