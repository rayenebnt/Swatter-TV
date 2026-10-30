// Vidéos : requêtes partagées (accueil, page Vidéos, fiche vidéo, recherche éventuelle).
import type { Where } from 'payload'
import { cache } from 'react'
import type { Video } from '@/payload-types'
import { VIDEO_CATEGORIES } from '../categories'
import { getPayloadClient, isPreview } from '../payload'
import { safe } from '../safe'

export type VideoCategory = Video['category']

/** Champs utiles aux cartes et rails (sans la source vidéo ; avec l'aperçu animé, dont seule l'adresse sert). */
export type VideoListItem = Pick<Video, 'id' | 'title' | 'slug' | 'category' | 'duration' | 'thumbnail' | 'preview' | 'description' | 'publishedAt' | 'top10Rank' | 'views'>

export type VideosPage = { docs: VideoListItem[]; page: number; totalPages: number; totalDocs: number }

const LIST_SELECT = {
  title: true,
  slug: true,
  category: true,
  duration: true,
  thumbnail: true,
  preview: true,
  description: true,
  publishedAt: true,
  top10Rank: true,
  views: true,
} as const

export const isVideoCategory = (value: unknown): value is VideoCategory => VIDEO_CATEGORIES.some((c) => c.value === value)

/** Vidéos publiées (date de publication passée), avec un filtre facultatif : une vidéo programmée n'apparaît qu'à sa date. */
const published = (where?: Where): Where => ({
  and: [{ publishedAt: { less_than_equal: new Date().toISOString() } }, ...(where ? [where] : [])],
})

async function findVideos(where: Where | undefined, sort: string | string[], limit: number): Promise<VideoListItem[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'videos', where: published(where), sort, limit, depth: 1, pagination: false, select: LIST_SELECT })
  return res.docs
}

/**
 * Top 10 : chaque vidéo classée à la place saisie dans l'administration (une place vide est complétée par les vidéos
 * les plus vues, puis les plus récentes). Deux vidéos à la même place (ancienne saisie) : la plus récemment modifiée
 * la garde, l'autre prend la place libre suivante.
 */
export async function getTop10(): Promise<VideoListItem[]> {
  return safe(
    async () => {
      const ranked = await findVideos({ top10Rank: { exists: true } }, ['top10Rank', '-updatedAt'], 20)
      const slots: (VideoListItem | undefined)[] = Array.from({ length: 10 })
      for (const video of ranked) {
        let i = Math.min(Math.max(video.top10Rank ?? 10, 1), 10) - 1
        while (i < 10 && slots[i]) i++
        if (i < 10) slots[i] = video
      }
      const placed = slots.filter((v): v is VideoListItem => Boolean(v))
      const free = 10 - placed.length
      const fill = free ? await findVideos(placed.length ? { id: { not_in: placed.map((v) => v.id) } } : undefined, ['-views', '-publishedAt'], free) : []
      let next = 0
      return slots.map((v) => v ?? fill[next++]).filter((v): v is VideoListItem => Boolean(v))
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
        where: published(category ? { category: { equals: category } } : undefined),
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
      const res = await payload.findDistinct({ collection: 'videos', field: 'category', where: published() })
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
      // en aperçu, une vidéo programmée (date à venir) se prévisualise aussi
      const bySlug: Where = { slug: { equals: slug } }
      const res = await payload.find({ collection: 'videos', where: (await isPreview()) ? bySlug : published(bySlug), depth: 1, limit: 1, pagination: false })
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
