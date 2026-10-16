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
import { ReplayCard } from '@/components/video/ReplayCard'
import { GRID_SIZES } from '@/components/video/VideoCard'
import { renderNow, replayListUrl, SHARE_VISUAL, toAbsolute } from '@/components/video/utils'
import { mediaUrl } from '@/lib/media'
import { getReplayPrograms, getReplaysPage } from '@/lib/queries/replays'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { replayUrl } from '@/lib/urls'
import type { Program } from '@/payload-types'
import '@/styles/video.css'

export const revalidate = 60

const PER_PAGE = 24
const INTRO = 'Les émissions de Swatter TV à voir ou revoir gratuitement\u00a0: journaux, magazines, documentaires et divertissements.'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** ?emission= (adresse de l'émission, ignorée si inconnue) et ?page= (1 par défaut). */
async function resolveParams(sp: Record<string, string | string[] | undefined>): Promise<{ program: Program | null; programs: Program[]; page: number }> {
  const programs = await getReplayPrograms()
  const slug = first(sp.emission)
  const p = Number(first(sp.page))
  return { program: (slug && programs.find((x) => x.slug === slug)) || null, programs, page: Number.isInteger(p) && p > 1 ? p : 1 }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { program, page } = await resolveParams(await searchParams)
  const suffix = page > 1 ? ` (page ${page})` : ''
  const title = `${program ? `${program.title} en replay` : 'Le Replay'}${suffix}`
  const description = (program ? program.meta?.description || program.synopsis || `Tous les épisodes de «\u00a0${program.title}\u00a0» à revoir sur Swatter TV.` : INTRO).slice(0, 200)
  const image = program ? mediaUrl(program.meta?.image && typeof program.meta.image === 'object' ? program.meta.image : program.image, 'hero') : null
  const url = replayListUrl(program?.slug, page)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url, title, description, images: [{ url: toAbsolute(image ?? SHARE_VISUAL) }] },
  }
}

export default async function ReplayPage({ searchParams }: { searchParams: SearchParams }) {
  const { program, programs, page } = await resolveParams(await searchParams)
  const list = await getReplaysPage({ programId: program?.id, page, limit: PER_PAGE })
  if (page > 1 && page > list.totalPages) notFound()

  const now = renderNow()
  const crumbs: Crumb[] = [{ label: 'Replay', href: '/replay' }, ...(program ? [{ label: program.title }] : [])]

  return (
    <>
      <PageHeader
        eyebrow={program ? 'Replay' : 'Voir ou revoir'}
        title={program ? program.title : 'Le Replay'}
        description={program ? program.synopsis || `Tous les épisodes de «\u00a0${program.title}\u00a0» à revoir gratuitement.` : INTRO}
        crumbs={crumbs}
      />

      <section className="section container" aria-labelledby="replay-list-title">
        <SectionHead
          eyebrow={list.totalDocs ? `${list.totalDocs} replay${list.totalDocs > 1 ? 's' : ''}` : undefined}
          title={program ? 'Tous les épisodes' : 'Les derniers replays'}
          titleId="replay-list-title"
        />
        <FilterLinks
          label="Filtrer les replays par émission"
          links={[{ href: replayListUrl(), label: 'Toutes les émissions', current: !program }, ...programs.map((p) => ({ href: replayListUrl(p.slug), label: p.title, current: p.id === program?.id }))]}
        />
        {list.docs.length ? (
          <div className="grid-cards vgrid">
            {list.docs.map((r, i) => (
              <div key={r.id} className="vgrid__cell" data-reveal style={{ '--d': i % 4 } as CSSProperties}>
                <ReplayCard replay={r} now={now} sizes={GRID_SIZES} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Icon name="replay" />
            <p>
              <b>Aucun replay pour le moment</b>
              Les émissions sont mises en ligne après leur diffusion&nbsp;: revenez bientôt.
            </p>
          </div>
        )}
        <Pager page={page} totalPages={list.totalPages} hrefFor={(p) => replayListUrl(program?.slug, p)} label="Pages de la liste des replays" />
      </section>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      {list.docs.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: program ? `${program.title} en replay` : 'Replays de Swatter TV',
            itemListElement: list.docs.map((r, i) => ({ '@type': 'ListItem', position: (page - 1) * PER_PAGE + i + 1, url: absoluteUrl(replayUrl(r)), name: r.title })),
          }}
        />
      )}
    </>
  )
}
