// Photos de fond des en-têtes des pages intérieures (PageHeader) : les montagnes de la chaîne, nommées sur l'image. Le
// carrousel de l'accueil garde ses propres images. Photos du client agrandies (public/visuels), lieux dans VISUAL_PLACES.
import { mediaPlace } from '@/lib/media'

export type HeaderPhoto = 'bargy' | 'mole'

/** `mobileSrc` : autre fichier sur téléphone (photo d'origine en hauteur, plus nette dans un cadre presque carré). */
type PhotoDef = { src: string; mobileSrc?: string; place: string | null; position: string; positionMobile: string }

const photo = (src: string, position: string, positionMobile: string, mobileSrc?: string): PhotoDef => ({
  src,
  ...(mobileSrc ? { mobileSrc } : {}),
  place: mediaPlace(null, src),
  position,
  positionMobile,
})

/**
 * Cadrage : le Bargy, falaises sur toute la largeur et sommet à droite ; le Môle, sommet au centre. Sur téléphone, le cadre
 * presque carré ne montre qu'une bande verticale : celle du sommet.
 */
export const HEADER_PHOTOS: Record<HeaderPhoto, PhotoDef> = {
  bargy: photo('/visuels/bargy.webp', '50% 34%', '74% 40%'),
  mole: photo('/visuels/mole.webp', '50% 36%', '50% 38%', '/visuels/mole-portrait.webp'),
}
