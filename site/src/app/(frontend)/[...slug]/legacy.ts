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
  // plan de l'ancien site (SiteW)
  'l-info-du-jour': '/info',
  'le-tirage-au-sort-l-info-du-jour': '/info',
  'l-info-haute-savoie': '/info/haute-savoie',
  'l-info-savoie': '/info/savoie',
  'l-info-l-ain': '/info/ain',
  'l-info-isere': '/info/isere',
  'l-info-rhone': '/info/rhone',
  'l-info-loire': '/info/loire',
  'l-info-haute-loire': '/info/haute-loire',
  'l-info-drome': '/info/drome',
  'l-info-ardeche': '/info/ardeche',
  'l-info-puy-de-dome': '/info/puy-de-dome',
  'l-info-cantal': '/info/cantal',
  'l-info-allier': '/info/allier',
  'l-info-geneve': '/info/autres-regions',
  'l-info-aoste': '/info/autres-regions',
  'nos-videos-du-jour': '/videos',
  'le-tirage-au-sort-video-du-jour': '/videos',
  'le-cinema-films': '/videos?categorie=cinema',
  'le-cinema-dessin': '/videos?categorie=cinema',
  'les-documentaires': '/videos?categorie=documentaire',
  'web-cam-': '/webcams',
  'web-cams-': '/webcams/plus',
  'manif-samedi-17': '/agenda',
  'manif-samedi-24': '/agenda',
  'deposer-une-publicite': '/contact?sujet=publicite',
  casting: '/contact',
  credit: '/credits',
  '4-7-avis': '/',
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
