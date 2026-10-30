// Image de fond du carrousel sur téléphone (hero.css) : source « téléphone » de la balise <picture>, largeur réellement
// affichée (cadre portrait couvert par l'image, débord de la parallaxe, zoom du Ken Burns) et cadrage autour du point focal.
import type { MobileSource } from '@/components/ui/MediaImage'
import { coverWidth, focalCover, mediaRatio, mediaUrl, type MediaRef } from '@/lib/media'

/** Zoom de départ de l'image (hero.css : scale(1.16)). */
const ZOOM = 1.16
/** Débord du cadre de l'image (hero.css : .slide__media à inset -30px), pour les deux côtés. */
const BLEED = 60
/** Cadre de l'image sur un téléphone de référence : 390 px de large, carrousel à sa hauteur maximale (760 px). */
const PHONE = { width: 390 + BLEED, height: 760 + BLEED }

/**
 * Valeur `sizes` de l'image sur téléphone : largeur réellement affichée. Une image paysage couvre le cadre portrait par
 * sa hauteur : elle est bien plus large que l'écran (« 100vw » la ferait télécharger 3 à 4 fois trop petite, donc floue).
 */
export function heroMobileSizes(ratio: number): string {
  // Image plus étroite que le cadre : elle suit la largeur de l'écran
  if (PHONE.height * ratio <= PHONE.width) return `calc(${Math.round(ZOOM * 100)}vw + ${Math.round(BLEED * ZOOM)}px)`
  return `${Math.round(coverWidth(PHONE.width, PHONE.height, ratio) * ZOOM)}px`
}

/** Cadrage sur téléphone : point focal au centre du cadre portrait ; rien pour le centre par défaut (cadrage de hero.css). */
export const heroMobilePosition = (m: MediaRef) => focalCover(m, PHONE.width / PHONE.height, 'hero')

/**
 * Source « téléphone » d'une diapositive : l'image pour téléphone si elle est renseignée (centrée par défaut), sinon
 * l'image de fond (ou le visuel de repli), recadrée autour de son point focal.
 */
export function heroMobileSource(background: MediaRef, phone: MediaRef, fallbackSrc: string): MobileSource {
  if (mediaUrl(phone)) return { media: phone, size: 'hero', sizes: heroMobileSizes(mediaRatio(phone, 'hero')), position: heroMobilePosition(phone) ?? '50% 50%' }
  return { media: background, size: 'hero', fallbackSrc, sizes: heroMobileSizes(mediaRatio(background, 'hero')), position: heroMobilePosition(background) }
}
