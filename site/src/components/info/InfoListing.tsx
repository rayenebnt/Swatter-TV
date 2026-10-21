import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { AdSlot } from '@/components/layout/AdSlot'
import { DeptFilter } from '@/components/ui/DeptFilter'
import { DocumentTitle } from '@/components/ui/DocumentTitle'
import { Icon } from '@/components/ui/Icon'
import { PageHeader, type Crumb } from '@/components/ui/PageHeader'
import { SectionHead } from '@/components/ui/SectionHead'
import { DEPARTMENTS, departmentLabel, type DepartmentSlug } from '@/lib/departments'
import { ogImage } from '@/lib/og'
import { inPlace, ofPlace } from '@/lib/places'
import { getArticlesPage, getDepartmentsWithArticles, getFeaturedArticle, type ArticleListItem, type ArticlesPage } from '@/lib/queries/articles'
import { SITE_NAME } from '@/lib/site'
import { departmentUrl } from '@/lib/urls'
import { ArticleCard } from './ArticleCard'
import { InfoPager } from './InfoPager'
import { LeadCard } from './LeadCard'
import { RelativeTime } from './RelativeTime'
import { articleShareImage, toTeaser } from './utils'
import '@/styles/info.css'

/** Articles par page de liste (hors article à la une) */
export const PER_PAGE = 20
/** Image de l'article à la une : colonne gauche de la carte sur toute la largeur du conteneur */
const LEAD_PAGE_SIZES = '(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 50vw, 660px'
const LIST_ID = 'actualites'

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** ?page= : entier supérieur à 1, sinon première page. */
export function parsePage(sp: Record<string, string | string[] | undefined>): number {
  const n = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page)
  return Number.isInteger(n) && n > 1 ? n : 1
}

/** Adresse d'une page de liste : /info, /info/haute-savoie, /info?page=2… */
export const listHref = (dept: DepartmentSlug | null, page = 1) => `${dept ? departmentUrl(dept) : '/info'}${page > 1 ? `?page=${page}` : ''}`

const deptCode = (d: DepartmentSlug) => DEPARTMENTS.find((x) => x.value === d)?.code ?? ''

/** Textes de la page (visibles et métadonnées), pour la région ou un département. */
function texts(dept: DepartmentSlug | null) {
  if (!dept) {
    return {
      eyebrow: '7j/7 · 24h/24',
      h1: 'L’Info en Auvergne-Rhône-Alpes',
      lede: 'Le flux d’actualité de toute la région, département par département.',
      title: 'L’info en Auvergne-Rhône-Alpes : l’actualité en continu',
      description:
        'Toute l’actualité d’Auvergne-Rhône-Alpes en continu, département par département : faits divers, sport, société, culture, montagne… avec Swatter TV, la chaîne régionale d’Auvergne-Rhône-Alpes.',
    }
  }
  return {
    eyebrow: `L’Info · ${deptCode(dept)}`,
    h1: `L’info ${inPlace(dept)}`,
    lede: `Toute l’actualité ${ofPlace(dept)} en continu, commune par commune.`,
    title: `L’info ${inPlace(dept)} : l’actualité en continu`,
    description: `Toute l’actualité ${ofPlace(dept)} (${deptCode(dept)}) en continu : faits divers, sport, société, culture… avec Swatter TV, la chaîne régionale d’Auvergne-Rhône-Alpes.`,
  }
}

export type Listing = { featured: ArticleListItem | null; list: ArticlesPage; departments: DepartmentSlug[] }

/** Données d'une page de liste : article à la une, page d'articles (sans lui) et départements qui ont de l'info. */
export async function loadListing(dept: DepartmentSlug | null, page: number): Promise<Listing> {
  const [featured, withInfo] = await Promise.all([getFeaturedArticle(dept), getDepartmentsWithArticles()])
  const list = await getArticlesPage(dept, page, PER_PAGE, featured?.id ?? null)
  return { featured, list, departments: DEPARTMENTS.map((d) => d.value).filter((v) => withInfo.includes(v) || v === dept) }
}

/** Titre d'une page de liste (sans le nom du site), avec le numéro de page au-delà de la première. */
const listingTitle = (dept: DepartmentSlug | null, page: number) => {
  const { title } = texts(dept)
  return page > 1 ? `${title} (page ${page})` : title
}

/** Métadonnées d'une page de liste : titre, description, adresse canonique (avec ?page=), image de l'article à la une. */
export async function listingMetadata(dept: DepartmentSlug | null, page: number): Promise<Metadata> {
  const { description } = texts(dept)
  const fullTitle = listingTitle(dept, page)
  const url = listHref(dept, page)
  const featured = await getFeaturedArticle(dept)
  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url,
      title: fullTitle,
      description,
      images: [featured ? articleShareImage(featured) : ogImage(null, '/visuels/t-matin-a.webp')],
    },
  }
}

/** Page Info (région ou département) : en-tête, filtres, article à la une (première page), grille paginée. */
export function InfoListing({ dept, page, data }: { dept: DepartmentSlug | null; page: number; data: Listing }) {
  const { featured, list, departments } = data
  const t = texts(dept)
  const label = dept ? departmentLabel(dept) : null
  const crumbs: Crumb[] = label ? [{ label: 'L’Info', href: '/info' }, { label }] : [{ label: 'L’Info' }]
  const lead = page === 1 && featured ? toTeaser(featured) : null
  const items = list.docs.map((a) => toTeaser(a))
  const total = list.totalDocs + (featured ? 1 : 0)
  const links = [
    { href: '/info', label: 'Toute la région', current: !dept },
    ...departments.map((d) => ({ href: departmentUrl(d), label: departmentLabel(d), current: d === dept })),
  ]

  return (
    <>
      <DocumentTitle title={listingTitle(dept, page)} />
      <PageHeader eyebrow={t.eyebrow} title={t.h1} description={t.lede} crumbs={crumbs} />

      <div className="container">
        <DeptFilter links={links} label="L’info par département" className="info-filters info-depts" />
      </div>

      {lead && (
        <section className="section section--tight container" aria-labelledby="info-une-title">
          <SectionHead eyebrow="L’essentiel" title="À la une" titleId="info-une-title" />
          <LeadCard
            item={lead}
            priority
            reveal
            sizes={LEAD_PAGE_SIZES}
            className="lead--page"
            time={<RelativeTime iso={lead.publishedAt} initial={lead.short} full={lead.full} />}
          />
        </section>
      )}

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      {(items.length > 0 || !lead) && (
        <section className="section container" id={LIST_ID} aria-labelledby="info-list-title">
          <SectionHead
            eyebrow={total ? `${total} info${total > 1 ? 's' : ''}` : undefined}
            title={page > 1 ? `Toute l’actualité (page ${page})` : 'Toute l’actualité'}
            titleId="info-list-title"
          />
          {items.length ? (
            <div className="grid-cards info-cards">
              {items.map((it, i) => (
                <div key={it.id} className="info-cards__cell" data-reveal style={{ '--d': i % 4 } as CSSProperties}>
                  <ArticleCard item={it} place={!dept} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Icon name="news" />
              <div>
                <b>{dept ? 'Pas encore d’info pour ce département' : 'Pas encore d’info pour le moment'}</b>
                {dept ? (
                  <>
                    Revenez plus tard ou consultez <Link href="/info">l’actualité de toute la région</Link>.
                  </>
                ) : (
                  'Revenez bientôt : l’actualité de la région s’affichera ici.'
                )}
              </div>
            </div>
          )}
          <InfoPager page={page} totalPages={list.totalPages} hrefFor={(p) => `${listHref(dept, p)}#${LIST_ID}`} />
        </section>
      )}
    </>
  )
}
