// Données du tableau de bord de l'administration : ce qui est affiché sur le site en ce moment et les derniers contenus modifiés.
import type { Payload, Where } from 'payload'
import { runningAdsWhere } from '@/access'
import { shiftDay, tvDay } from '@/components/programme/model'
import { parisDateTime } from '@/lib/format'

export type Featured = { id: number; title: string; picked: boolean } | null

export type DashboardData = {
  live: { enabled: boolean; configured: boolean }
  videoOfDay: Featured
  infoOfDay: Featured
  weekendPick: Featured
  flash: { messages: number; auto: boolean }
  /** jours TV (AAAA-MM-JJ) sans aucun créneau, parmi aujourd'hui et les 6 suivants */
  emptyDays: string[]
  ads: number
  meteo: { auto: boolean; updatedAt: string | null }
  rss: { activeFeeds: number; failingFeeds: number; importedToday: number }
  recent: RecentItem[]
}

export type RecentItem = { collection: RecentCollection; id: number; title: string; updatedAt: string }
export type RecentCollection = 'videos' | 'articles' | 'events' | 'replays'

const DAY_MS = 24 * 60 * 60 * 1000

/** Une requête en échec n'empêche pas le tableau de bord de s'afficher : la case concernée reste vide. */
async function attempt<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    console.error('[swatter] Tableau de bord :', error instanceof Error ? error.message : error)
    return fallback
  }
}

/** Contenu mis en avant (case cochée) ; à défaut, celui que le site affiche à la place (le plus récent). */
async function featured(payload: Payload, collection: 'videos' | 'articles', flag: 'isVideoOfDay' | 'isInfoOfDay'): Promise<Featured> {
  const published: Where = { publishedAt: { less_than_equal: new Date().toISOString() } }
  const find = (where: Where) => payload.find({ collection, where, sort: '-publishedAt', limit: 1, depth: 0, pagination: false, select: { title: true } })
  const picked = (await find({ and: [published, { [flag]: { equals: true } }] })).docs[0]
  const doc = picked ?? (await find(published)).docs[0]
  return doc ? { id: doc.id, title: doc.title, picked: Boolean(picked) } : null
}

async function weekendPick(payload: Payload): Promise<Featured> {
  const now = new Date().toISOString()
  const upcoming: Where = { or: [{ startDate: { greater_than_equal: now } }, { endDate: { greater_than_equal: now } }] }
  const find = (where: Where) => payload.find({ collection: 'events', where, sort: 'startDate', limit: 1, depth: 0, pagination: false, select: { title: true } })
  const picked = (await find({ and: [upcoming, { isWeekendPick: { equals: true } }] })).docs[0]
  const doc = picked ?? (await find({ startDate: { greater_than_equal: now } })).docs[0]
  return doc ? { id: doc.id, title: doc.title, picked: Boolean(picked) } : null
}

/** Jours sans programme parmi les 7 jours proposés sur le site (journées TV de 2 h à 2 h). */
async function emptyDays(payload: Payload): Promise<string[]> {
  const today = tvDay()
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i))
  const { docs } = await payload.find({
    collection: 'schedule',
    where: {
      and: [
        { startsAt: { greater_than_equal: parisDateTime(today, '02:00').toISOString() } },
        { startsAt: { less_than: parisDateTime(shiftDay(today, 7), '02:00').toISOString() } },
      ],
    },
    depth: 0,
    pagination: false,
    select: { startsAt: true },
  })
  const filled = new Set(docs.map((d) => tvDay(new Date(d.startsAt))))
  return days.filter((d) => !filled.has(d))
}

async function recent(payload: Payload): Promise<RecentItem[]> {
  const collections: RecentCollection[] = ['videos', 'articles', 'events', 'replays']
  const lists = await Promise.all(
    collections.map(async (collection) => {
      const { docs } = await payload.find({
        collection,
        // les articles importés automatiquement (RSS) ne sont pas des modifications de l'équipe
        where: collection === 'articles' ? { source: { not_equals: 'rss' } } : undefined,
        sort: '-updatedAt',
        limit: 6,
        depth: 0,
        pagination: false,
        select: { title: true, updatedAt: true },
      })
      return docs.map((d) => ({ collection, id: d.id, title: d.title, updatedAt: d.updatedAt }))
    }),
  )
  return lists
    .flat()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
}

export async function getDashboardData(payload: Payload): Promise<DashboardData> {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const [settings, meteo, videoOfDay, infoOfDay, pick, empty, ads, feeds, importedToday, recentItems] = await Promise.all([
    attempt(() => payload.findGlobal({ slug: 'settings', depth: 0 }), null),
    attempt(() => payload.findGlobal({ slug: 'meteo', depth: 0 }), null),
    attempt(() => featured(payload, 'videos', 'isVideoOfDay'), null),
    attempt(() => featured(payload, 'articles', 'isInfoOfDay'), null),
    attempt(() => weekendPick(payload), null),
    attempt(() => emptyDays(payload), [] as string[]),
    attempt(async () => (await payload.count({ collection: 'ads', where: runningAdsWhere() })).totalDocs, 0),
    attempt(
      async () =>
        (await payload.find({ collection: 'rss-feeds', where: { active: { equals: true } }, depth: 0, pagination: false, select: { lastError: true } })).docs,
      [] as { lastError?: string | null }[],
    ),
    attempt(async () => (await payload.count({ collection: 'articles', where: { and: [{ source: { equals: 'rss' } }, { createdAt: { greater_than_equal: since } }] } })).totalDocs, 0),
    attempt(() => recent(payload), [] as RecentItem[]),
  ])

  const live = settings?.live
  const liveConfigured = Boolean(
    live?.provider && (live.provider === 'youtube' ? live.youtubeUrl : live.provider === 'bunny' ? live.bunnyVideoId : live.provider === 'url' ? live.url : live.file),
  )

  return {
    live: { enabled: settings?.liveEnabled !== false, configured: liveConfigured },
    videoOfDay,
    infoOfDay,
    weekendPick: pick,
    flash: { messages: settings?.flashItems?.length ?? 0, auto: settings?.flashAuto !== false },
    emptyDays: empty,
    ads,
    meteo: { auto: meteo?.autoUpdate !== false, updatedAt: meteo?.updatedAt ?? null },
    rss: { activeFeeds: feeds.length, failingFeeds: feeds.filter((f) => f.lastError).length, importedToday },
    recent: recentItems,
  }
}
