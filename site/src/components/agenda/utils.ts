// Outils de l'agenda (rendu serveur) : libellés de dates en heure de Paris, adresses des listes, visuels de repli.
import type { Event } from '@/payload-types'
import { EVENT_CATEGORIES, labelOf } from '@/lib/categories'
import { dateChip, formatDate, formatDayLong, formatTime, parisDateTime, parisDay } from '@/lib/format'
import { parisDayStart, type EventCategory, type EventPeriod } from '@/lib/queries/events'

type Dates = Pick<Event, 'startDate' | 'endDate'>
export type EventStatus = 'upcoming' | 'ongoing' | 'past'

const VISUALS = ['t-ete-a', 't-crepuscule-a', 't-matin-a', 't-alpenglow-a', 't-hiver-a', 't-nuages-a', 't-ete-b', 't-crepuscule-b', 't-matin-b', 't-alpenglow-b']

/** Visuel de la maquette pour un événement sans affiche (choix stable d'après l'identifiant). */
export const eventVisual = (id: number) => `/visuels/${VISUALS[Math.abs(id) % VISUALS.length]}.webp`

/** Visuel de partage des pages de liste. */
export const AGENDA_VISUAL = '/visuels/t-crepuscule-a.webp'

/** Espaces insécables de la typographie française (avant : ; ! ? » et après «) dans les textes saisis. */
export const frenchSpaces = (s: string) => s.replace(/ (?=[:;!?»])/g, '\u00a0').replace(/« /g, '«\u00a0')

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** « dimanche 1 novembre » → « dimanche 1er novembre » */
const premier = (s: string) => s.replace(/(^|\s)1(?=\s)/, '$11er')

/** Sur-titre d'une carte : la catégorie, ou « Sortie » pour « Autre ». */
export const eventKicker = (category?: Event['category']) => (category && category !== 'autre' ? labelOf(EVENT_CATEGORIES, category) : 'Sortie')

/** Libellé d'une catégorie dans les filtres. */
export const categoryFilterLabel = (c: EventCategory) => (c === 'autre' ? 'Autres sorties' : labelOf(EVENT_CATEGORIES, c))

/* ----- Dates ----- */

/** Dernier jour (Paris) : une fin à minuit pile appartient à la veille. */
const lastDayOf = (e: Dates) => (e.endDate ? parisDay(new Date(Date.parse(e.endDate) - 1)) : parisDay(e.startDate))

export const isMultiDay = (e: Dates) => lastDayOf(e) > parisDay(e.startDate)

/** Heure « 20:30 », ou null à minuit (journée entière). */
const timeOf = (d: string) => {
  const t = formatTime(d)
  return t === '00:00' ? null : t
}

/** Passé, en cours ou à venir (même règle que la liste des événements à venir). */
export function eventStatus(e: Dates, now: Date): EventStatus {
  const t = now.getTime()
  if (e.endDate) {
    if (Date.parse(e.endDate) < t) return 'past'
    return Date.parse(e.startDate) <= t ? 'ongoing' : 'upcoming'
  }
  return Date.parse(e.startDate) < parisDayStart(now).getTime() ? 'past' : 'upcoming'
}

/** Pastille de date (début) et sa version lisible. */
export function chipOf(e: Dates) {
  return { ...dateChip(e.startDate), iso: parisDay(e.startDate), spoken: premier(formatDayLong(e.startDate)) }
}

/** « De 10:30 à 18:00 », « À 20:00 », « Toute la journée » (un seul jour) ; pour plusieurs jours, horaires de début et de fin. */
export function timeLabel(e: Dates): string | null {
  const start = timeOf(e.startDate)
  const end = e.endDate ? timeOf(e.endDate) : null
  if (isMultiDay(e)) {
    if (start && end) return `Début à ${start}, fin à ${end}`
    return start ? `Début à ${start}` : end ? `Fin à ${end}` : null
  }
  if (start && end && end !== start) return `De ${start} à ${end}`
  if (start) return `À ${start}`
  return 'Toute la journée'
}

/** « Samedi 17 octobre (2026) » ou « Du vendredi 23 au dimanche 25 octobre (2026) ». */
export function dateLabel(e: Dates, withYear = false): string {
  const startDay = parisDay(e.startDate)
  const endDay = lastDayOf(e)
  const year = (d: string) => (withYear ? ` ${d.slice(0, 4)}` : '')
  const long = (d: string) => premier(formatDayLong(parisDateTime(d)))
  if (endDay <= startDay) return cap(`${long(startDay)}${year(startDay)}`)
  const sameYear = startDay.slice(0, 4) === endDay.slice(0, 4)
  const sameMonth = sameYear && startDay.slice(0, 7) === endDay.slice(0, 7)
  // « vendredi 23 » (sans le mois) quand le mois est commun
  const from = sameMonth ? long(startDay).split(' ').slice(0, 2).join(' ') : `${long(startDay)}${sameYear ? '' : ` ${startDay.slice(0, 4)}`}`
  return `Du ${from} au ${long(endDay)}${sameYear ? year(endDay) : ` ${endDay.slice(0, 4)}`}`
}

/** Version courte pour les cartes : « Sam. 17 oct. · 10:30 », « Du 23 au 25 oct. », « Jusqu'au 16 nov. » (en cours). */
export function shortWhen(e: Dates, status: EventStatus): string {
  const short = (d: string) => {
    const c = dateChip(parisDateTime(d))
    return { day: c.day === '1' ? '1er' : c.day, month: c.month.toLowerCase(), weekday: c.weekday }
  }
  const startDay = parisDay(e.startDate)
  if (!isMultiDay(e)) {
    const s = short(startDay)
    const t = timeOf(e.startDate)
    return `${s.weekday} ${s.day} ${s.month}${t ? ` · ${t}` : ''}`
  }
  const end = short(lastDayOf(e))
  if (status === 'ongoing') return `Jusqu’au ${end.day} ${end.month}`
  const start = short(startDay)
  return start.month === end.month ? `Du ${start.day} au ${end.day} ${end.month}` : `Du ${start.day} ${start.month} au ${end.day} ${end.month}`
}

/** « Jusqu'au 25 oct. » pour un événement sur plusieurs jours, sinon null. */
export function untilLabel(e: Dates): string | null {
  if (!isMultiDay(e)) return null
  const c = dateChip(parisDateTime(lastDayOf(e)))
  return `jusqu’au ${c.day === '1' ? '1er' : c.day} ${c.month.toLowerCase()}`
}

/** Mois d'un jour « AAAA-MM » : « Octobre 2026 ». */
export const monthLabel = (month: string) => cap(formatDate(parisDateTime(`${month}-15`)).replace(/^\d+\s/, ''))

/** Date ISO 8601 avec le décalage de Paris (« 2026-10-17T10:30:00+02:00 ») pour les données structurées. */
export function parisIso(value: string | Date): string {
  const d = new Date(value)
  const day = parisDay(d)
  const time = formatTime(d)
  const minute = d.getTime() - (d.getTime() % 60_000)
  const offset = Math.round((Date.parse(`${day}T${time}:00Z`) - minute) / 60_000)
  const abs = Math.abs(offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day}T${time}:${pad(d.getUTCSeconds())}${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** Description découpée en paragraphes (lignes vides). */
export const paragraphs = (text?: string | null) =>
  (text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

/** Lien externe sûr (http ou https uniquement). */
export function httpUrl(url?: string | null): string | null {
  const u = url?.trim()
  if (!u) return null
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}

/* ----- Adresses ----- */

/** Liste de l'agenda : ?categorie=, ?quand= et ?page=. */
export function agendaUrl({ category, period, page = 1 }: { category?: EventCategory | null; period?: EventPeriod | null; page?: number } = {}): string {
  const q = new URLSearchParams()
  if (category) q.set('categorie', category)
  if (period) q.set('quand', period)
  if (page > 1) q.set('page', String(page))
  const s = q.toString()
  return s ? `/agenda?${s}` : '/agenda'
}
