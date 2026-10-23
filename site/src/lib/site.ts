export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
export const SITE_NAME = 'Swatter TV'
/** Titre d'onglet d'une page : « Agenda des sorties en Auvergne-Rhône-Alpes — Swatter TV » (modèle de la mise en page). */
export const pageTitle = (title: string) => `${title} — ${SITE_NAME}`
export const SITE_DESCRIPTION =
  'Swatter TV Info, la chaîne régionale d’Auvergne-Rhône-Alpes : le direct, l’info régionale, la météo, l’agenda des sorties, le programme TV et le replay.'
export const TIMEZONE = 'Europe/Paris'
/** URL absolue du site (laisse intactes les URL déjà absolues, ex. image externe). */
export const absoluteUrl = (path = '/') =>
  /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
