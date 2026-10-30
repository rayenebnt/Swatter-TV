# syntax=docker/dockerfile:1
# Image de production du site Swatter TV Info (Next.js « standalone » + Payload CMS).
#
#   docker build -t swatter-tv --build-arg NEXT_PUBLIC_SITE_URL=https://www.swatter-tv.fr .
#   docker run -p 3000:3000 --env-file .env -v swatter-media:/app/media swatter-tv
#
# Cibles : « runner » (par défaut, le site) et « tools » (CLI Payload : migrations, jeu de démonstration, imports).
# Avec Docker Compose (docker-compose.yml) : services « app » (runner), « migrate » et « tools » (tools), « cron ».
# node:22-bookworm-slim (glibc) : binaires précompilés de sharp pris en charge ; ffmpeg (paquet Debian) ajouté aux étapes
# « tools » et « runner » pour les couvertures et aperçus tirés des vidéos.
# Le build demande environ 4 Go de mémoire (voir « build » dans package.json).

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- Dépendances ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Build ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Les variables NEXT_PUBLIC_* sont figées dans le code au moment du build. L'adresse publique est obligatoire (adresses
# canoniques, sitemap, adresse du serveur Payload dont dépend l'enregistrement dans l'administration) : vérifiée d'emblée.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BUNNY_LIBRARY_ID=
RUN test -n "$NEXT_PUBLIC_SITE_URL" || { echo "NEXT_PUBLIC_SITE_URL manquante : --build-arg NEXT_PUBLIC_SITE_URL=https://www.swatter-tv.fr (Docker Compose : dans .env)" >&2; exit 1; }

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_BUNNY_LIBRARY_ID=${NEXT_PUBLIC_BUNNY_LIBRARY_ID}

# Le build n'a pas besoin de la base : les requêtes échouent proprement (voir src/lib/safe.ts)
# et les pages sont générées à la première visite. Valeurs factices propres à cette étape.
RUN DATABASE_URI=postgres://build:build@127.0.0.1:1/build \
    PAYLOAD_SECRET=build-only-not-used-at-runtime \
    npm run build

# ---------- Outils (migrations, jeu de démonstration, imports) ----------
# Sources complètes + node_modules : la CLI Payload lit src/payload.config.ts et src/migrations.
#   docker compose run --rm migrate                               → npm run payload migrate (commande par défaut)
#   docker compose run --rm tools npm run payload migrate:status
#   docker compose run --rm -e SEED_FORCE=1 tools npm run seed
FROM builder AS tools
ENV NODE_ENV=production \
    HOME=/tmp
# ffmpeg : couverture et aperçu animé tirés des vidéos (src/hooks/ffmpeg.ts), aussi pendant le jeu de démonstration et les imports
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
# Même utilisateur que le site (uid 1001) : les fichiers écrits dans le volume « media » lui appartiennent.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /tmp nextjs \
 && mkdir -p /app/media \
 && chown nextjs:nodejs /app/media
USER nextjs
CMD ["npm", "run", "payload", "migrate"]

# ---------- Exécution ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# ffmpeg : couverture et aperçu animé tirés des vidéos à l'enregistrement (src/hooks/ffmpeg.ts)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Utilisateur non root ; dossier des médias envoyés (à monter en volume)
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /app nextjs \
 && mkdir -p /app/media \
 && chown nextjs:nodejs /app/media

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Délai de réception d'une requête porté de 5 à 30 minutes (envoi de vidéos jusqu'à 500 Mo)
COPY --from=builder --chown=nextjs:nodejs /app/http-timeouts.cjs ./

USER nextjs
EXPOSE 3000
VOLUME ["/app/media"]

# Santé : le site répond et lit la base (réglages publics, sans cache).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/globals/settings?depth=0').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--require", "./http-timeouts.cjs", "server.js"]
