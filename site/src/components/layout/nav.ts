// Navigation de la coque : rubriques, correspondance de la rubrique active, ouverture du menu mobile.

export type NavItem = { href: string; label: string; live?: boolean }

/** Navigation principale (en-tête). */
export const MAIN_NAV: NavItem[] = [
  { href: '/', label: 'Accueil' },
  { href: '/direct', label: 'Le Direct', live: true },
  { href: '/info', label: 'L’Info' },
  { href: '/meteo', label: 'La Météo' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/programme-tv', label: 'Programme TV' },
  { href: '/replay', label: 'Le Replay' },
]

/** Menu mobile : navigation principale + vidéos et webcams. */
export const DRAWER_NAV: NavItem[] = [...MAIN_NAV, { href: '/videos', label: 'Vidéos' }, { href: '/webcams', label: 'Webcams' }]

/** Rubrique active : correspondance par préfixe (« /info/savoie/… » → « /info »), sauf pour l'accueil. */
export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

// CONTRAT : window « swatter:open-drawer » (CustomEvent<OpenDrawerDetail>, detail facultatif) ouvre le menu mobile ;
// le menu émet window « swatter:drawer » (CustomEvent<{ open: boolean }>) à chaque changement d'état.
export const OPEN_DRAWER_EVENT = 'swatter:open-drawer'
export const DRAWER_STATE_EVENT = 'swatter:drawer'
export type OpenDrawerDetail = { trigger?: HTMLElement | null }
export type DrawerStateDetail = { open: boolean }

/** Ouvre le menu mobile ; le focus reviendra sur `trigger` à la fermeture. */
export function openDrawer(trigger?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent<OpenDrawerDetail>(OPEN_DRAWER_EVENT, { detail: { trigger } }))
}

/** Écoute l'état ouvert / fermé du menu mobile (pour aria-expanded). */
export function onDrawerState(cb: (open: boolean) => void): () => void {
  const on = (e: Event) => cb(Boolean((e as CustomEvent<DrawerStateDetail>).detail?.open))
  window.addEventListener(DRAWER_STATE_EVENT, on)
  return () => window.removeEventListener(DRAWER_STATE_EVENT, on)
}
