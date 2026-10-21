// Semaines et journées de la grille des programmes, partagées par l'outil de l'administration (client) et la recopie (serveur).
import type { Where } from 'payload'
import { shiftDay, tvDay, tvDayStart } from '@/components/programme/model'
import { formatDayLong, parisDateTime, parisDay } from './format'
import { TIMEZONE } from './site'

/** Lundi (AAAA-MM-JJ) de la semaine contenant ce jour. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = dimanche
  return shiftDay(day, -((weekday + 6) % 7))
}

/** Lundi de la semaine TV en cours. */
export const currentMonday = (now = new Date()) => mondayOf(tvDay(now))

/**
 * Bornes d'une plage de journées TV, en ISO : du jour `first` à 2 h au jour `first + days` à 2 h (la nuit appartient à la
 * veille, comme sur la grille du site), avec la même coupure que `tvDay` les nuits de changement d'heure.
 */
function rangeBounds(first: string, days: number): { from: string; to: string } {
  return { from: tvDayStart(first).toISOString(), to: tvDayStart(shiftDay(first, days)).toISOString() }
}

/** Filtre des créneaux d'une plage de journées, au format du filtre de la liste de l'administration (« ou » → « et »). */
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

/** Plage affichée par un filtre créé par rangeWhere : une journée ou une semaine (null pour tout autre filtre). */
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
  const [, firstMonth] = first.match(/\d+ (.+)$/) ?? []
  const [, lastMonth] = last.match(/\d+ (.+)$/) ?? []
  return `du ${firstMonth === lastMonth ? first.replace(` ${firstMonth}`, '') : first} au ${last}`
}

/** « semaine du lundi 12 au dimanche 18 octobre » ou « journée du samedi 24 octobre » */
export const rangeLabel = (first: string, days: number) => (days === 7 ? `semaine ${weekLabel(first)}` : `journée du ${dayLabel(first)}`)

const wallTime = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Même jour de la semaine et même heure de Paris, sept jours plus tard (changements d'heure compris). */
export function nextWeekSameTime(startsAt: string | Date): Date {
  const date = new Date(startsAt)
  return parisDateTime(shiftDay(parisDay(date), 7), wallTime.format(date))
}
