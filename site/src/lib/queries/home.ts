// Haut de l'accueil : requêtes du carrousel (diapositives par défaut), du flash info et de « À la une ».
import { cache } from 'react'
import type { Where } from 'payload'
import type { Article, Event, Media, Video } from '@/payload-types'
import { parisDateTime, parisDay } from '../format'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'
import { toSlot, type Slot } from './schedule'

const DAY_MS = 24 * 60 * 60 * 1000

/* ----- Vidéo du jour ----- */

export type HomeVideo = Pick<Video, 'id' | 'title' | 'slug' | 'category' | 'duration' | 'thumbnail' | 'publishedAt' | 'isVideoOfDay'>

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
            select: { title: true, slug: true, category: true, duration: true, thumbnail: true, publishedAt: true, isVideoOfDay: true },
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
  /** true : ce soir ; false : demain soir */
  tonight: boolean
}

// Genres trop courts ou récurrents pour être mis en avant en soirée
const SKIPPED_GENRES = new Set(['info', 'meteo'])

/**
 * Prochaine émission de soirée (début entre 20 h et minuit, heure de Paris) : ce soir, sinon demain soir.
 * Les journaux, la météo et les créneaux de moins de 25 min sont ignorés.
 */
export async function getEveningProgram(now = new Date()): Promise<EveningProgram | null> {
  return safe(
    async () => {
      const today = parisDay(now)
      const dayAt = (offset: number) => parisDay(new Date(parisDateTime(today, '12:00').getTime() + offset * DAY_MS))
      const tomorrow = dayAt(1)
      const windows = [
        [parisDateTime(today, '20:00'), parisDateTime(tomorrow)],
        [parisDateTime(tomorrow, '20:00'), parisDateTime(dayAt(2))],
      ] as const
      const from = new Date(Math.max(now.getTime(), windows[0][0].getTime()))
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'schedule',
        where: { and: [{ startsAt: { greater_than_equal: from.toISOString() } }, { startsAt: { less_than: windows[1][1].toISOString() } }] },
        sort: 'startsAt',
        limit: 60,
        depth: 2,
        pagination: false,
      })
      for (const doc of res.docs) {
        const start = new Date(doc.startsAt).getTime()
        const program = typeof doc.program === 'object' && doc.program ? doc.program : null
        const inWindow = windows.some(([a, b]) => start >= a.getTime() && start < b.getTime())
        if (!inWindow || (doc.durationMinutes || 0) < 25 || (program?.genre && SKIPPED_GENRES.has(program.genre))) continue
        const image = program && typeof program.image === 'object' && program.image ? program.image : null
        return { slot: toSlot(doc), image, tonight: start < windows[0][1].getTime() }
      }
      return null
    },
    null,
    'programme de soirée',
  )
}
