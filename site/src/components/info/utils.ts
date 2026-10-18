// L'Info : préparation des articles pour l'affichage (côté serveur) en données simples, sérialisables vers le client.
import { departmentLabel, type DepartmentSlug } from '@/lib/departments'
import { dateChip, formatDate, formatTime } from '@/lib/format'
import { mediaAlt, mediaFocal, mediaSize, mediaUrl, type MediaRef, type MediaSize } from '@/lib/media'
import type { ArticleListItem } from '@/lib/queries/articles'
import type { Article } from '@/payload-types'
import { ogImage, type OgImage } from '@/lib/og'
import { SITE_URL } from '@/lib/site'
import { articleUrl } from '@/lib/urls'

/** Image prête pour next/image (adresse locale optimisée, ou distante non optimisée). */
export type ImageData = { src: string; alt: string; width: number; height: number; unoptimized: boolean; position?: string }

/** Article réduit aux champs affichés par les cartes et le fil « En continu ». */
export type ArticleTeaser = {
  id: number
  title: string
  href: string
  department: DepartmentSlug
  departmentLabel: string
  /** « Annemasse · Faits divers » (commune, ou département à défaut, puis rubrique) */
  kicker: string
  excerpt: string | null
  /** ISO 8601 */
  publishedAt: string
  /** Heure de publication à Paris (« 16:34 ») : texte du rendu serveur */
  clock: string
  /** « 16 oct. · 16:34 » : date courte du rendu serveur (listes sur plusieurs jours) */
  short: string
  /** « 16 octobre 2026 à 16:34 » (infobulle) */
  full: string
  /** Grand format (carte, article principal) */
  image: ImageData | null
  /** Vignette (fil « En continu ») */
  thumb: ImageData | null
}

const VISUALS = [
  't-crepuscule-a', 't-matin-a', 't-nuit-b', 't-ete-a', 't-hiver-a', 't-alpenglow-a', 't-nuages-a', 't-orage-b', 't-crepuscule-b',
  't-matin-b', 't-ete-b', 't-hiver-b', 't-alpenglow-b', 't-nuages-b', 't-orage-a', 't-crepuscule-c', 't-nuit-a',
]

/** Visuel de la maquette pour un article sans image (choix stable d'après l'identifiant). */
export const fallbackVisual = (id: number) => `/visuels/${VISUALS[Math.abs(id) % VISUALS.length]}.webp`

/** Chemins servis par le site et acceptés par l'optimiseur d'images (images.localPatterns de next.config.ts). */
const LOCAL = /^\/(api\/media\/file|visuels)\//

/** Adresse pour next/image : une adresse absolue du site redevient relative (optimisée en AVIF/WebP). */
export function imageSource(url: string): { src: string; unoptimized: boolean } {
  const src = url.startsWith(`${SITE_URL}/`) ? url.slice(SITE_URL.length) : url
  return { src, unoptimized: !LOCAL.test(src) }
}

/** Adresse http(s) absolue valide (image externe d'un import RSS, lien vers la source) ou null. */
export function httpUrl(url?: string | null): string | null {
  const u = url?.trim()
  if (!u || !/^https?:\/\/[^\s"'<>]+$/i.test(u)) return null
  try {
    // Rejette aussi les adresses que la regex accepte mais que new URL refuse (port invalide…)
    return new URL(u).hostname ? u : null
  } catch {
    return null
  }
}

/** Adresse d'image externe valide (import RSS) ou null. */
export const externalImage = httpUrl

/** Image d'un article : média Payload, sinon image externe (RSS), sinon visuel de repli. */
export function articleImage(a: { id: number; image?: MediaRef; imageUrl?: string | null }, size: MediaSize): ImageData {
  const url = mediaUrl(a.image, size)
  if (url) {
    const { width, height } = mediaSize(a.image, size)
    return { ...imageSource(url), alt: mediaAlt(a.image), width, height, position: mediaFocal(a.image) }
  }
  const external = externalImage(a.imageUrl)
  if (external) return { src: external, unoptimized: true, alt: '', width: 1600, height: 900 }
  return { src: fallbackVisual(a.id), unoptimized: false, alt: '', width: 960, height: 540 }
}

/** Accroche : « Annemasse · Faits divers » (département à défaut de commune). */
export function kickerLine(a: { city?: string | null; kicker?: string | null; department?: string | null }): string {
  return [a.city?.trim() || departmentLabel(a.department), a.kicker?.trim()].filter(Boolean).join('\u00a0· ')
}

/** Typographie française des textes saisis ou importés : espace insécable avant : ; ! ? » et après « (pas de retour à la ligne avant « : »). */
export const frenchSpaces = (s: string) => s.replace(/ (?=[:;!?»])/g, '\u00a0').replace(/« /g, '«\u00a0')

/** « 16 oct. · 16:34 » */
export function shortDateTime(iso: string): string {
  const { day, month } = dateChip(iso)
  return `${day} ${month.toLowerCase()} · ${formatTime(iso)}`
}

/** « 16 octobre 2026 à 16:34 » */
export const fullDateTime = (iso: string) => `${formatDate(iso)} à ${formatTime(iso)}`

/**
 * Article → données d'affichage. `image` : grand format ; `thumb` : vignette du fil ; `excerpt` : chapô.
 * Ne demander que ce qui sera affiché (données envoyées au client).
 */
export function toTeaser(a: ArticleListItem, { image = true, thumb = false, excerpt = true } = {}): ArticleTeaser {
  return {
    id: a.id,
    title: frenchSpaces(a.title),
    href: articleUrl(a),
    department: a.department,
    departmentLabel: departmentLabel(a.department),
    kicker: kickerLine(a),
    excerpt: excerpt && a.excerpt?.trim() ? frenchSpaces(a.excerpt.trim()) : null,
    publishedAt: new Date(a.publishedAt).toISOString(),
    clock: formatTime(a.publishedAt),
    short: shortDateTime(a.publishedAt),
    full: fullDateTime(a.publishedAt),
    image: image ? articleImage(a, 'card') : null,
    thumb: thumb ? articleImage(a, 'thumb') : null,
  }
}

/* ----- Contenu riche (Lexical) ----- */

type LexicalNode = { type?: unknown; text?: unknown; children?: unknown }

const isNode = (n: unknown): n is LexicalNode => typeof n === 'object' && n !== null
/** Nœuds qui comptent comme contenu même sans texte */
const MEDIA_NODES = new Set(['upload', 'block', 'inlineBlock', 'relationship', 'horizontalrule'])

function someNode(nodes: unknown, test: (n: LexicalNode) => boolean): boolean {
  return Array.isArray(nodes) && nodes.some((n) => isNode(n) && (test(n) || someNode(n.children, test)))
}

/** Vrai si l'article a un texte propre (autre chose que des paragraphes vides) ; faux pour une reprise RSS brute. */
export function hasOwnContent(content: Article['content']): boolean {
  return someNode(content?.root?.children, (n) => (typeof n.text === 'string' && n.text.trim() !== '') || (typeof n.type === 'string' && MEDIA_NODES.has(n.type)))
}

const nodeText = (n: unknown): string => {
  if (!isNode(n)) return ''
  if (typeof n.text === 'string') return n.text
  if (n.type === 'linebreak') return ' '
  return Array.isArray(n.children) ? n.children.map(nodeText).join('') : ''
}

/** Texte brut du contenu riche, paragraphes séparés par une espace (description de repli). */
export function plainText(content: Article['content']): string {
  return (content?.root?.children ?? []).map(nodeText).join(' ').replace(/\s+/g, ' ').trim()
}

/** Texte coupé sur un mot, sans ponctuation pendante, terminé par « … ». */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s\u00a0,;:.!?\-–—(«"'’]+$/u, '')}…`
}

/** Image de partage d'un article (JPEG 1200 × 630) : image SEO, puis image de l'article, image externe (RSS) ou visuel de repli. */
export function articleShareImage(a: { id: number; title: string; image?: MediaRef; imageUrl?: string | null; meta?: { image?: MediaRef } | null }): OgImage {
  const seo = a.meta?.image
  const media = typeof seo === 'object' && seo ? seo : typeof a.image === 'object' && a.image ? a.image : null
  if (media) return ogImage(media, fallbackVisual(a.id), mediaAlt(media, a.title))
  const external = externalImage(a.imageUrl)
  if (external) return { url: external, width: 1600, height: 900, alt: a.title }
  return ogImage(null, fallbackVisual(a.id), a.title)
}
