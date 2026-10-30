import type { MetadataRoute } from 'next'
import type { Where } from 'payload'
import { parisDateTime, parisDay } from '@/lib/format'
import { getPayloadClient } from '@/lib/payload'
import { safe } from '@/lib/safe'
import { DEPARTMENTS, INFO_ZONES, WEBCAMS_PLUS } from '@/lib/departments'
import { meteoHref } from '@/lib/meteo'
import { absoluteUrl } from '@/lib/site'
import { articleUrl, departmentUrl, eventUrl, pageUrl, replayUrl, videoUrl } from '@/lib/urls'

// Régénéré toutes les 10 minutes : vite à jour après un déploiement (le build Docker se fait sans base) ou une publication
export const revalidate = 600

/** Plafond par collection (un sitemap accepte 50 000 adresses). */
const MAX = 5000

type Entry = MetadataRoute.Sitemap[number]
type Dated = { slug?: string | null; updatedAt: string }

const entry = (path: string, lastModified?: string | null): Entry => ({ url: absoluteUrl(path), ...(lastModified ? { lastModified } : {}) })
/** Date la plus récente d'une liste (ISO). */
const latest = (docs: { updatedAt: string }[]) => docs.reduce<string | null>((max, d) => (!max || d.updatedAt > max ? d.updatedAt : max), null)
const withSlug = <T extends Dated>(docs: T[]) => docs.filter((d) => d.slug)

/**
 * Plan du site : adresses fixes, pages éditoriales, articles, départements (et « Autres régions ») de l'info,
 * départements de la météo et des webcams, vidéos, replays et événements à venir. Sans base (build), seules les adresses
 * fixes sortent.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await safe(() => getPayloadClient(), null, 'sitemap')
  const now = new Date()
  const nowIso = now.toISOString()
  const published: Where = { publishedAt: { less_than_equal: nowIso } }

  const [pages, allArticles, videos, replays, events, webcams] = payload
    ? await Promise.all([
        safe(async () => (await payload.find({ collection: 'pages', limit: MAX, depth: 0, pagination: false, sort: 'slug', select: { slug: true, updatedAt: true } })).docs, [], 'sitemap (pages)'),
        safe(
          async () =>
            (
              await payload.find({
                collection: 'articles',
                where: published,
                limit: MAX,
                depth: 0,
                pagination: false,
                sort: '-publishedAt',
                select: { slug: true, department: true, updatedAt: true },
              })
            ).docs,
          [],
          'sitemap (articles)',
        ),
        safe(
          async () =>
            (await payload.find({ collection: 'videos', where: published, limit: MAX, depth: 0, pagination: false, sort: '-publishedAt', select: { slug: true, updatedAt: true } })).docs,
          [],
          'sitemap (vidéos)',
        ),
        safe(async () => (await payload.find({ collection: 'replays', where: { broadcastAt: { less_than_equal: nowIso } }, limit: MAX, depth: 0, pagination: false, sort: '-broadcastAt', select: { slug: true, updatedAt: true } })).docs, [], 'sitemap (replays)'),
        // Événements à venir : pas encore terminés (sans date de fin : commençant aujourd'hui ou plus tard)
        safe(
          async () =>
            (
              await payload.find({
                collection: 'events',
                where: {
                  or: [
                    { endDate: { greater_than_equal: nowIso } },
                    { and: [{ endDate: { exists: false } }, { startDate: { greater_than_equal: parisDateTime(parisDay(now)).toISOString() } }] },
                  ],
                },
                limit: MAX,
                depth: 0,
                pagination: false,
                sort: 'startDate',
                select: { slug: true, updatedAt: true },
              })
            ).docs,
          [],
          'sitemap (agenda)',
        ),
        // départements qui ont au moins une webcam active
        safe(
          async () =>
            (await payload.find({ collection: 'webcams', where: { active: { not_equals: false } }, limit: MAX, depth: 0, pagination: false, select: { department: true, updatedAt: true } }))
              .docs,
          [],
          'sitemap (webcams)',
        ),
      ])
    : [[], [], [], [], [], []]

  // Départements (et « Autres régions ») qui ont au moins un article publié, avec la date de leur article le plus récent
  const departments = new Map<string, string>()
  for (const a of allArticles) {
    const prev = departments.get(a.department)
    if (!prev || a.updatedAt > prev) departments.set(a.department, a.updatedAt)
  }
  const articles = withSlug(allArticles)
  const lastInfo = latest(articles)
  const lastVideo = latest(videos)
  const lastReplay = latest(replays)
  const lastEvent = latest(events)
  const lastAll = [lastInfo, lastVideo, lastReplay, lastEvent, latest(pages)].reduce<string | null>((max, d) => (d && (!max || d > max) ? d : max), null)

  return [
    entry('/', lastAll),
    entry('/direct'),
    entry('/info', lastInfo),
    ...INFO_ZONES.filter((z) => departments.has(z.value)).map((z) => entry(departmentUrl(z.value), departments.get(z.value))),
    entry('/meteo'),
    ...DEPARTMENTS.map((d) => entry(meteoHref(d.value))),
    entry('/agenda', lastEvent),
    entry('/programme-tv'),
    entry('/replay', lastReplay),
    entry('/videos', lastVideo),
    entry('/webcams'),
    entry('/contact'),
    ...[...DEPARTMENTS.map((d) => d.value), WEBCAMS_PLUS].filter((z) => webcams.some((w) => w.department === z)).map((z) => entry(`/webcams/${z}`)),
    ...withSlug(pages).map((p) => entry(pageUrl(p), p.updatedAt)),
    ...articles.map((a) => entry(articleUrl(a), a.updatedAt)),
    ...withSlug(videos).map((v) => entry(videoUrl(v), v.updatedAt)),
    ...withSlug(replays).map((r) => entry(replayUrl(r), r.updatedAt)),
    ...withSlug(events).map((e) => entry(eventUrl(e), e.updatedAt)),
  ]
}
