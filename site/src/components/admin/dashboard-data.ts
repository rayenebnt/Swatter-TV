// Données du tableau de bord de l'administration : ce qui est affiché sur le site en ce moment, les derniers contenus modifiés
// et les chiffres de l'espace membres.
import type { Payload, Where } from 'payload'
import { runningAdsWhere } from '@/access'
import { shiftDay, tvDay, tvDayStart } from '@/components/programme/model'
import { BROADCAST_HOURS_LABEL, BROADCAST_MINUTES, slotOutsideBroadcast } from '@/lib/broadcast'
import { durationLabel, eveningShortLabel, uncoveredMinutes } from '@/lib/schedule-week'
import { loadItems } from '@/lib/members/items'
import type { HistoryKind } from '@/lib/members/shared'
import { isMeasurementId } from '@/lib/analytics'
import { resolveVideo } from '@/lib/video'

export type Featured = { id: number; title: string; picked: boolean } | null

export type DashboardData = {
  live: { enabled: boolean; configured: boolean }
  videoOfDay: Featured
  infoOfDay: Featured
  weekendPick: Featured
  flash: { messages: number; auto: boolean }
  /** grille des 7 prochaines soirées ; null : requête en échec (jamais « Complet » par défaut) */
  evenings: EveningsStatus | null
  /** campagnes en cours ; null : requête en échec */
  ads: number | null
  /** messages du formulaire de contact pas encore traités ; null : requête en échec (jamais « Aucun message » par défaut) */
  messages: number | null
  meteo: { auto: boolean; updatedAt: string | null }
  /** vidéos et replays en ligne sans image : couverture impossible à tirer de la vidéo à l'enregistrement (YouTube injoignable,
   * fichier ou lien illisible ; nouvel essai 10 min plus tard au plus tôt, voir src/hooks/videoAutoMedia.ts) */
  missingImages: { videos: number; replays: number }
  /** ID de mesure de Google Analytics publié (null : aucune mesure d'audience) */
  analyticsId: string | null
  recent: RecentItem[]
  /** espace membres ; null : aucun compte (le tableau de bord n'en parle pas) */
  members: MembersStats | null
}

/**
 * État de la grille des 7 soirées proposées sur le site (18 h – 0 h 30), à partir de la soirée en cours ou à venir, en ne
 * comptant que les créneaux publiés et ce que voient les visiteurs (créneaux rognés aux horaires d'antenne).
 */
export type EveningsStatus = {
  /** soirée en cours ou à venir (AAAA-MM-JJ, tvDay) : la première des 7 */
  today: string
  /** instant du contrôle (ms) : de 0 h à 0 h 30, la soirée suivante porte le nom de son jour (« samedi soir ») */
  at?: number
  /** soirées sans aucun programme entre 18 h et 0 h 30 */
  empty: string[]
  /** soirées en partie seulement couvertes : minutes sans programme entre 18 h et 0 h 30 */
  incomplete: { day: string; missingMinutes: number }[]
  /** anciens créneaux publiés en dehors des horaires d'antenne (début avant 18 h ou à partir de 0 h 30, fin après 0 h 30)
   * dans ces 7 journées TV ; `firstDay` : la journée TV du premier (lien vers la grille) */
  offAir: { count: number; firstDay: string | null }
}

export type MembersStats = {
  /** membres au compte non suspendu */
  active: number
  /** parmi eux, inscrits ces 7 derniers jours */
  newThisWeek: number
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

/**
 * Soirées vides ou incomplètes et créneaux hors antenne parmi les 7 soirées proposées sur le site. Requête sur les journées
 * TV (de 0 h 30 à 0 h 30 : chaque soirée entière, ses créneaux de 0 h à 0 h 30 datés du lendemain compris, et les anciens
 * créneaux hors antenne de la journée). De 0 h à 0 h 30, la soirée de la veille est encore en cours : elle est la première.
 */
async function evenings(payload: Payload, now = new Date()): Promise<EveningsStatus> {
  const today = tvDay(now)
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i))
  const { docs } = await payload.find({
    collection: 'schedule',
    where: {
      and: [
        LIVE,
        { startsAt: { greater_than_equal: tvDayStart(today).toISOString() } },
        { startsAt: { less_than: tvDayStart(shiftDay(today, 7)).toISOString() } },
      ],
    },
    sort: 'startsAt',
    depth: 0,
    pagination: false,
    select: { startsAt: true, durationMinutes: true },
  })
  const offAir = docs.filter((d) => slotOutsideBroadcast(new Date(d.startsAt), d.durationMinutes) !== null)
  const missing = days.map((day) => ({ day, missingMinutes: uncoveredMinutes(day, docs) }))
  return {
    today,
    at: now.getTime(),
    empty: missing.filter((m) => m.missingMinutes >= BROADCAST_MINUTES).map((m) => m.day),
    incomplete: missing.filter((m) => m.missingMinutes > 0 && m.missingMinutes < BROADCAST_MINUTES),
    offAir: { count: offAir.length, firstDay: offAir.length ? tvDay(new Date(offAir[0].startsAt)) : null },
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/**
 * Ligne « Programme TV » : soirées vides (« Rien de prévu : ce soir, sam. 24 »), incomplètes (« mar. 27 : 1 h 15 sans
 * programme ») et anciens créneaux hors antenne, sinon « Les 7 prochaines soirées sont complètes ». `first` : la première
 * soirée à reprendre (lien vers sa grille) ; null si tout va bien ou si tout est vide (lien vers la semaine).
 */
export function programmeSummary(e: EveningsStatus | null): { tone: 'ok' | 'warn'; value: string; first: string | null } {
  if (!e) return { tone: 'warn', value: 'Information indisponible pour le moment : rechargez la page dans un instant', first: null }
  const label = (d: string) => eveningShortLabel(d, e.today, e.at)
  const parts: string[] = []
  if (e.empty.length === 7) parts.push('Aucune émission prévue pour les 7 prochaines soirées')
  else if (e.empty.length) parts.push(`Rien de prévu : ${e.empty.map(label).join(', ')}`)
  if (e.incomplete.length) {
    const list = e.incomplete.map((m) => `${label(m.day)} : ${durationLabel(m.missingMinutes)} sans programme`).join(', ')
    parts.push(`Soirée${e.incomplete.length > 1 ? 's' : ''} incomplète${e.incomplete.length > 1 ? 's' : ''} (${BROADCAST_HOURS_LABEL}) : ${list}`)
  }
  if (e.offAir.count) {
    const n = e.offAir.count
    parts.push(
      `${plural(n, 'créneau', 'créneaux')} en dehors des horaires d’antenne : ${n > 1 ? 'corrigez leur heure ou leur durée, ou supprimez-les' : 'corrigez son heure ou sa durée, ou supprimez-le'}`,
    )
  }
  if (!parts.length) return { tone: 'ok', value: `Les 7 prochaines soirées sont complètes (${BROADCAST_HOURS_LABEL})`, first: null }
  const days = [...e.empty, ...e.incomplete.map((m) => m.day), ...(e.offAir.firstDay ? [e.offAir.firstDay] : [])].sort()
  return { tone: 'warn', value: parts.join(' · '), first: e.empty.length === 7 ? null : (days[0] ?? null) }
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
  const notBlocked: Where = { blocked: { not_equals: true } }
  const since = new Date(Date.now() - WEEK_MS).toISOString()
  const [total, active, newThisWeek, top] = await Promise.all([
    count({ id: { exists: true } }),
    count(notBlocked),
    count({ and: [notBlocked, { createdAt: { greater_than_equal: since } }] }),
    attempt(() => topWatched(payload, since), [] as TopWatched[]),
  ])
  return total ? { active, newThisWeek, topWatched: top } : null
}

export async function getDashboardData(payload: Payload): Promise<DashboardData> {
  const noImage: Where = { and: [LIVE, { thumbnail: { exists: false } }] }
  const [settings, meteo, videoOfDay, infoOfDay, pick, grid, ads, messages, videosNoImage, replaysNoImage, recentItems, members] = await Promise.all([
    attempt(() => payload.findGlobal({ slug: 'settings', depth: 0 }), null),
    attempt(() => payload.findGlobal({ slug: 'meteo', depth: 0 }), null),
    attempt(() => featured(payload, 'videos', 'isVideoOfDay'), null),
    attempt(() => featured(payload, 'articles', 'isInfoOfDay'), null),
    attempt(() => weekendPick(payload), null),
    attempt<EveningsStatus | null>(() => evenings(payload), null),
    attempt<number | null>(async () => (await payload.count({ collection: 'ads', where: { and: [LIVE, runningAdsWhere()] } })).totalDocs, null),
    attempt<number | null>(async () => (await payload.count({ collection: 'messages', where: { handled: { not_equals: true } } })).totalDocs, null),
    attempt(async () => (await payload.count({ collection: 'videos', where: noImage })).totalDocs, 0),
    attempt(async () => (await payload.count({ collection: 'replays', where: noImage })).totalDocs, 0),
    attempt(() => recent(payload), [] as RecentItem[]),
    attempt(() => membersStats(payload), null),
  ])

  const live = settings?.live
  // même règle que la page Direct (resolveVideo : un lien de chaîne YouTube n'est pas une vidéo) ; le fichier envoyé n'est
  // pas chargé ici (depth: 0), sa présence suffit
  const liveConfigured = Boolean(live?.provider && (live.provider === 'upload' ? live.file : resolveVideo(live)))

  return {
    live: { enabled: settings?.liveEnabled !== false, configured: liveConfigured },
    videoOfDay,
    infoOfDay,
    weekendPick: pick,
    flash: { messages: settings?.flashItems?.length ?? 0, auto: settings?.flashAuto !== false },
    evenings: grid,
    ads,
    messages,
    // heure de l'import, lue dans les prévisions (la date de modification de la fiche change aussi avec un bulletin)
    meteo: { auto: meteo?.autoUpdate !== false, updatedAt: (meteo?.forecast as { updatedAt?: string } | null | undefined)?.updatedAt ?? null },
    missingImages: { videos: videosNoImage, replays: replaysNoImage },
    analyticsId: isMeasurementId(settings?.analytics?.measurementId) ? settings.analytics.measurementId : null,
    recent: recentItems,
    members: members && { ...members, signupOpen: settings?.members?.signupOpen !== false },
  }
}
