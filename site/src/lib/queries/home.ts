// Haut de l'accueil : requêtes du carrousel (diapositives par défaut), du flash info et de « À la une ».
import { cache } from 'react'
import type { Where } from 'payload'
import type { Article, Event, Media, Video } from '@/payload-types'
import { eveningOf, eveningWindow, shiftDay } from '../broadcast'
import { parisDateTime } from '../format'
import { eveningLabel } from '../on-air'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'
import { toSlot, type Slot } from './schedule'

/* ----- Vidéo du jour ----- */

export type HomeVideo = Pick<Video, 'id' | 'title' | 'slug' | 'category' | 'duration' | 'thumbnail' | 'preview' | 'publishedAt' | 'isVideoOfDay'>

/** Vidéo du jour la plus récente ; à défaut, la dernière vidéo publiée. */
export const getVideoOfDay = cache(
  async (): Promise<HomeVideo | null> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const published: Where = { publishedAt: { less_than_equal: new Date().toISOString() } }
        const find = (where: Where) =>
          payload.find({
            collection: 'videos',
            where,
            sort: '-publishedAt',
            limit: 1,
            depth: 1,
            pagination: false,
            select: { title: true, slug: true, category: true, duration: true, thumbnail: true, preview: true, publishedAt: true, isVideoOfDay: true },
          })
        const picked = await find({ and: [published, { isVideoOfDay: { equals: true } }] })
        const doc = picked.docs[0] ?? (await find(published)).docs[0]
        return doc ?? null
      },
      null,
      'vidéo du jour',
    ),
)

/* ----- Sortie du week-end ----- */

export type HomeEvent = Pick<Event, 'id' | 'title' | 'slug' | 'startDate' | 'endDate' | 'city' | 'poster' | 'description' | 'isWeekendPick'>

/** Sortie du week-end à venir (ou en cours) ; à défaut, le prochain événement de l'agenda. */
export const getWeekendEvent = cache(
  async (): Promise<HomeEvent | null> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const now = new Date().toISOString()
        const find = (where: Where) =>
          payload.find({
            collection: 'events',
            where,
            sort: 'startDate',
            limit: 1,
            depth: 1,
            pagination: false,
            select: { title: true, slug: true, startDate: true, endDate: true, city: true, poster: true, description: true, isWeekendPick: true },
          })
        const picked = await find({
          and: [{ isWeekendPick: { equals: true } }, { or: [{ startDate: { greater_than_equal: now } }, { endDate: { greater_than_equal: now } }] }],
        })
        const doc = picked.docs[0] ?? (await find({ startDate: { greater_than_equal: now } })).docs[0]
        return doc ?? null
      },
      null,
      'sortie du week-end',
    ),
)

/* ----- Info du jour et flash info ----- */

export type HomeArticle = Pick<Article, 'id' | 'title' | 'slug' | 'department' | 'city' | 'kicker' | 'image' | 'publishedAt' | 'isInfoOfDay'>

/** Info du jour la plus récente ; à défaut, le dernier article publié. */
export const getInfoOfDay = cache(
  async (): Promise<HomeArticle | null> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const published: Where = { publishedAt: { less_than_equal: new Date().toISOString() } }
        const find = (where: Where) =>
          payload.find({
            collection: 'articles',
            where,
            sort: '-publishedAt',
            limit: 1,
            depth: 1,
            pagination: false,
            select: { title: true, slug: true, department: true, city: true, kicker: true, image: true, publishedAt: true, isInfoOfDay: true },
          })
        const picked = await find({ and: [published, { isInfoOfDay: { equals: true } }] })
        const doc = picked.docs[0] ?? (await find(published)).docs[0]
        return doc ?? null
      },
      null,
      'info du jour',
    ),
)

export type FlashArticle = Pick<Article, 'id' | 'title' | 'slug' | 'department' | 'city' | 'kicker'>

/** Derniers articles publiés (complément automatique du flash info). */
export async function getFlashArticles(limit = 6): Promise<FlashArticle[]> {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'articles',
        where: { publishedAt: { less_than_equal: new Date().toISOString() } },
        sort: '-publishedAt',
        limit,
        depth: 0,
        pagination: false,
        select: { title: true, slug: true, department: true, city: true, kicker: true },
      })
      return res.docs
    },
    [],
    'flash info',
  )
}

/* ----- Programme de soirée (diapositive par défaut du carrousel) ----- */

export type EveningProgram = {
  slot: Slot
  /** Image de l'émission (objet média complet, pour la taille « hero ») */
  image: Media | null
  /** Soirée du créneau (AAAA-MM-JJ, jour où elle commence) */
  day: string
  /** « Ce soir », « Demain soir », ou entre 0 h et 0 h 30 le nom du jour (« Samedi soir ») : voir eveningLabel */
  when: string
}

// Genres trop courts ou récurrents pour être mis en avant en soirée
const SKIPPED_GENRES = new Set(['info', 'meteo'])
/** Début du « prime time » mis en avant (heure de Paris) ; la soirée finit avec l'antenne, à 0 h 30. */
const PRIME_TIME = '20:00'

/**
 * Prochaine émission de soirée (début entre 20 h et la fin de l'antenne à 0 h 30, heure de Paris) : la soirée en cours
 * ou à venir (eveningOf : jusqu'à 0 h 30, celle de la veille), sinon la suivante. Les journaux, la météo et les créneaux
 * de moins de 25 min sont ignorés, comme tout créneau hors antenne.
 */
export async function getEveningProgram(now = new Date()): Promise<EveningProgram | null> {
  return safe(
    async () => {
      const first = eveningOf(now)
      const windows = [first, shiftDay(first, 1)].map((day) => ({ day, from: parisDateTime(day, PRIME_TIME), to: eveningWindow(day).end }))
      const from = new Date(Math.max(now.getTime(), windows[0].from.getTime()))
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'schedule',
        where: { and: [{ startsAt: { greater_than_equal: from.toISOString() } }, { startsAt: { less_than: windows[1].to.toISOString() } }] },
        sort: 'startsAt',
        limit: 60,
        depth: 2,
        pagination: false,
      })
      for (const doc of res.docs) {
        const start = new Date(doc.startsAt).getTime()
        const program = typeof doc.program === 'object' && doc.program ? doc.program : null
        const win = windows.find((w) => start >= w.from.getTime() && start < w.to.getTime())
        if (!win || (doc.durationMinutes || 0) < 25 || (program?.genre && SKIPPED_GENRES.has(program.genre))) continue
        const image = program && typeof program.image === 'object' && program.image ? program.image : null
        return { slot: toSlot(doc), image, day: win.day, when: eveningLabel(win.day, now.getTime()) }
      }
      return null
    },
    null,
    'programme de soirée',
  )
}
