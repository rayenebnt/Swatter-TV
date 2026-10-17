import { createHash, timingSafeEqual } from 'node:crypto'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { fr } from '@payloadcms/translations/languages/fr'
import path from 'path'
import { buildConfig, type Plugin } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Ads } from './collections/Ads'
import { Articles } from './collections/Articles'
import { Events } from './collections/Events'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Programs } from './collections/Programs'
import { Replays } from './collections/Replays'
import { RssFeeds } from './collections/RssFeeds'
import { Schedule } from './collections/Schedule'
import { Users } from './collections/Users'
import { Videos } from './collections/Videos'
import { Webcams } from './collections/Webcams'
import { Meteo } from './globals/Meteo'
import { Settings } from './globals/Settings'
import { importMeteo } from './lib/import/meteo'
import { importRss } from './lib/import/rss'
import { search } from './lib/search'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

const plugins: Plugin[] = [
  seoPlugin({
    collections: ['videos', 'replays', 'articles', 'events', 'pages', 'programs'],
    uploadsCollection: 'media',
    generateTitle: ({ doc }) => `${(doc as { title?: string }).title ?? ''} — Swatter TV`,
    generateDescription: ({ doc }) => {
      const d = doc as { excerpt?: string; description?: string; synopsis?: string }
      return (d.excerpt || d.description || d.synopsis || '').slice(0, 160)
    },
  }),
  redirectsPlugin({
    collections: ['pages', 'articles', 'videos', 'replays', 'events'],
    overrides: { admin: { group: 'Réglages' }, labels: { singular: 'Redirection', plural: 'Redirections' } },
  }),
]

if (process.env.S3_BUCKET) {
  plugins.push(
    s3Storage({
      collections: { media: true },
      bucket: process.env.S3_BUCKET,
      config: {
        region: process.env.S3_REGION || 'auto',
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: Boolean(process.env.S3_ENDPOINT),
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  )
}

/** Comparaison du secret de la tâche planifiée en temps constant (refus si aucun secret n'est configuré). */
function sameSecret(given: string, expected: string | undefined): boolean {
  if (!expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export default buildConfig({
  serverURL: SITE_URL,
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: ' — Swatter TV',
      description: 'Administration du site Swatter TV',
      icons: [
        { rel: 'icon', type: 'image/png', url: '/favicon.png' },
        { rel: 'apple-touch-icon', url: '/apple-touch-icon.png' },
      ],
      robots: { index: false, follow: false },
    },
    // Habillage aux couleurs de Swatter TV (styles : src/app/(payload)/custom.scss)
    components: {
      graphics: {
        Logo: '/components/admin/Logo#Logo',
        Icon: '/components/admin/Icon#Icon',
      },
    },
    dateFormat: 'dd/MM/yyyy HH:mm',
    // avatar neutre : pas d'appel à Gravatar (aucune donnée envoyée à un tiers)
    avatar: 'default',
  },
  i18n: { supportedLanguages: { fr }, fallbackLanguage: 'fr' },
  collections: [Videos, Replays, Articles, Events, Webcams, Ads, Pages, Programs, Schedule, Media, RssFeeds, Users],
  globals: [Settings, Meteo],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // en développement le schéma suit le code ; en production : migrations (voir README)
    // Développement : le schéma suit le code. Production : migrations (npm run payload migrate)
    push: process.env.NODE_ENV !== 'production',
  }),
  sharp,
  plugins,
  endpoints: [
    {
      // Tâche planifiée : GET /api/cron/import avec l'en-tête « Authorization: Bearer CRON_SECRET »
      // (ou ?secret=CRON_SECRET), toutes les heures (jusqu'à toutes les 15 minutes)
      path: '/cron/import',
      method: 'get',
      handler: async (req) => {
        const secret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.searchParams.get('secret') || ''
        if (!sameSecret(secret, process.env.CRON_SECRET)) {
          return Response.json({ error: 'Non autorisé' }, { status: 401 })
        }
        const [rss, meteo] = await Promise.all([
          importRss(req.payload).catch((e: unknown) => ({ created: 0, skipped: 0, errors: [String(e)] })),
          importMeteo(req.payload).catch((e: unknown) => ({ ok: false, error: String(e) })),
        ])
        if (rss.created > 0 || ('ok' in meteo && meteo.ok)) {
          try {
            const { revalidatePath } = await import('next/cache')
            revalidatePath('/', 'layout')
          } catch {
            // hors runtime Next.js
          }
        }
        return Response.json({ rss, meteo })
      },
    },
    {
      // Recherche instantanée : GET /api/search?q=…
      path: '/search',
      method: 'get',
      handler: async (req) => {
        const q = (req.searchParams.get('q') || '').trim().slice(0, 80)
        if (q.length < 2) return Response.json({ hits: [] })
        const hits = await search(req.payload, q, 8)
        return Response.json({ hits }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })
      },
    },
  ],
})
