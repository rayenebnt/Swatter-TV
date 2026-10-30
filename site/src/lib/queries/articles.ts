// L'Info : requêtes des articles (section de l'accueil, pages Info, fiches article).
import { cache } from 'react'
import type { Where } from 'payload'
import type { Article } from '@/payload-types'
import { INFO_ZONES, type InfoZone } from '../departments'
import { getPayloadClient, isPreview } from '../payload'
import { safe } from '../safe'

const HOUR_MS = 60 * 60 * 1000
/** Ordre des listes : du plus récent au plus ancien (l'identifiant départage les dates égales, pour une pagination stable). */
const SORT = ['-publishedAt', '-id']

/** Champs utiles aux listes (cartes, fil « En continu »). */
export type ArticleListItem = Pick<
  Article,
  'id' | 'title' | 'slug' | 'excerpt' | 'department' | 'city' | 'kicker' | 'image' | 'publishedAt' | 'updatedAt' | 'isInfoOfDay'
>

const LIST_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  department: true,
  city: true,
  kicker: true,
  image: true,
  publishedAt: true,
  updatedAt: true,
  isInfoOfDay: true,
} as const

export type ArticlesPage = { docs: ArticleListItem[]; totalDocs: number; totalPages: number; page: number }

/** Articles publiés (date de publication passée), éventuellement d'un département (ou d'« Autres régions »), avec des conditions en plus. */
function published(department: InfoZone | null, ...extra: Where[]): Where {
  return {
    and: [{ publishedAt: { less_than_equal: new Date().toISOString() } }, ...(department ? [{ department: { equals: department } }] : []), ...extra],
  }
}

/** Derniers articles publiés de la région (ou d'un département), sans ceux de `exclude`. */
export async function getLatestArticles(limit = 30, department: InfoZone | null = null, exclude: number[] = []): Promise<ArticleListItem[]> {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'articles',
        where: published(department, ...(exclude.length ? [{ id: { not_in: exclude } }] : [])),
        sort: SORT,
        limit,
        depth: 1,
        pagination: false,
        select: LIST_SELECT,
      })
      return res.docs
    },
    [],
    'derniers articles',
  )
}

/** Une page de la liste des articles (région ou département), sans l'article mis à la une. */
export const getArticlesPage = cache(
  async (department: InfoZone | null, page: number, limit: number, excludeId: number | null): Promise<ArticlesPage> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const res = await payload.find({
          collection: 'articles',
          where: published(department, ...(excludeId ? [{ id: { not_equals: excludeId } }] : [])),
          sort: SORT,
          limit,
          page,
          depth: 1,
          select: LIST_SELECT,
        })
        return { docs: res.docs, totalDocs: res.totalDocs, totalPages: res.totalPages, page }
      },
      { docs: [], totalDocs: 0, totalPages: 0, page },
      'liste des articles',
    ),
)

/** Article « À la une » : l'info du jour récente (48 h) de la région ou du département, sinon le dernier article publié. */
export const getFeaturedArticle = cache(
  async (department: InfoZone | null): Promise<ArticleListItem | null> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const find = (where: Where) =>
          payload.find({ collection: 'articles', where, sort: SORT, limit: 1, depth: 1, pagination: false, select: LIST_SELECT })
        const since = new Date(Date.now() - 48 * HOUR_MS).toISOString()
        const picked = await find(published(department, { isInfoOfDay: { equals: true } }, { publishedAt: { greater_than_equal: since } }))
        return picked.docs[0] ?? (await find(published(department))).docs[0] ?? null
      },
      null,
      'article à la une',
    ),
)

/** Article complet d'après son adresse (image et image SEO chargées). Mis en cache pour la durée d'un rendu. */
export const getArticleBySlug = cache(
  async (slug: string): Promise<Article | null> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        // en aperçu, un article programmé (date à venir) se prévisualise aussi
        const res = await payload.find({
          collection: 'articles',
          where: (await isPreview()) ? { slug: { equals: slug } } : published(null, { slug: { equals: slug } }),
          limit: 1,
          depth: 1,
          pagination: false,
        })
        return res.docs[0] ?? null
      },
      null,
      'article',
    ),
)

/**
 * Départements (et « Autres régions ») qui ont au moins un article publié, dans l'ordre d'INFO_ZONES : « Autres régions »
 * en dernier (une seule requête au lieu d'un comptage par département).
 */
export const getDepartmentsWithArticles = cache(
  async (): Promise<InfoZone[]> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const res = await payload.findDistinct({ collection: 'articles', field: 'department', where: published(null) })
        const present = new Set<unknown>(res.values.map((v) => v.department))
        return INFO_ZONES.map((d) => d.value).filter((d) => present.has(d))
      },
      [],
      'départements de l’info',
    ),
)
