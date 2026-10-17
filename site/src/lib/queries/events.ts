// Agenda : requêtes partagées (accueil, page Agenda, fiche événement).
import type { Where } from 'payload'
import { cache } from 'react'
import type { Event } from '@/payload-types'
import { EVENT_CATEGORIES } from '../categories'
import { parisDateTime, parisDay } from '../format'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'

export type EventCategory = NonNullable<Event['category']>

/** Champs utiles aux cartes (sans présentation, programme ni SEO). */
export type EventListItem = Pick<Event, 'id' | 'title' | 'slug' | 'startDate' | 'endDate' | 'city' | 'place' | 'category' | 'poster' | 'isWeekendPick'>
/** Événement mis en avant : avec sa présentation et son programme. */
export type EventFeatureItem = EventListItem & Pick<Event, 'description' | 'program'>

export type EventsPage = { docs: EventListItem[]; page: number; totalPages: number; totalDocs: number }

const LIST_SELECT = {
  title: true,
  slug: true,
  startDate: true,
  endDate: true,
  city: true,
  place: true,
  category: true,
  poster: true,
  isWeekendPick: true,
} as const
const FEATURE_SELECT = { ...LIST_SELECT, description: true, program: true } as const

export const isEventCategory = (value: unknown): value is EventCategory => EVENT_CATEGORIES.some((c) => c.value === value)

/* ----- Périodes (filtre ?quand=) ----- */

export const EVENT_PERIODS = [
  { value: 'week-end', label: 'Ce week-end' },
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'mois', label: 'Ce mois-ci' },
] as const
export type EventPeriod = (typeof EVENT_PERIODS)[number]['value']

export const isEventPeriod = (value: unknown): value is EventPeriod => EVENT_PERIODS.some((p) => p.value === value)

/** Jour civil (AAAA-MM-JJ) décalé de n jours. */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Bornes d'une période en heure de Paris : `from` inclus, `to` exclu.
 * Week-end : samedi et dimanche (celui en cours le week-end) ; semaine : jusqu'au dimanche soir ; mois : jusqu'à la fin du mois.
 */
export function periodRange(period: EventPeriod, now = new Date()): { from: Date; to: Date } {
  const today = parisDay(now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 = dimanche
  let first = today
  let end: string
  if (period === 'week-end') {
    first = weekday === 0 ? addDays(today, -1) : addDays(today, 6 - weekday)
    end = addDays(first, 2)
  } else if (period === 'semaine') {
    end = addDays(today, weekday === 0 ? 1 : 8 - weekday)
  } else {
    const [y, m] = today.split('-').map(Number)
    end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  }
  return { from: parisDateTime(first), to: parisDateTime(end) }
}

/** Début du jour civil de Paris. */
export const parisDayStart = (now = new Date()) => parisDateTime(parisDay(now))

/** À venir ou en cours : fin ≥ maintenant, ou (sans date de fin) début ≥ début du jour à Paris. */
export function upcomingWhere(now = new Date()): Where {
  return {
    or: [
      { endDate: { greater_than_equal: now.toISOString() } },
      { and: [{ endDate: { exists: false } }, { startDate: { greater_than_equal: parisDayStart(now).toISOString() } }] },
    ],
  }
}

/** Événements qui ont lieu (au moins en partie) pendant la période. */
function periodWhere(period: EventPeriod, now: Date): Where {
  const { from, to } = periodRange(period, now)
  return {
    and: [
      { startDate: { less_than: to.toISOString() } },
      {
        or: [
          { endDate: { greater_than_equal: from.toISOString() } },
          { and: [{ endDate: { exists: false } }, { startDate: { greater_than_equal: from.toISOString() } }] },
        ],
      },
    ],
  }
}

/* ----- Requêtes ----- */

async function findEvents(where: Where, limit: number): Promise<EventFeatureItem[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'events', where, sort: 'startDate', limit, depth: 1, pagination: false, select: FEATURE_SELECT })
  return res.docs
}

/** Prochains événements (en cours ou à venir), par date de début ; `excludeId` pour « Autres événements ». */
export async function getUpcomingEvents(limit = 6, excludeId?: number, now = new Date()): Promise<EventListItem[]> {
  return safe(
    async () => {
      const upcoming = upcomingWhere(now)
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'events',
        where: excludeId ? { and: [upcoming, { id: { not_equals: excludeId } }] } : upcoming,
        sort: 'startDate',
        limit,
        depth: 1,
        pagination: false,
        select: LIST_SELECT,
      })
      return res.docs
    },
    [],
    'prochains événements',
  )
}

/** Section de l'accueil : la prochaine « sortie du week-end » (sinon le prochain événement) et les suivants. */
export type AgendaHighlights = { feature: EventFeatureItem | null; others: EventFeatureItem[] }

export const getAgendaHighlights = cache(
  async (count = 4): Promise<AgendaHighlights> =>
    safe<AgendaHighlights>(
      async () => {
        const upcoming = upcomingWhere()
        const [picked, next] = await Promise.all([findEvents({ and: [upcoming, { isWeekendPick: { equals: true } }] }, 1), findEvents(upcoming, count + 1)])
        const feature: EventFeatureItem | null = picked.at(0) ?? next.at(0) ?? null
        return { feature, others: next.filter((e) => e.id !== feature?.id).slice(0, count) }
      },
      { feature: null, others: [] },
      'agenda de l’accueil',
    ),
)

/** Page de l'agenda : événements à venir, filtrés par catégorie et par période. */
export async function getAgendaPage({
  category,
  period,
  page = 1,
  limit = 24,
  now = new Date(),
}: {
  category?: EventCategory | null
  period?: EventPeriod | null
  page?: number
  limit?: number
  now?: Date
}): Promise<EventsPage> {
  return safe(
    async () => {
      const and: Where[] = [upcomingWhere(now)]
      if (category) and.push({ category: { equals: category } })
      if (period) and.push(periodWhere(period, now))
      const payload = await getPayloadClient()
      const res = await payload.find({ collection: 'events', where: { and }, sort: 'startDate', page, limit, depth: 1, select: LIST_SELECT })
      return { docs: res.docs, page: res.page ?? page, totalPages: res.totalPages, totalDocs: res.totalDocs }
    },
    { docs: [], page, totalPages: 0, totalDocs: 0 },
    'page de l’agenda',
  )
}

/** Catégories représentées parmi les événements à venir (filtres utiles uniquement), dans l'ordre de l'administration. */
export async function getUpcomingCategories(now = new Date()): Promise<EventCategory[]> {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({ collection: 'events', where: upcomingWhere(now), limit: 500, depth: 0, pagination: false, select: { category: true } })
      const present = new Set(res.docs.map((d) => d.category))
      return EVENT_CATEGORIES.map((c) => c.value).filter((c) => present.has(c))
    },
    [],
    'catégories de l’agenda',
  )
}

/** Fiche événement (mise en cache pour la durée d'un rendu : métadonnées + page). */
export const getEventBySlug = cache(
  async (slug: string): Promise<Event | null> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const res = await payload.find({ collection: 'events', where: { slug: { equals: slug } }, limit: 1, depth: 1, pagination: false })
        return res.docs[0] ?? null
      },
      null,
      'événement',
    ),
)
