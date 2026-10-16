import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { AdSlot } from '@/components/layout/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { PageHeader, type Crumb } from '@/components/ui/PageHeader'
import { SectionHead } from '@/components/ui/SectionHead'
import { FilterLinks } from '@/components/video/FilterLinks'
import { Pager } from '@/components/video/Pager'
import { Top10Section } from '@/components/video/Top10Section'
import { GRID_SIZES, VideoCard } from '@/components/video/VideoCard'
import { renderNow } from '@/components/video/utils'
import { labelOf, VIDEO_CATEGORIES } from '@/lib/categories'
import { getVideoCategories, getVideosPage, isVideoCategory, type VideoCategory } from '@/lib/queries/videos'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { videoUrl } from '@/lib/urls'
import '@/styles/video.css'

export const revalidate = 60

const PER_PAGE = 24

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** ?categorie= (ignorée si inconnue) et ?page= (1 par défaut). */
function parseParams(sp: Record<string, string | string[] | undefined>): { category: VideoCategory | null; page: number } {
  const c = first(sp.categorie)
  const p = Number(first(sp.page))
  return { category: isVideoCategory(c) ? c : null, page: Number.isInteger(p) && p > 1 ? p : 1 }
}

function listHref(category: VideoCategory | null, page = 1) {
  const q = new URLSearchParams()
  if (category) q.set('categorie', category)
  if (page > 1) q.set('page', String(page))
  const s = q.toString()
  return s ? `/videos?${s}` : '/videos'
}

function texts(category: VideoCategory | null, page: number) {
  const label = category ? labelOf(VIDEO_CATEGORIES, category) : null
  const suffix = page > 1 ? ` (page ${page})` : ''
  return {
    label,
    title: `${label ? `${label}\u00a0: toutes les vidéos` : 'Vidéos'}${suffix}`,
    description: label
      ? `Les vidéos «\u00a0${label}\u00a0» de Swatter TV, la chaîne locale de la Haute-Savoie, à regarder gratuitement.`
      : 'Toutes les vidéos de Swatter TV, la chaîne locale de la Haute-Savoie\u00a0: à regarder gratuitement, où que vous soyez.',
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { category, page } = parseParams(await searchParams)
  const { title, description } = texts(category, page)
  const url = listHref(category, page)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url, title, description },
  }
}

export default async function VideosPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, page } = parseParams(await searchParams)
  const [list, categories] = await Promise.all([getVideosPage({ category, page, limit: PER_PAGE }), getVideoCategories()])
  if (page > 1 && page > list.totalPages) notFound()

  const now = renderNow()
  const { label, description } = texts(category, page)
  const withTop = !category && page === 1
  const crumbs: Crumb[] = [{ label: 'Vidéos', href: '/videos' }, ...(label ? [{ label }] : [])]

  return (
    <>
      <PageHeader eyebrow={label ? 'Vidéos' : 'À voir maintenant'} title={label ?? 'Les vidéos'} description={description} crumbs={crumbs} />

      {withTop && (
        <>
          <Top10Section priority />
          <div className="container">
            <AdSlot placement="inner-leaderboard" />
          </div>
        </>
      )}

      <section className="section container" aria-labelledby="all-videos-title">
        <SectionHead
          eyebrow={list.totalDocs ? `${list.totalDocs} vidéo${list.totalDocs > 1 ? 's' : ''}` : undefined}
          title={label ? `Toutes les vidéos «\u00a0${label}\u00a0»` : 'Toutes les vidéos'}
          titleId="all-videos-title"
        />
        <FilterLinks
          label="Filtrer les vidéos par catégorie"
          links={[
            { href: listHref(null), label: 'Tout', current: !category },
            ...categories.map((c) => ({ href: listHref(c), label: labelOf(VIDEO_CATEGORIES, c), current: c === category })),
          ]}
        />
        {list.docs.length ? (
          <div className="grid-cards vgrid">
            {list.docs.map((v, i) => (
              <div key={v.id} className="vgrid__cell" data-reveal style={{ '--d': i % 4 } as CSSProperties}>
                <VideoCard video={v} now={now} meta sizes={GRID_SIZES} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Icon name="tv" />
            <p>
              <b>Aucune vidéo pour le moment</b>
              Revenez bientôt pour découvrir les prochaines vidéos de la chaîne.
            </p>
          </div>
        )}
        <Pager page={page} totalPages={list.totalPages} hrefFor={(p) => listHref(category, p)} label="Pages de la liste des vidéos" />
      </section>

      {!withTop && (
        <div className="container">
          <AdSlot placement="inner-leaderboard" />
        </div>
      )}

      {list.docs.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: label ? `Vidéos «\u00a0${label}\u00a0»` : 'Vidéos de Swatter TV',
            itemListElement: list.docs.map((v, i) => ({ '@type': 'ListItem', position: (page - 1) * PER_PAGE + i + 1, url: absoluteUrl(videoUrl(v)), name: v.title })),
          }}
        />
      )}
    </>
  )
}
