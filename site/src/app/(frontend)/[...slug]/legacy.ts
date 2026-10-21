// Anciennes adresses traitées par la route attrape-tout : complément des règles de next.config.ts (redirects()).
import { foldText } from '@/components/search/text'

/** Anciennes adresses, comparées sans casse ni accents (« /La-Météo », « /LE-REPLAY »…) → nouvelle adresse. */
const LEGACY: Record<string, string> = {
  accueil: '/',
  'le-direct': '/direct',
  ledirect: '/direct',
  'l-info': '/info',
  linfo: '/info',
  'la-meteo': '/meteo',
  lameteo: '/meteo',
  'programme-tv': '/programme-tv',
  programmetv: '/programme-tv',
  'le-replay': '/replay',
  lereplay: '/replay',
  webcam: '/webcams',
}

/** Rubriques du site : « /Agenda », « /Videos/… » sont redirigées vers leur forme en minuscules. */
const SECTIONS = new Set(['direct', 'info', 'meteo', 'agenda', 'programme-tv', 'replay', 'videos', 'webcams', 'recherche'])

/** Chemin (sans « / » initial) en minuscules et sans accents. */
export const foldPath = (path: string) => foldText(path).replace(/\/+$/, '')

/** Nouvelle adresse d'une ancienne adresse ou d'une variante de casse d'une rubrique ; null sinon. */
export function legacyTarget(path: string): string | null {
  const folded = foldPath(path)
  // Object.hasOwn : « /constructor » ou « /__proto__ » ne doivent pas trouver les propriétés héritées de tout objet
  const target = Object.hasOwn(LEGACY, folded) ? LEGACY[folded] : folded !== path && SECTIONS.has(folded.split('/')[0]) ? `/${folded}` : null
  // Jamais vers l'adresse demandée elle-même (rubrique pas encore en ligne, par exemple)
  return target && target !== `/${path}` ? target : null
}
