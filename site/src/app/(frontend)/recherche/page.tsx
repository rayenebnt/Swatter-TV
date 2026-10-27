import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { HitCard } from '@/components/search/HitCard'
import { QuickLinks } from '@/components/search/QuickLinks'
import { cleanQuery, queryWords } from '@/components/search/text'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHead } from '@/components/ui/SectionHead'
import { getPayloadClient } from '@/lib/payload'
import { safe } from '@/lib/safe'
import { search, type SearchHit } from '@/lib/search'
import { SITE_NAME } from '@/lib/site'
import '@/styles/pages.css'

/** Résultats affichés au plus (les plus pertinents). */
const LIMIT = 60
const INTRO = 'Vidéos, replays, articles, sorties, émissions et webcams\u00a0: tout Swatter TV Info en une recherche.'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const GROUP_TITLE: Record<SearchHit['type'], string> = {
  video: 'Vidéos',
  replay: 'Replay',
  article: 'L’Info',
  event: 'Agenda',
  program: 'Émissions',
  webcam: 'Webcams',
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
const quoted = (q: string) => `«\u00a0${q}\u00a0»`

async function readQuery(searchParams: SearchParams): Promise<string> {
  const q = (await searchParams).q
  return cleanQuery(Array.isArray(q) ? q[0] : q)
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }, parent: ResolvingMetadata): Promise<Metadata> {
  const q = await readQuery(searchParams)
  const title = q ? `Recherche\u00a0: ${quoted(q)}` : 'Recherche'
  return {
    title,
    description: INTRO,
    // Pages de résultats : non indexées (et exclues par robots.txt), liens suivis
    robots: { index: false, follow: true },
    alternates: { canonical: '/recherche' },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url: '/recherche', title, description: INTRO, images: (await parent).openGraph?.images ?? [] },
  }
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await readQuery(searchParams)
  const words = queryWords(q)
  const searching = q.length >= 2 && words.length > 0
  const hits = searching ? await safe(async () => search(await getPayloadClient(), q, LIMIT), [], 'recherche') : []

  // Groupes par type, dans l'ordre de leur meilleur résultat
  const groups: { type: SearchHit['type']; hits: SearchHit[] }[] = []
  for (const hit of hits) {
    const group = groups.find((g) => g.type === hit.type)
    if (group) group.hits.push(hit)
    else groups.push({ type: hit.type, hits: [hit] })
  }

  const description = searching
    ? hits.length
      ? `${plural(hits.length, 'résultat')}${hits.length >= LIMIT ? ' (les plus pertinents)' : ''}.`
      : 'Aucun contenu ne correspond à votre recherche.'
    : q
      ? 'Saisissez au moins deux caractères.'
      : INTRO

  return (
    <>
      <PageHeader eyebrow="Recherche" title={q ? `Résultats pour ${quoted(q)}` : 'Rechercher sur Swatter TV Info'} description={description} crumbs={[{ label: 'Recherche' }]}>
        <form className="sform" action="/recherche" method="get" role="search">
          <Icon name="search" />
          <label className="sr-only" htmlFor="sform-q">
            Rechercher sur Swatter TV Info
          </label>
          <input id="sform-q" name="q" type="search" defaultValue={q} placeholder="Émission, vidéo, info, sortie, webcam…" maxLength={80} autoComplete="off" enterKeyHint="search" />
          <button className="btn btn--gold btn--sm" type="submit">
            Rechercher
          </button>
        </form>
      </PageHeader>

      {groups.length > 1 && (
        <nav className="container sres-nav" aria-label="Aller à un type de résultats">
          {groups.map((g) => (
            <Link key={g.type} href={`#resultats-${g.type}`}>
              {GROUP_TITLE[g.type]} <b>{g.hits.length}</b>
            </Link>
          ))}
        </nav>
      )}

      {groups.map((g) => (
        <section key={g.type} id={`resultats-${g.type}`} className="section--tight container sres-group" aria-labelledby={`resultats-${g.type}-titre`}>
          <SectionHead eyebrow={plural(g.hits.length, 'résultat')} title={GROUP_TITLE[g.type]} titleId={`resultats-${g.type}-titre`} />
          <ul className="sres">
            {g.hits.map((hit, i) => (
              <li key={hit.href} data-reveal style={{ '--d': i % 4 } as CSSProperties}>
                <HitCard hit={hit} words={words} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {searching && !hits.length && (
        <section className="section--tight container" aria-labelledby="sres-vide">
          <div className="empty sres-empty">
            <Icon name="search" />
            <p>
              <b id="sres-vide">Aucun résultat pour {quoted(q)}</b>
              Vérifiez l’orthographe, essayez un mot plus court ou plus général, ou parcourez les rubriques.
            </p>
          </div>
          <QuickLinks />
        </section>
      )}

      {!searching && (
        <section className="section--tight container" aria-labelledby="sres-rubriques">
          <SectionHead eyebrow="Explorer" title="Les rubriques" titleId="sres-rubriques" />
          <QuickLinks />
        </section>
      )}
    </>
  )
}
