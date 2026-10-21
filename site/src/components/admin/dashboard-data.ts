// Données du tableau de bord de l'administration : ce qui est affiché sur le site en ce moment, les derniers contenus modifiés
// et les chiffres de l'espace membres.
import type { Payload, Where } from 'payload'
import { runningAdsWhere } from '@/access'
import { shiftDay, tvDay } from '@/components/programme/model'
import { parisDateTime } from '@/lib/format'
import { loadItems } from '@/lib/members/items'
import type { HistoryKind } from '@/lib/members/shared'
import { twitchTarget } from '@/lib/video'

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
  /** messages du formulaire de contact pas encore traités */
  messages: number
  meteo: { auto: boolean; updatedAt: string | null }
  /** vidéos et replays sans image (image YouTube introuvable à l'enregistrement) */
  missingImages: { videos: number; replays: number }
  recent: RecentItem[]
  /** espace membres ; null : aucun compte (le tableau de bord n'en parle pas) */
  members: MembersStats | null
}

export type MembersStats = {
  /** membres à l'adresse confirmée et au compte non suspendu */
  confirmed: number
  /** parmi eux, inscrits ces 7 derniers jours */
  newThisWeek: number
  /** inscrits qui n'ont pas encore cliqué sur le lien de confirmation */
  pending: number
  signupOpen: boolean
  /** contenus les plus regardés par les membres ces 7 derniers jours (5 au plus) */
  topWatched: TopWatched[]
}

export type TopWatched = { kind: HistoryKind; id: number; title: string; href: string; members: number }

export type RecentItem = { collection: RecentCollection; id: number; title: string; updatedAt: string; draft: boolean }
export type RecentCollection = 'videos' | 'articles' | 'events' | 'replays'


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
/** Version en ligne seulement (les brouillons ne sont pas sur le site). */
const LIVE: Where = { _status: { equals: 'published' } }

async function featured(payload: Payload, collection: 'videos' | 'articles', flag: 'isVideoOfDay' | 'isInfoOfDay'): Promise<Featured> {
  const published: Where = { and: [LIVE, { publishedAt: { less_than_equal: new Date().toISOString() } }] }
  const find = (where: Where) => payload.find({ collection, where, sort: '-publishedAt', limit: 1, depth: 0, pagination: false, select: { title: true } })
  const picked = (await find({ and: [published, { [flag]: { equals: true } }] })).docs[0]
  const doc = picked ?? (await find(published)).docs[0]
  return doc ? { id: doc.id, title: doc.title, picked: Boolean(picked) } : null
}

async function weekendPick(payload: Payload): Promise<Featured> {
  const now = new Date().toISOString()
  const upcoming: Where = { or: [{ startDate: { greater_than_equal: now } }, { endDate: { greater_than_equal: now } }] }
  const find = (where: Where) => payload.find({ collection: 'events', where: { and: [LIVE, where] }, sort: 'startDate', limit: 1, depth: 0, pagination: false, select: { title: true } })
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
        LIVE,
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
      // dernières versions, brouillons compris (signalés « À publier » : modifications pas encore sur le site)
      const { docs } = await payload.find({
        collection,
        draft: true,
        sort: '-updatedAt',
        limit: 6,
        depth: 0,
        pagination: false,
        select: { title: true, updatedAt: true, _status: true },
      })
      return docs.map((d) => ({ collection, id: d.id, title: d.title || 'Sans titre', updatedAt: d.updatedAt, draft: d._status === 'draft' }))
    }),
  )
  return lists
    .flat()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
}

const WEEK_MS = 7 * 24 * 3600 * 1000
/** Lignes d'historique lues au plus pour le classement (les plus récentes) : largement assez à l'échelle du site. */
const TOP_SCAN = 20_000

/**
 * Classement des contenus regardés par les membres depuis `since`. L'historique a une ligne par membre et par contenu
 * (date de la dernière lecture) : compter les lignes revient à compter les membres différents qui l'ont regardé.
 */
async function topWatched(payload: Payload, since: string): Promise<TopWatched[]> {
  const { docs } = await payload.find({
    collection: 'member-history',
    where: { watchedAt: { greater_than_equal: since } },
    sort: '-watchedAt',
    limit: TOP_SCAN,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { kind: true, itemId: true },
  })
  const counts = new Map<string, { kind: HistoryKind; itemId: number; members: number }>()
  for (const d of docs) {
    const key = `${d.kind}:${d.itemId}`
    const entry = counts.get(key)
    if (entry) entry.members++
    else counts.set(key, { kind: d.kind, itemId: d.itemId, members: 1 })
  }
  // quelques contenus de réserve : ceux qui ont été supprimés depuis sont absents de loadItems
  const ranked = [...counts.values()].sort((a, b) => b.members - a.members).slice(0, 10)
  if (!ranked.length) return []
  const items = await loadItems(payload, ranked, { publicOnly: false })
  return ranked
    .flatMap((r) => {
      const item = items.get(`${r.kind}:${r.itemId}`)
      return item ? [{ kind: r.kind, id: r.itemId, title: item.title || 'Sans titre', href: item.href, members: r.members }] : []
    })
    .slice(0, 5)
}

/** Chiffres de l'espace membres (null s'il n'y a encore aucun compte) ; `signupOpen` est lu dans les réglages. */
async function membersStats(payload: Payload): Promise<Omit<MembersStats, 'signupOpen'> | null> {
  const count = async (where: Where) => (await payload.count({ collection: 'members', where, overrideAccess: true })).totalDocs
  const active: Where = { and: [{ verified: { equals: true } }, { blocked: { not_equals: true } }] }
  const since = new Date(Date.now() - WEEK_MS).toISOString()
  const [total, confirmed, newThisWeek, pending, top] = await Promise.all([
    count({ id: { exists: true } }),
    count(active),
    count({ and: [active, { createdAt: { greater_than_equal: since } }] }),
    count({ and: [{ verified: { not_equals: true } }, { blocked: { not_equals: true } }] }),
    attempt(() => topWatched(payload, since), [] as TopWatched[]),
  ])
  return total ? { confirmed, newThisWeek, pending, topWatched: top } : null
}

export async function getDashboardData(payload: Payload): Promise<DashboardData> {
  const noImage: Where = { and: [LIVE, { thumbnail: { exists: false } }] }
  const [settings, meteo, videoOfDay, infoOfDay, pick, empty, ads, messages, videosNoImage, replaysNoImage, recentItems, members] = await Promise.all([
    attempt(() => payload.findGlobal({ slug: 'settings', depth: 0 }), null),
    attempt(() => payload.findGlobal({ slug: 'meteo', depth: 0 }), null),
    attempt(() => featured(payload, 'videos', 'isVideoOfDay'), null),
    attempt(() => featured(payload, 'articles', 'isInfoOfDay'), null),
    attempt(() => weekendPick(payload), null),
    attempt(() => emptyDays(payload), [] as string[]),
    attempt(async () => (await payload.count({ collection: 'ads', where: { and: [LIVE, runningAdsWhere()] } })).totalDocs, 0),
    attempt(async () => (await payload.count({ collection: 'messages', where: { handled: { not_equals: true } } })).totalDocs, 0),
    attempt(async () => (await payload.count({ collection: 'videos', where: noImage })).totalDocs, 0),
    attempt(async () => (await payload.count({ collection: 'replays', where: noImage })).totalDocs, 0),
    attempt(() => recent(payload), [] as RecentItem[]),
    attempt(() => membersStats(payload), null),
  ])

  const live = settings?.live
  const liveConfigured = Boolean(
    live?.provider &&
      (live.provider === 'youtube'
        ? live.youtubeUrl
        : live.provider === 'twitch'
          ? twitchTarget(live.twitchUrl)
          : live.provider === 'bunny'
            ? live.bunnyVideoId
            : live.provider === 'url'
              ? live.url
              : live.file),
  )

  return {
    live: { enabled: settings?.liveEnabled !== false, configured: liveConfigured },
    videoOfDay,
    infoOfDay,
    weekendPick: pick,
    flash: { messages: settings?.flashItems?.length ?? 0, auto: settings?.flashAuto !== false },
    emptyDays: empty,
    ads,
    messages,
    // heure de l'import, lue dans les prévisions (la date de modification de la fiche change aussi avec un bulletin)
    meteo: { auto: meteo?.autoUpdate !== false, updatedAt: (meteo?.forecast as { updatedAt?: string } | null | undefined)?.updatedAt ?? null },
    missingImages: { videos: videosNoImage, replays: replaysNoImage },
    recent: recentItems,
    members: members && { ...members, signupOpen: settings?.members?.signupOpen !== false },
  }
}
