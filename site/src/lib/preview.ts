// Aperçu en direct : page du site et endroit de la page qui montrent ce que l'on modifie, adresse d'activation du mode aperçu.
import type { PayloadRequest } from 'payload'
import { eveningOf } from './broadcast'
import { articleUrl, eventUrl, pageUrl, programUrl, replayUrl, videoUrl } from './urls'
import { SITE_URL } from './site'

type Data = { id?: number | string | null; slug?: string | null; department?: string | null; startsAt?: string | null; placement?: string | null }

/** Ce que l'on est en train de modifier dans la fiche : l'onglet ouvert ou le champ touché en dernier (nom du champ de premier niveau). */
export type EditHint = { tab?: string | null; field?: string | null }

/** Page à afficher dans l'aperçu, et élément de la page (attribut data-preview) vers lequel défiler. */
export type PreviewFocus = { path: string; target?: string }

/** Accueil, direct et flash info : chaque onglet (et chacun de ses champs) correspond à un endroit du site. */
const SETTINGS_SPOTS = {
  hero: { path: '/', target: 'hero' },
  live: { path: '/direct', target: 'live' },
  flash: { path: '/', target: 'flash' },
  footer: { path: '/', target: 'footer' },
} satisfies Record<string, PreviewFocus>
const SETTINGS_TABS: Record<string, keyof typeof SETTINGS_SPOTS> = { 'Accueil (carrousel)': 'hero', 'Le direct': 'live', 'Flash info': 'flash', 'Chaîne et contact': 'footer' }
const SETTINGS_FIELDS: Record<string, keyof typeof SETTINGS_SPOTS> = {
  heroSlides: 'hero',
  // note et compteur de vues : affichés en bas du carrousel
  rating: 'hero',
  viewsCount: 'hero',
  liveEnabled: 'live',
  live: 'live',
  livePoster: 'live',
  flashAuto: 'flash',
  flashItems: 'flash',
  tagline: 'footer',
  contact: 'footer',
  socials: 'footer',
}

/** Jour de la grille d'un créneau (jusqu'à 0 h 30, la soirée de la veille, comme sur le site : eveningOf). */
const tvDayOf = (iso: string) => eveningOf(new Date(iso))

/**
 * Où montrer, dans l'aperçu, ce que l'on modifie. Sans indice (ouverture de la fiche), la page du contenu ; un onglet ou
 * un champ précise l'endroit (ex. : onglet « Flash info » → bandeau de l'accueil, onglet « Le direct » → page du direct).
 */
export function previewFocus(collection: string | undefined, global: string | undefined, data: Data, hint: EditHint = {}): PreviewFocus {
  if (global === 'settings') {
    const spot = (hint.field && SETTINGS_FIELDS[hint.field]) || (hint.tab && SETTINGS_TABS[hint.tab]) || 'hero'
    return SETTINGS_SPOTS[spot]
  }
  if (global === 'meteo') return { path: '/meteo', target: hint.field === 'bulletin' ? 'bulletin' : 'forecast' }
  const has = Boolean(data?.slug)
  switch (collection) {
    case 'videos':
      return { path: has ? videoUrl(data) : '/videos' }
    case 'articles':
      return { path: has ? articleUrl(data) : '/info' }
    case 'events':
      return { path: has ? eventUrl(data) : '/agenda' }
    case 'replays':
      return { path: has ? replayUrl(data) : '/replay' }
    case 'pages':
      return { path: has ? pageUrl(data) : '/' }
    case 'schedule': {
      // le jour du créneau, et le créneau lui-même dans la grille
      const day = data?.startsAt && !Number.isNaN(Date.parse(data.startsAt)) ? tvDayOf(data.startsAt) : null
      return { path: day ? `/programme-tv?jour=${day}` : '/programme-tv', target: data?.id ? `slot-${data.id}` : undefined }
    }
    case 'programs':
      // la fiche de l'émission s'ouvre par l'ancre de son adresse
      return { path: has ? programUrl(data) : '/programme-tv' }
    case 'webcams':
      return { path: '/webcams', target: has ? `webcam-${data.slug}` : undefined }
    case 'ads':
      return { path: data?.placement === 'inner-leaderboard' ? '/info' : '/', target: 'ad' }
    default:
      return { path: '/' }
  }
}

/** Page du site qui affiche ce contenu à l'ouverture de l'aperçu (la rubrique, tant que le contenu n'a pas d'adresse). */
export function previewPath(collection: string | undefined, global: string | undefined, data: Data): string {
  return previewFocus(collection, global, data).path
}

/**
 * Seules les adresses internes au site sont acceptées (pas de redirection vers un autre site). Caractères de contrôle et
 * barre oblique inverse refusés : le navigateur les retire ou les convertit, et « /\t/autre-site » deviendrait
 * « //autre-site ».
 */
export function safePath(value: string | null | undefined): string {
   
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\u0000-\u001f\u007f\\]/.test(value)) return '/'
  // chemin normalisé et encodé en ASCII (il finit dans l'en-tête Location de la redirection)
  try {
    const url = new URL(value, 'http://site.invalid')
    // « /.//autre-site » devient « //autre-site » une fois normalisé : une adresse extérieure
    return url.origin === 'http://site.invalid' && !url.pathname.startsWith('//') ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}

/**
 * Adresse absolue (exigée par window.postMessage de l'aperçu) de la même origine que l'administration consultée,
 * pour que le cookie de connexion accompagne l'aperçu.
 */
export function previewUrl(req: PayloadRequest, path: string): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? (SITE_URL.startsWith('https') ? 'https' : 'http')
  const origin = host ? `${proto.split(',')[0]}://${host.split(',')[0]}` : SITE_URL
  return `${origin}/apercu?chemin=${encodeURIComponent(path)}`
}
