// Image de fond du carrousel (hero.css, HeroImage.tsx) : photo entière sur fond flou quand le cadre en hauteur (téléphone,
// tablette tenue en hauteur) en couperait trop, sinon source « téléphone » de la balise <picture> qui couvre le cadre portrait
// (largeur réellement affichée : cadre couvert par l'image, débord de la parallaxe, zoom du Ken Burns ; cadrage autour du
// point focal).
import type { MobileSource } from '@/components/ui/MediaImage'
import { coverWidth, focalCover, mediaOrientation, mediaRatio, mediaUrl, wholeIn, type MediaRef } from '@/lib/media'

/** Zoom de départ de l'image (hero.css : scale(1.16)). */
const ZOOM = 1.16
/** Débord du cadre de l'image (hero.css : .slide__media à inset -30px), pour les deux côtés. */
const BLEED = 60
/** Cadre de l'image sur un téléphone de référence : 390 px de large, carrousel à sa hauteur maximale (760 px). */
const PHONE = { width: 390 + BLEED, height: 760 + BLEED }
/** Carrousel (sans le débord) sur un téléphone de référence et sur une tablette tenue en hauteur (768 × 980 px). */
const PHONE_FRAME = 390 / 760
const TALL_FRAME = 768 / 980

/** Largeur affichée de l'image partout où elle couvre l'écran, et de la photo entière sur téléphone (pleine largeur). */
export const HERO_SIZES = '100vw'

/**
 * Valeur `sizes` de l'image sur téléphone quand elle couvre le cadre : largeur réellement affichée. Une image plus large
 * que le cadre portrait le couvre par sa hauteur : elle est plus large que l'écran (« 100vw » la ferait télécharger trop
 * petite, donc floue).
 */
export function heroMobileSizes(ratio: number): string {
  // Image plus étroite que le cadre : elle suit la largeur de l'écran
  if (PHONE.height * ratio <= PHONE.width) return `calc(${Math.round(ZOOM * 100)}vw + ${Math.round(BLEED * ZOOM)}px)`
  return `${Math.round(coverWidth(PHONE.width, PHONE.height, ratio) * ZOOM)}px`
}

/** Cadrage sur téléphone : point focal au centre du cadre portrait ; rien pour le centre par défaut (cadrage de hero.css). */
export const heroMobilePosition = (m: MediaRef) => focalCover(m, PHONE.width / PHONE.height, 'hero')

/** Image affichée sur téléphone : l'image pour téléphone si elle est renseignée (et chargée), sinon l'image de fond. */
const phoneImage = (background: MediaRef, phone: MediaRef) => (mediaUrl(phone) ? phone : background)

/**
 * Photo entière sur fond flou (attribut data-whole de la diapositive, hero.css) : « phone » sur téléphone (image pour
 * téléphone, sinon image de fond), « tall » sur une tablette tenue en hauteur (image de fond), quand le cadre couperait plus
 * de 40 % environ de la photo (photo en largeur ou carrée sur téléphone ; en largeur sur tablette). Une photo en hauteur
 * couvre le cadre. Jamais pour les visuels de repli du site (paysages faits pour couvrir le cadre).
 */
export function heroWhole(background: MediaRef, phone: MediaRef): string | undefined {
  const onPhone = phoneImage(background, phone)
  const tokens = [
    mediaUrl(onPhone) && wholeIn(mediaOrientation(onPhone, 'hero'), PHONE_FRAME) ? 'phone' : null,
    mediaUrl(background) && wholeIn(mediaOrientation(background, 'hero'), TALL_FRAME) ? 'tall' : null,
  ].filter(Boolean)
  return tokens.length ? tokens.join(' ') : undefined
}

/**
 * Source « téléphone » d'une diapositive : l'image pour téléphone si elle est renseignée (centrée par défaut), sinon
 * l'image de fond (ou le visuel de repli), recadrée autour de son point focal ; en photo entière, pleine largeur.
 */
export function heroMobileSource(background: MediaRef, phone: MediaRef, fallbackSrc: string): MobileSource {
  const whole = heroWhole(background, phone)?.split(' ').includes('phone') ?? false
  const sizes = (m: MediaRef) => (whole ? HERO_SIZES : heroMobileSizes(mediaRatio(m, 'hero')))
  if (mediaUrl(phone)) return { media: phone, size: 'hero', sizes: sizes(phone), position: whole ? undefined : (heroMobilePosition(phone) ?? '50% 50%') }
  return { media: background, size: 'hero', fallbackSrc, sizes: sizes(background), position: whole ? undefined : heroMobilePosition(background) }
}
