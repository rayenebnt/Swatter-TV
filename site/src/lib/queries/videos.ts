// Vidéos : requêtes partagées (accueil, page Vidéos, fiche vidéo, recherche éventuelle).
import type { Where } from 'payload'
import { cache } from 'react'
import type { Video } from '@/payload-types'
import { VIDEO_CATEGORIES } from '../categories'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'

export type VideoCategory = Video['category']

/** Champs utiles aux cartes et rails (sans la source vidéo). */
export type VideoListItem = Pick<Video, 'id' | 'title' | 'slug' | 'category' | 'duration' | 'thumbnail' | 'description' | 'publishedAt' | 'top10Rank' | 'views'>

export type VideosPage = { docs: VideoListItem[]; page: number; totalPages: number; totalDocs: number }

const LIST_SELECT = {
  title: true,
  slug: true,
  category: true,
  duration: true,
  thumbnail: true,
  description: true,
  publishedAt: true,
  top10Rank: true,
  views: true,
} as const

export const isVideoCategory = (value: unknown): value is VideoCategory => VIDEO_CATEGORIES.some((c) => c.value === value)

async function findVideos(where: Where | undefined, sort: string, limit: number): Promise<VideoListItem[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'videos', where, sort, limit, depth: 1, pagination: false, select: LIST_SELECT })
  return res.docs
}

/** Top 10 : places 1 à 10 saisies dans l'administration, complétées par les vidéos les plus vues. */
export async function getTop10(): Promise<VideoListItem[]> {
  return safe(
    async () => {
      const ranked = await findVideos({ top10Rank: { exists: true } }, 'top10Rank', 10)
      if (ranked.length >= 10) return ranked
      const ids = ranked.map((v) => v.id)
      const fill = await findVideos(ids.length ? { id: { not_in: ids } } : undefined, '-views', 10 - ranked.length)
      return [...ranked, ...fill]
    },
    [],
    'Top 10',
  )
}

/** Dernières vidéos publiées. */
export async function getLatestVideos(limit = 16): Promise<VideoListItem[]> {
  return safe(() => findVideos(undefined, '-publishedAt', limit), [], 'dernières vidéos')
}

/** Page de la liste des vidéos (filtre facultatif par catégorie). */
export async function getVideosPage({ category, page = 1, limit = 24 }: { category?: VideoCategory | null; page?: number; limit?: number }): Promise<VideosPage> {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'videos',
        where: category ? { category: { equals: category } } : undefined,
        sort: '-publishedAt',
        limit,
        page,
        depth: 1,
        select: LIST_SELECT,
      })
      return { docs: res.docs, page: res.page ?? page, totalPages: res.totalPages, totalDocs: res.totalDocs }
    },
    { docs: [], page, totalPages: 0, totalDocs: 0 },
    'liste des vidéos',
  )
}

/** Catégories qui contiennent au moins une vidéo, dans l'ordre de l'administration. */
export const getVideoCategories = cache(async (): Promise<VideoCategory[]> =>
  safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.findDistinct({ collection: 'videos', field: 'category' })
      const present = new Set<unknown>(res.values.map((v) => v.category))
      return VIDEO_CATEGORIES.map((c) => c.value).filter((c) => present.has(c))
    },
    [],
    'catégories de vidéos',
  ),
)

/** Vidéo complète (source comprise) d'après son adresse. Mise en cache pour la durée d'un rendu (métadonnées + page). */
export const getVideoBySlug = cache(async (slug: string): Promise<Video | null> =>
  safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({ collection: 'videos', where: { slug: { equals: slug } }, depth: 1, limit: 1, pagination: false })
      return res.docs[0] ?? null
    },
    null,
    'vidéo',
  ),
)

/** Vidéos de la même catégorie (hors vidéo courante). */
export async function getRelatedVideos(video: Pick<Video, 'id' | 'category'>, limit = 12): Promise<VideoListItem[]> {
  return safe(
    () => findVideos({ and: [{ category: { equals: video.category } }, { id: { not_equals: video.id } }] }, '-publishedAt', limit),
    [],
    'vidéos associées',
  )
}

/** Dernières vidéos hors vidéo courante (repli quand la catégorie ne contient qu'elle). */
export async function getOtherVideos(excludeId: number, limit = 12): Promise<VideoListItem[]> {
  return safe(() => findVideos({ id: { not_equals: excludeId } }, '-publishedAt', limit), [], 'autres vidéos')
}
