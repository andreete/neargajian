# GAJIAN hosted demo image. Railway builds it in its own cloud from the `release` branch;
# it is never built on the development server (no Docker there). docs/HOSTING.md has the runbook.
#
# Node 26.13.0 pinned by tag AND digest (node:26.13.0-bookworm-slim, Docker Hub, checked 10 Nov 2026).
# better-sqlite3 is compiled from source in the build stage for this image's Node and glibc
# (its shipped prebuilds are removed), then checked by opening an in-memory database.
# One service runs both processes: scripts/hosted-start.sh (migrations, web app, release worker).

FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
RUN cd node_modules/better-sqlite3 \
 && rm -rf prebuilds build \
 && JOBS=2 node /usr/local/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js rebuild --release --force_build=1 --nodedir=/usr/local \
 && cd /app \
 && node -e "const D=require('better-sqlite3'); const v=new D(':memory:').prepare('select sqlite_version() v').get().v; console.log('better-sqlite3 built from source, SQLite', v)"
COPY . .
RUN node node_modules/next/dist/bin/next build

FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_URL=file:/data/gajian.sqlite
COPY --from=build /app /app
# /data is the Railway volume (mounted at start, not at build). Volumes are mounted as root and
# the image runs as root, so no RAILWAY_RUN_UID is needed.
RUN mkdir -p /data
EXPOSE 8080
CMD ["sh", "scripts/hosted-start.sh"]
