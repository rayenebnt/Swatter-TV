import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { CSSProperties } from 'react'
import { ArticleCard } from '@/components/info/ArticleCard'
import { LiveItem } from '@/components/info/LiveItem'
import { inPlace, ofPlace } from '@/components/info/places'
import { RelativeTime } from '@/components/info/RelativeTime'
import { articleImage, articleShareImage, frenchSpaces, fullDateTime, hasOwnContent, plainText, toTeaser, truncate } from '@/components/info/utils'
import { AdSlot } from '@/components/layout/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { MediaImage } from '@/components/ui/MediaImage'
import { RichText } from '@/components/ui/RichText'
import { SectionHead } from '@/components/ui/SectionHead'
import { departmentLabel } from '@/lib/departments'
import { mediaAlt, mediaSize, mediaUrl } from '@/lib/media'
import { getArticleBySlug, getLatestArticles } from '@/lib/queries/articles'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { articleUrl, departmentUrl } from '@/lib/urls'
import type { Article, Media } from '@/payload-types'
import '@/styles/info.css'

export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache. */
export function generateStaticParams() {
  return []
}

type Params = Promise<{ departement: string; slug: string }>

/** Image de l'article : 2 colonnes au-delà de 1100 px (colonne « En continu » à droite) */
const FIGURE_SIZES = '(max-width: 1100px) calc(100vw - 32px), 880px'

const asMedia = (m: Article['image']): Media | null => (typeof m === 'object' && m !== null ? m : null)
const iso = (d: string) => new Date(d).toISOString()

/** Description : champ SEO, sinon chapô, sinon début du texte, sinon phrase générique. */
function describe(a: Article): string {
  const text = a.meta?.description?.trim() || a.excerpt?.trim() || plainText(a.content) || `${a.title} : l’info ${inPlace(a.department)} avec Swatter TV.`
  return truncate(text, 200)
}

/** Image de partage (adresse absolue) : image SEO, sinon image de l'article (média ou externe), sinon visuel de repli. */
/** Grande image pour les données structurées (Google accepte le WebP et préfère les grandes images). */
function structuredImage(a: Article): { url: string; width: number; height: number; alt: string } {
  const seo = asMedia(a.meta?.image ?? null)
  if (seo && mediaUrl(seo, 'hero')) return { url: absoluteUrl(mediaUrl(seo, 'hero') ?? ''), ...mediaSize(seo, 'hero'), alt: mediaAlt(seo, a.title) }
  const img = articleImage(a, 'hero')
  return { url: absoluteUrl(img.src), width: img.width, height: img.height, alt: img.alt || a.title }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) return { title: 'Article introuvable', robots: { index: false, follow: true } }

  const url = articleUrl(article)
  const description = describe(article)
  const title = article.meta?.title?.trim()
  const image = articleShareImage(article)
  return {
    // Le titre SEO saisi (ou généré) contient déjà « — Swatter TV »
    title: title ? { absolute: title } : article.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url,
      title: title || article.title,
      description,
      publishedTime: iso(article.publishedAt),
      modifiedTime: iso(article.updatedAt),
      section: article.kicker?.trim() || departmentLabel(article.department),
      tags: [departmentLabel(article.department), article.city?.trim()].filter((t): t is string => Boolean(t)),
      images: [image],
    },
  }
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { departement, slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) notFound()
  const url = articleUrl(article)
  if (article.department !== departement) permanentRedirect(url)

  const dept = article.department
  const label = departmentLabel(dept)
  const [sameDept, latest] = await Promise.all([getLatestArticles(4, dept, [article.id]), getLatestArticles(13, null, [article.id])])
  // « À lire aussi » : d'autres articles de la Haute-Savoie ; « En continu » : les dernières infos, sans doublon
  const sameDeptRelated = sameDept.length > 0
  const related = (sameDeptRelated ? sameDept : latest.slice(0, 4)).map((a) => toTeaser(a))
  const relatedIds = new Set(related.map((r) => r.id))
  const live = latest
    .filter((a) => !relatedIds.has(a.id))
    .slice(0, 5)
    .map((a) => toTeaser(a, { image: false, thumb: true, excerpt: false }))

  const media = asMedia(article.image ?? null)
  const own = hasOwnContent(article.content)
  const kicker = article.kicker?.trim() || label
  const city = article.city?.trim()
  const published = iso(article.publishedAt)
  const modified = new Date(Math.max(Date.parse(article.updatedAt), Date.parse(article.publishedAt))).toISOString()
  const crumbs = [
    { label: 'Accueil', href: '/' },
    { label: 'L’Info', href: '/info' },
    { label: article.title },
  ]
  const swatter = {
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    logo: { '@type': 'ImageObject', url: absoluteUrl('/apple-touch-icon.png'), width: 180, height: 180 },
  }

  return (
    <>
      <div className="art-page">
        <div className="container">
          <nav aria-label="Fil d’Ariane">
            <ol className="crumbs">
              {crumbs.map((c, i) => (
                <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
              ))}
            </ol>
          </nav>

          <div className="art__layout">
            <article className="art" aria-labelledby="art-title">
              <header className="art__head">
                <p className="kicker">{kicker}</p>
                <h1 id="art-title" className="art__title">
                  {frenchSpaces(article.title)}
                </h1>
                {article.excerpt?.trim() && <p className="art__chapo">{frenchSpaces(article.excerpt.trim())}</p>}
                <ul className="art__meta">
                  <li>
                    <Icon name="clock" />
                    <span>
                      Publié le <time dateTime={published}>{fullDateTime(published)}</time>
                    </span>
                  </li>
                  <li>
                    <Icon name="pin" />
                    <span>
                      {city && `${city}, `}
                      <Link href={departmentUrl(dept)}>{label}</Link>
                    </span>
                  </li>
                </ul>
              </header>

              {media && (
                <figure className="art__figure">
                  <div className="art__media">
                    <MediaImage media={media} size="hero" fill priority sizes={FIGURE_SIZES} />
                  </div>
                  {media?.credit?.trim() && <figcaption>© {media.credit.trim()}</figcaption>}
                </figure>
              )}

              {own && <RichText data={article.content} className="art__body" />}

              <div className="art__actions">
                <Link className="btn btn--ghost btn--sm" href={departmentUrl(dept)}>
                  Toute l’info {ofPlace(dept)}
                  <Icon name="arrow" />
                </Link>
              </div>
            </article>

            {live.length > 0 && (
              <aside className="art__aside" aria-labelledby="art-live-title">
                <div className="live-list">
                  <h2 id="art-live-title" className="live-list__title">
                    <span className="dot-live" aria-hidden="true" />
                    En continu
                  </h2>
                  {live.map((it) => (
                    <LiveItem key={it.id} item={it} as="h3" time={<RelativeTime iso={it.publishedAt} initial={it.clock} clock={it.clock} full={it.full} mode="feed" />} />
                  ))}
                </div>
                <Link className="link-more" href="/info">
                  Toute l’info
                  <Icon name="arrow" />
                </Link>
              </aside>
            )}
          </div>
        </div>
      </div>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      {related.length > 0 && (
        <section className="section container" aria-labelledby="art-related-title">
          <SectionHead eyebrow={sameDeptRelated ? label : 'L’Info'} title={sameDeptRelated ? 'À lire aussi' : 'D’autres infos'} titleId="art-related-title">
            <Link className="link-more" href={sameDeptRelated ? departmentUrl(dept) : '/info'}>
              {sameDeptRelated ? `Toute l’info ${ofPlace(dept)}` : 'Toute l’info'}
              <Icon name="arrow" />
            </Link>
          </SectionHead>
          <div className="grid-cards info-cards">
            {related.map((it, i) => (
              <div key={it.id} className="info-cards__cell" data-reveal style={{ '--d': i } as CSSProperties}>
                <ArticleCard item={it} place={!sameDeptRelated} />
              </div>
            ))}
          </div>
        </section>
      )}

      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: truncate(article.title, 110),
            description: describe(article),
            datePublished: published,
            dateModified: modified,
            image: [structuredImage(article).url],
            inLanguage: 'fr-FR',
            articleSection: kicker,
            author: swatter,
            publisher: swatter,
            mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(url) },
            url: absoluteUrl(url),
            isAccessibleForFree: true,
            contentLocation: {
              '@type': 'Place',
              name: city ? `${city}, ${label}` : label,
              address: { '@type': 'PostalAddress', ...(city ? { addressLocality: city } : {}), addressRegion: label, addressCountry: 'FR' },
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, ...(c.href ? { item: absoluteUrl(c.href) } : {}) })),
          },
        ]}
      />
    </>
  )
}
