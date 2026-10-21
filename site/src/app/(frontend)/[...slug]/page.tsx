import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { PageHeader } from '@/components/ui/PageHeader'
import { RichText } from '@/components/ui/RichText'
import { formatDate } from '@/lib/format'
import { mediaAlt, mediaSize, mediaUrl } from '@/lib/media'
import { getPayloadClient } from '@/lib/payload'
import { safe } from '@/lib/safe'
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/site'
import { articleUrl, eventUrl, pageUrl, replayUrl, videoUrl } from '@/lib/urls'
import type { Page, Redirect } from '@/payload-types'
import { foldPath, legacyTarget } from './legacy'
import '@/styles/pages.css'

export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache. */
export function generateStaticParams() {
  return []
}

type Params = Promise<{ slug: string[] }>
type Route = { kind: 'page'; page: Page } | { kind: 'redirect'; to: string }

const GROUP_LABEL: Record<NonNullable<Page['footerGroup']>, string> = { chaine: 'La chaîne', swatter: 'Swatter TV' }

/** Segments de l'adresse (décodés par Next ; décodage de secours s'il reste des séquences %XX). */
async function pathOf(params: Params): Promise<string> {
  const { slug } = await params
  return slug
    .map((s) => {
      try {
        return /%[0-9a-f]{2}/i.test(s) ? decodeURIComponent(s) : s
      } catch {
        return s
      }
    })
    .join('/')
}

const findPage = (slug: string) =>
  safe(
    async () => (await (await getPayloadClient()).find({ collection: 'pages', where: { slug: { equals: slug } }, limit: 1, depth: 1, pagination: false })).docs[0] ?? null,
    null,
    'page éditoriale',
  )

/** Destination d'une redirection saisie dans l'administration (document du site ou adresse libre). */
function redirectTarget(r: Redirect): string | null {
  if (r.to?.type === 'custom') {
    const url = r.to.url?.trim()
    if (!url || url.startsWith('//')) return null
    if (/^https?:\/\//i.test(url)) return url
    return /^[a-z][a-z0-9+.-]*:/i.test(url) ? null : url.startsWith('/') ? url : `/${url}`
  }
  const ref = r.to?.reference
  if (!ref) return null
  switch (ref.relationTo) {
    case 'pages':
      return typeof ref.value === 'object' ? pageUrl(ref.value) : null
    case 'articles':
      return typeof ref.value === 'object' ? articleUrl(ref.value) : null
    case 'videos':
      return typeof ref.value === 'object' ? videoUrl(ref.value) : null
    case 'replays':
      return typeof ref.value === 'object' ? replayUrl(ref.value) : null
    case 'events':
      return typeof ref.value === 'object' ? eventUrl(ref.value) : null
    default:
      return null
  }
}

/** Redirection de la collection « redirects » dont le champ « from » correspond au chemin (avec ou sans « / », adresse absolue…). */
async function findRedirect(path: string): Promise<string | null> {
  const p = `/${path}`
  const from = [...new Set([p, path, `${p}/`, absoluteUrl(p), `${absoluteUrl(p)}/`, encodeURI(p)])]
  const doc = await safe(
    async () => (await (await getPayloadClient()).find({ collection: 'redirects', where: { from: { in: from } }, limit: 1, depth: 1, pagination: false })).docs[0] ?? null,
    null,
    'redirection',
  )
  const to = doc ? redirectTarget(doc) : null
  return to && to !== p ? to : null
}

/**
 * Ce que sert une adresse inconnue des autres rubriques : page éditoriale, sinon redirection de l'administration,
 * sinon variante de casse ou d'accents d'une page ou d'une redirection, sinon ancienne adresse du site ; null → 404.
 */
const resolveRoute = cache(async (path: string): Promise<Route | null> => {
  const page = await findPage(path)
  if (page) return { kind: 'page', page }
  const to = await findRedirect(path)
  if (to) return { kind: 'redirect', to }
  const folded = foldPath(path)
  if (folded && folded !== path) {
    const other = await findPage(folded)
    if (other?.slug) return { kind: 'redirect', to: pageUrl(other) }
    const alias = await findRedirect(folded)
    if (alias) return { kind: 'redirect', to: alias }
  }
  const legacy = legacyTarget(path)
  return legacy ? { kind: 'redirect', to: legacy } : null
})

/** Autres pages éditoriales (navigation latérale), dans l'ordre du pied de page. */
const getPagesNav = cache(() =>
  safe(
    async () =>
      (await (await getPayloadClient()).find({ collection: 'pages', sort: 'title', limit: 30, depth: 0, pagination: false, select: { title: true, slug: true } })).docs.filter(
        (p) => p.slug,
      ),
    [],
    'pages éditoriales',
  ),
)

export async function generateMetadata({ params }: { params: Params }, parent: ResolvingMetadata): Promise<Metadata> {
  const route = await resolveRoute(await pathOf(params))
  if (route?.kind !== 'page') return { title: 'Page introuvable', robots: { index: false } }
  const { page } = route
  const url = pageUrl(page)
  const description = (page.meta?.description || page.intro || `${page.title}\u00a0: informations de ${SITE_NAME}, la chaîne d’Auvergne-Rhône-Alpes.`).slice(0, 200)
  const image = typeof page.meta?.image === 'object' && page.meta.image ? page.meta.image : null
  const src = mediaUrl(image, 'card')
  // Sans image propre : image de partage par défaut du site (opengraph-image, adresse résolue par Next)
  const images = src ? [{ url: absoluteUrl(src), ...mediaSize(image, 'card'), alt: mediaAlt(image, page.title) }] : ((await parent).openGraph?.images ?? [])
  return {
    // Le titre SEO saisi (ou généré) contient déjà « — Swatter TV »
    title: page.meta?.title ? { absolute: page.meta.title } : page.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url, title: page.meta?.title || page.title, description, images },
  }
}

export default async function EditorialPage({ params }: { params: Params }) {
  const route = await resolveRoute(await pathOf(params))
  if (!route) notFound()
  if (route.kind === 'redirect') permanentRedirect(route.to)

  const { page } = route
  const nav = await getPagesNav()
  const hasContent = Boolean(page.content?.root?.children?.length)

  return (
    <>
      <PageHeader eyebrow={(page.footerGroup && GROUP_LABEL[page.footerGroup]) || SITE_NAME} title={page.title} description={page.intro || undefined} crumbs={[{ label: page.title }]} />
      <div className="container doc">
        <article className="doc__main" aria-label={page.title}>
          {hasContent ? (
            <RichText data={page.content} className="doc__prose" />
          ) : (
            <div className="empty">
              <Icon name="news" />
              <p>
                <b>Cette page est en cours de rédaction</b>
                Son contenu sera bientôt disponible.
              </p>
            </div>
          )}
          <p className="doc__updated">
            <Icon name="clock" />
            <span>
              Mise à jour le <time dateTime={page.updatedAt}>{formatDate(page.updatedAt)}</time>
            </span>
          </p>
        </article>
        {nav.length > 1 && (
          <nav className="doc__nav" aria-labelledby="doc-nav-title">
            <h2 id="doc-nav-title">Informations</h2>
            <ul>
              {nav.map((p) => (
                <li key={p.id}>
                  <Link href={pageUrl(p)} aria-current={p.id === page.id ? 'page' : undefined}>
                    {p.title}
                    <Icon name="right" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: page.title,
          ...(page.intro ? { description: page.intro } : {}),
          url: absoluteUrl(pageUrl(page)),
          dateModified: page.updatedAt,
          inLanguage: 'fr-FR',
          isPartOf: { '@id': `${SITE_URL}/#website` },
        }}
      />
    </>
  )
}
