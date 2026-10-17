// Images de partage (Open Graph, X) : JPEG 1200 × 630, lu par tous les réseaux sociaux et messageries,
// contrairement au WebP (aperçus vides sur LinkedIn ou certaines versions de WhatsApp et Facebook).
import { mediaAlt, mediaSize, mediaUrl, type MediaRef } from './media'
import { absoluteUrl } from './site'

export type OgImage = { url: string; width: number; height: number; alt?: string }

const OG_WIDTH = 1200
const OG_HEIGHT = 630

/** Visuel de repli `/visuels/<nom>.webp` → sa version de partage `/og/<nom>.jpg` (générée dans public/og). */
export function ogVisual(src: string): string {
  const m = src.match(/^\/visuels\/([\w-]+)\.webp$/)
  return m ? `/og/${m[1]}.jpg` : src
}

/**
 * Image de partage d'un média Payload : sa taille « og » (JPEG) ; à défaut (média importé avant cette taille),
 * sa taille « card » ; sans média, le visuel de repli (`/visuels/…` converti en JPEG, ou une adresse complète).
 */
export function ogImage(media: MediaRef, fallback: string, alt?: string): OgImage {
  const og = mediaUrl(media, 'og')
  if (og && /\.jpe?g(\?|$)/i.test(og)) return { url: absoluteUrl(og), ...mediaSize(media, 'og'), alt: alt ?? (mediaAlt(media) || undefined) }
  const card = mediaUrl(media, 'card')
  if (card) return { url: absoluteUrl(card), ...mediaSize(media, 'card'), alt: alt ?? (mediaAlt(media) || undefined) }
  return { url: absoluteUrl(ogVisual(fallback)), width: OG_WIDTH, height: OG_HEIGHT, ...(alt ? { alt } : {}) }
}
