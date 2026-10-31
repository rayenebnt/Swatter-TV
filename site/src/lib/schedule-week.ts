// Semaines et soirées de la grille des programmes, partagées par l'outil de l'administration (client), la recopie et le
// tableau de bord (serveur). La chaîne diffuse tous les jours de 18 h à 0 h 30 (src/lib/broadcast.ts) : une soirée est
// rangée au jour où elle commence ; ses créneaux de 0 h à 0 h 30 sont datés du lendemain.
import type { Where } from 'payload'
import { shiftDay, tvDay, tvDayStart } from '@/components/programme/model'
import { BROADCAST_MINUTES, broadcastEvening, eveningWindow } from './broadcast'
import { dateChip, formatDayLong, formatTime, parisDateTime, parisDay } from './format'
import { TIMEZONE } from './site'

/** Lundi (AAAA-MM-JJ) de la semaine contenant ce jour. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = dimanche
  return shiftDay(day, -((weekday + 6) % 7))
}

/** Lundi de la semaine TV en cours : jusqu'au lundi 0 h 30, la soirée du dimanche (et donc sa semaine) est encore en cours. */
export const currentMonday = (now = new Date()) => mondayOf(tvDay(now))

/**
 * Bornes d'une plage de journées TV, en ISO : du jour `first` à 0 h 30 au jour `first + days` à 0 h 30 (tvDayStart, la
 * coupure de la grille du site). Chaque journée TV contient sa soirée entière (18 h → 0 h 30 le lendemain, créneaux de
 * 0 h à 0 h 30 datés du lendemain compris). Bornes larges, et non 18 h → 0 h 30 : la liste de l'administration montre
 * aussi les anciens créneaux hors antenne (6 h, 12 h…), pour qu'on puisse les corriger ou les supprimer. 0 h 30 n'est
 * jamais ambiguë : les changements d'heure ont lieu à 2 h / 3 h.
 */
function rangeBounds(first: string, days: number): { from: string; to: string } {
  return { from: tvDayStart(first).toISOString(), to: tvDayStart(shiftDay(first, days)).toISOString() }
}

/** Filtre des créneaux d'une plage de soirées, au format du filtre de la liste de l'administration (« ou » → « et »). */
export function rangeWhere(first: string, days: number): Where {
  const { from, to } = rangeBounds(first, days)
  return { or: [{ and: [{ startsAt: { greater_than_equal: from } }, { startsAt: { less_than: to } }] }] }
}

/** Adresse de la liste de la grille filtrée sur une plage (lien depuis le tableau de bord). */
export function rangeSearch(first: string, days: number): string {
  const { from, to } = rangeBounds(first, days)
  const params = new URLSearchParams()
  params.set('where[or][0][and][0][startsAt][greater_than_equal]', from)
  params.set('where[or][0][and][1][startsAt][less_than]', to)
  return `?${params}`
}

/**
 * Plage affichée par un filtre créé par rangeWhere : une soirée ou une semaine (null pour tout autre filtre, dont une
 * adresse enregistrée avant le passage aux soirées, bornée à 2 h : l'outil propose alors de revenir à la semaine en cours).
 */
export function rangeFromWhere(where: Where | undefined): { first: string; days: 1 | 7 } | null {
  const and = (where?.or as Where[] | undefined)?.[0]?.and as Where[] | undefined
  const from = (and?.[0]?.startsAt as { greater_than_equal?: string } | undefined)?.greater_than_equal
  const to = (and?.[1]?.startsAt as { less_than?: string } | undefined)?.less_than
  if (and?.length !== 2 || !from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null
  const first = parisDay(new Date(from))
  for (const days of [1, 7] as const) {
    const bounds = rangeBounds(first, days)
    if (bounds.from === new Date(from).toISOString() && bounds.to === new Date(to).toISOString()) {
      return days === 7 && mondayOf(first) !== first ? null : { first, days }
    }
  }
  return null
}

const noon = (day: string) => parisDateTime(day, '12:00')

/** « samedi 24 octobre » */
export const dayLabel = (day: string) => formatDayLong(noon(day))

/** « du lundi 12 au dimanche 18 octobre » */
export function weekLabel(monday: string): string {
  const first = dayLabel(monday)
  const last = dayLabel(shiftDay(monday, 6))
  const [, firstMonth] = first.match(/\d+(?:er)? (.+)$/) ?? []
  const [, lastMonth] = last.match(/\d+(?:er)? (.+)$/) ?? []
  return `du ${firstMonth === lastMonth ? first.replace(` ${firstMonth}`, '') : first} au ${last}`
}

/** « soirées du lundi 12 au dimanche 18 octobre » : la semaine affichée par l'outil de la grille */
export const weekEveningsLabel = (monday: string) => `soirées ${weekLabel(monday)}`

/**
 * « semaine du lundi 12 au dimanche 18 octobre » ou « soirée du samedi 24 octobre » (confirmation et messages de la
 * recopie : « La soirée du samedi 24 octobre ne contient aucun créneau »).
 */
export const rangeLabel = (first: string, days: number) => (days === 7 ? `semaine ${weekLabel(first)}` : `soirée du ${dayLabel(first)}`)

/**
 * Soirée en quelques mots, en minuscules, par rapport à la soirée en cours ou à venir `today` (tvDay) : « ce soir »,
 * « demain soir », « hier soir », sinon « sam. 24 » (tableau de bord).
 */
export function eveningShortLabel(day: string, today: string): string {
  if (day === today) return 'ce soir'
  if (day === shiftDay(today, 1)) return 'demain soir'
  if (day === shiftDay(today, -1)) return 'hier soir'
  const { weekday, day: n } = dateChip(noon(day))
  return `${weekday.toLowerCase()} ${n}`
}

/** « 45 min », « 1 h 15 », « 2 h », « 6 h 30 » */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes - h * 60)
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** Créneau réduit à ce qu'il faut pour mesurer ce qu'il couvre d'une soirée. */
export type SlotSpan = { startsAt: string | Date; durationMinutes?: number | null }

/**
 * Minutes de la soirée `day` (18 h → 0 h 30, 390 min) qu'aucun créneau ne couvre. Chaque créneau est rogné aux bornes de
 * la soirée, comme sur la grille du site (un ancien créneau de 17 h 30 à 18 h 30 couvre 18 h → 18 h 30 ; un créneau de
 * 6 h ne couvre rien) et les chevauchements ne comptent qu'une fois. 390 : soirée vide ; 0 : soirée complète.
 */
export function uncoveredMinutes(day: string, slots: SlotSpan[]): number {
  const { start, end } = eveningWindow(day)
  const from = start.getTime()
  const to = end.getTime()
  const spans = slots
    .map((s): [number, number] => {
      const a = new Date(s.startsAt).getTime()
      return [Math.max(a, from), Math.min(a + (s.durationMinutes ?? 0) * 60_000, to)]
    })
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let covered = 0
  let reach = from
  for (const [a, b] of spans) {
    if (b <= reach) continue
    covered += b - Math.max(a, reach)
    reach = b
  }
  return Math.max(0, BROADCAST_MINUTES - Math.round(covered / 60_000))
}

const shortDateTime = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, dateStyle: 'short' })

/**
 * Date et heure d'un créneau dans son titre de fiche (heure de Paris) : « 21/10/2026 20:30 ». Après minuit (0 h à
 * 0 h 30), le créneau est rattaché à sa soirée, celle de la veille : « Soirée du 20/10/2026, 00:15 » (et non le 21/10,
 * jour où il est saisi, qui laisserait croire à une erreur de jour). Ancien créneau hors antenne : sa date et son heure.
 */
export function slotWhen(startsAt: string | Date): string {
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return ''
  const evening = broadcastEvening(start)
  if (evening && evening !== parisDay(start)) return `Soirée du ${shortDate.format(noon(evening))}, ${formatTime(start)}`
  return shortDateTime.format(start)
}

const wallTime = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/**
 * Même jour de la semaine et même heure de Paris, sept jours plus tard (changements d'heure compris). Une soirée (18 h →
 * 0 h 30) ne croise jamais un changement d'heure (2 h / 3 h) : la copie d'un créneau d'antenne reste à l'antenne.
 */
export function nextWeekSameTime(startsAt: string | Date): Date {
  const date = new Date(startsAt)
  return parisDateTime(shiftDay(parisDay(date), 7), wallTime.format(date))
}
