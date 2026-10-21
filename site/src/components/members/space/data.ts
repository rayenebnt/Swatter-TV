// « Mon espace » : lecture de l'historique et de « Ma liste » du membre connecté (côté serveur), prêts à afficher.
import config from '@payload-config'
import { getPayload } from 'payload'
import { formatDate, formatDayLong, formatTime, parisDay, timeAgo } from '@/lib/format'
import { loadItems } from '@/lib/members/items'
import type { FavoriteKind } from '@/lib/members/shared'
import type { Member } from '@/payload-types'
import type { HistoryGroup, SpaceEntry } from './types'

type Row = { kind: FavoriteKind; itemId: number; at: string }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Accord du participe : « la vidéo regardée », « le replay regardé », « l'article ajouté »… */
const agree = (kind: FavoriteKind, word: string) => `${word}${kind === 'video' ? 'e' : ''}`
/**
 * Lignes du membre (et de lui seul : filtre sur son numéro, lecture sans les règles d'accès de l'équipe), les plus
 * récentes d'abord, avec le nombre total de lignes.
 */
async function rowsOf(member: Member, list: 'history' | 'favorites', limit: number): Promise<{ rows: Row[]; total: number }> {
  const payload = await getPayload({ config })
  const where = { member: { equals: member.id } }
  if (list === 'history') {
    const res = await payload.find({
      collection: 'member-history',
      where,
      sort: '-watchedAt',
      limit,
      depth: 0,
      overrideAccess: true,
      select: { kind: true, itemId: true, watchedAt: true },
    })
    return { rows: res.docs.map((d) => ({ kind: d.kind, itemId: d.itemId, at: d.watchedAt })), total: res.totalDocs }
  }
  const res = await payload.find({
    collection: 'member-favorites',
    where,
    sort: '-savedAt',
    limit,
    depth: 0,
    overrideAccess: true,
    select: { kind: true, itemId: true, savedAt: true },
  })
  return { rows: res.docs.map((d) => ({ kind: d.kind, itemId: d.itemId, at: d.savedAt })), total: res.totalDocs }
}

/**
 * Entrées de l'historique (`history`) ou de « Ma liste » (`favorites`) dont le contenu est encore visible du public
 * (les contenus retirés du site sont simplement absents). On lit `scan` lignes pour en garder `show` affichables.
 */
async function entriesOf(
  member: Member,
  list: 'history' | 'favorites',
  { scan, show = scan, note }: { scan: number; show?: number; note: (row: Row) => string },
): Promise<{ entries: SpaceEntry[]; total: number }> {
  const { rows, total } = await rowsOf(member, list, scan)
  if (!rows.length) return { entries: [], total }
  const payload = await getPayload({ config })
  const items = await loadItems(payload, rows)
  const entries: SpaceEntry[] = []
  for (const row of rows) {
    const key = `${row.kind}:${row.itemId}`
    const item = items.get(key)
    if (item) entries.push({ key, item, at: new Date(row.at).toISOString(), note: note(row) })
    if (entries.length >= show) break
  }
  return { entries, total }
}

/** « Regardée il y a 3 h », « Regardé hier », « Regardée le 17 octobre 2026 » (tableau de bord). */
function watchedAgo(row: Row): string {
  const ago = timeAgo(row.at)
  const done = agree(row.kind, 'Regardé')
  return /^\d/.test(ago) ? `${done} le ${ago}` : `${done} ${ago.charAt(0).toLowerCase()}${ago.slice(1)}`
}

const watchedAt = (row: Row) => `${agree(row.kind, 'Regardé')} à ${formatTime(row.at)}`
const savedOn = (row: Row) => `${agree(row.kind, 'Ajouté')} le ${formatDate(row.at)}`

/** Dernières vidéos regardées encore en ligne (tableau de bord : bloc « Reprendre »). */
export const recentHistory = (member: Member, show: number) => entriesOf(member, 'history', { scan: show * 3, show, note: watchedAgo })

/** Derniers contenus gardés encore en ligne (tableau de bord : bloc « Ma liste »). */
export const recentFavorites = (member: Member, show: number) => entriesOf(member, 'favorites', { scan: show * 3, show, note: savedOn })

/** Toute « Ma liste » (500 contenus au plus). */
export const allFavorites = (member: Member) => entriesOf(member, 'favorites', { scan: 500, note: savedOn })

/** Jour civil (AAAA-MM-JJ) décalé de n jours. */
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Tout l'historique (200 entrées au plus), regroupé par jour de visionnage (heure de Paris), du plus récent au plus ancien. */
export async function historyByDay(member: Member): Promise<{ groups: HistoryGroup[]; total: number }> {
  const { entries, total } = await entriesOf(member, 'history', { scan: 200, note: watchedAt })
  const today = parisDay()
  const yesterday = shiftDay(today, -1)
  const groups: HistoryGroup[] = []
  for (const entry of entries) {
    const day = parisDay(entry.at)
    let group = groups.at(-1)
    if (!group || group.day !== day) {
      const long = cap(formatDayLong(entry.at))
      const label = day === today ? 'Aujourd’hui' : day === yesterday ? 'Hier' : day.slice(0, 4) === today.slice(0, 4) ? long : `${long} ${day.slice(0, 4)}`
      group = { day, label, entries: [] }
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return { groups, total }
}
