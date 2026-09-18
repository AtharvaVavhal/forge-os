# FORGE Business OS — API production image (F10.4)
#
# Does NOT run migrations on start (migrate deploy is a separate, deliberate
# ops step — see docs/PRODUCTION-DEPLOYMENT.md).
#
# Build (from repo root):
#   docker build -t forge-api:local -f Dockerfile .
#
# Run (example — supply secrets via the platform, never bake them into the image):
#   docker run --rm -p 4000:4000 \
#     -e NODE_ENV=production \
#     -e DATABASE_URL=... \
#     -e SESSION_JWT_SIGNING_KEY=... \
#     -e CORS_ORIGINS=https://app.forgebuilds.in \
#     forge-api:local

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/api-client/package.json packages/api-client/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npx prisma generate \
  && npm run build:api

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 forge \
  && useradd --system --uid 1001 --gid forge forge
COPY --from=build --chown=forge:forge /app/package.json /app/package-lock.json ./
COPY --from=build --chown=forge:forge /app/node_modules ./node_modules
COPY --from=build --chown=forge:forge /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=forge:forge /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=forge:forge /app/packages ./packages
COPY --from=build --chown=forge:forge /app/prisma ./prisma
USER forge
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
