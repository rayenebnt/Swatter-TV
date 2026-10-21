// Google Analytics 4 (gtag.js), chargé à la demande après l'accord du visiteur (« Mesure d'audience ») : file de commandes,
// script, arrêt et effacement des cookies quand l'accord est retiré. Les fonctions reçoivent la fenêtre et le document
// (testables sans navigateur).

export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'

type Gtag = (...args: unknown[]) => void

export type GtagWindow = {
  dataLayer?: unknown[]
  gtag?: Gtag
  /** ID déjà configuré sur cette page : la configuration (et sa page vue) n'est envoyée qu'une fois */
  swatterGa?: string
  [disable: `ga-disable-${string}`]: boolean | undefined
}

type CookieDocument = { cookie: string }
type ScriptDocument = {
  querySelector: (selector: string) => unknown
  createElement: (tag: 'script') => { async: boolean; src: string; dataset: Record<string, string | undefined> }
  head: { appendChild: (node: never) => unknown }
}

/**
 * File de commandes et configuration, une seule fois par page. Accord déjà donné quand cette fonction est appelée :
 * mesure d'audience autorisée ; publicité, signaux Google et personnalisation publicitaire toujours refusés.
 */
export function initGtag(win: GtagWindow, measurementId: string): Gtag {
  const queue = (win.dataLayer ??= [])
  // gtag.js lit des objets `arguments` (pas des tableaux) dans la file
  const gtag: Gtag =
    win.gtag ??
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      queue.push(arguments)
    }
  win.gtag = gtag
  if (win.swatterGa !== measurementId) {
    win.swatterGa = measurementId
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    gtag('js', new Date())
    // première page vue envoyée par « config » ; les suivantes (navigation dans le site) par la mesure améliorée de GA4
    // (« changements d'historique du navigateur », activée par défaut sur le flux de données)
    gtag('config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false })
  }
  return gtag
}

/** Ajoute le script gtag.js à la page (une seule fois). */
export function loadGtag(doc: ScriptDocument, measurementId: string): void {
  if (doc.querySelector('script[data-swatter-ga]')) return
  const script = doc.createElement('script')
  script.async = true
  script.src = `${GTAG_SRC}?id=${encodeURIComponent(measurementId)}`
  script.dataset.swatterGa = measurementId
  doc.head.appendChild(script as never)
}

/** Envoi autorisé ou coupé (« ga-disable-<ID> », reconnu par gtag.js), et accord transmis à gtag s'il est chargé. */
export function setMeasurement(win: GtagWindow, measurementId: string, on: boolean): void {
  win[`ga-disable-${measurementId}`] = !on
  win.gtag?.('consent', 'update', { analytics_storage: on ? 'granted' : 'denied' })
}

/** Cookies de Google Analytics : _ga, _ga_<flux> (GA4), et _gid, _gat des anciennes versions. */
const GA_COOKIE = /^(_ga(_[\w-]+)?|_gid|_gat(_[\w-]+)?)$/

/**
 * Efface les cookies de Google Analytics, déposés sur le domaine principal du site (« .swatter-tv.fr ») ou sur le nom
 * d'hôte : un cookie ne s'efface qu'avec le domaine sous lequel il a été écrit. Renvoie les noms trouvés.
 */
export function clearGaCookies(doc: CookieDocument, hostname: string): string[] {
  const names = doc.cookie
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => GA_COOKIE.test(name))
  const labels = hostname.split('.')
  // « www.swatter-tv.fr » → www.swatter-tv.fr, swatter-tv.fr (et leurs variantes « .domaine ») ; jamais le seul « fr »
  const domains = labels.length > 1 ? labels.slice(0, -1).map((_, i) => labels.slice(i).join('.')) : []
  for (const name of names) {
    const expired = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    doc.cookie = expired
    for (const domain of domains) {
      doc.cookie = `${expired}; domain=${domain}`
      doc.cookie = `${expired}; domain=.${domain}`
    }
  }
  return names
}
