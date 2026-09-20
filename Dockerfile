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
      gnupg \
    && rm -rf /var/lib/apt/lists/*
# pg_dump for the nightly backup. The client major version must match the server (Railway runs
# Postgres 18), so take it from the PostgreSQL project's own repository rather than Debian's 15.
RUN install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
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
# The server runs as an unprivileged user: a bug in the app — or in the headless browser that
# opens customers' websites — should not own the container. HOME and the cache point at /tmp so
# nothing needs to write inside the read-only /app tree; the entrypoint starts as root only long
# enough to hand the mounted volume over, then drops to this user.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 LOCAL_STORAGE_DIR=/data/files     HOME=/tmp XDG_CACHE_HOME=/tmp/.cache XDG_CONFIG_HOME=/tmp/.config APP_UID=10001 APP_GID=10001
RUN groupadd --system --gid 10001 adcraft  && useradd --system --uid 10001 --gid 10001 --home-dir /tmp --shell /usr/sbin/nologin adcraft  && mkdir -p /app/apps/app/.next/cache /data  && chown -R 10001:10001 /app/apps/app/.next/cache
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
