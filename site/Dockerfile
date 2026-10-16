# syntax=docker/dockerfile:1.7
# Site Swatter TV : Next.js 16 (sortie « standalone ») + Payload CMS 3 + PostgreSQL.
#
#   docker build -t swatter-tv --build-arg NEXT_PUBLIC_SITE_URL=https://www.swatter-tv.fr .
#   docker run -p 3000:3000 --env-file .env -v swatter-media:/app/media swatter-tv
#
# Cibles :
#   runner (par défaut) : image de production légère, sans les sources
#   tools               : sources + dépendances complètes, pour les commandes Payload
#                         (migrations, premier administrateur, imports, jeu de démonstration)

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- 1. Dépendances ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- 2. Build ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Variables publiques : intégrées au code envoyé au navigateur, donc fixées au moment du build.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_BUNNY_LIBRARY_ID=
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_BUNNY_LIBRARY_ID=${NEXT_PUBLIC_BUNNY_LIBRARY_ID}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# La base n'est pas joignable pendant le build : les pages se rabattent sur leurs valeurs par défaut
# (voir src/lib/safe.ts) et sont régénérées avec les vraies données à la première visite.
# Ces valeurs factices ne servent qu'au build et ne sont pas conservées dans l'image finale.
RUN PAYLOAD_SECRET=build-only-placeholder \
    DATABASE_URI=postgres://build:build@127.0.0.1:1/build \
    npm run build

# ---------- 3. Outils (migrations, scripts Payload) ----------
FROM builder AS tools
ENV NODE_OPTIONS=--no-deprecation
CMD ["npm", "run", "payload", "migrate"]

# ---------- 4. Production ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--no-deprecation \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Utilisateur non root
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home-dir /app --shell /usr/sbin/nologin nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Médiathèque (à monter sur un volume persistant si les médias ne sont pas stockés sur S3 / R2)
RUN mkdir -p /app/media /app/.next/cache && chown -R nextjs:nodejs /app/media /app/.next/cache
VOLUME ["/app/media"]

USER nextjs
EXPOSE 3000

# L'application répond et la base de données est joignable
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/globals/settings?depth=0',{signal:AbortSignal.timeout(8000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
