// Menu de l'administration, dans l'ordre du menu du site (src/components/layout/nav.ts) pour s'y retrouver d'un coup d'œil.
// La section Administration (membres du site, comptes de l'équipe, redirections) n'est montrée qu'aux administrateurs.
import { currentMonday, rangeSearch } from '@/lib/schedule-week'
import type { IconName } from './icons'

export type MenuItem = {
  label: string
  /** chemin sous la racine de l'administration (/admin) */
  path: string
  icon: IconName
  /** sous-rubrique (en retrait sous la précédente) */
  sub?: boolean
  /** paramètres d'adresse calculés à l'affichage */
  search?: () => string
}

export type MenuSection = { title: string; items: MenuItem[]; adminOnly?: boolean }

/**
 * Écrans où le menu s'ouvre par-dessus le contenu (custom.scss, NavLinks.tsx) : ceux où Payload le traite comme une
 * fenêtre (point de rupture « m » de @payloadcms/ui).
 */
export const MODAL_NAV_QUERY = '(max-width: 1024px)'

/** Grille des programmes : directement sur la semaine en cours (sans passer par la redirection de src/proxy.ts). */
export const scheduleSearch = () => rangeSearch(currentMonday(), 7)

export const MENU: MenuSection[] = [
  {
    title: 'Les rubriques du site',
    items: [
      { label: 'Accueil et direct', path: '/globals/settings', icon: 'home' },
      { label: 'Vidéos', path: '/collections/videos', icon: 'video' },
      { label: 'Chaîne YouTube', path: '/globals/youtube', icon: 'video', sub: true },
      { label: 'L’Info', path: '/collections/articles', icon: 'article' },
      { label: 'La Météo', path: '/globals/meteo', icon: 'weather' },
      { label: 'Programme TV', path: '/collections/schedule', icon: 'grid', search: scheduleSearch },
      { label: 'Émissions', path: '/collections/programs', icon: 'tv', sub: true },
      { label: 'Agenda', path: '/collections/events', icon: 'event' },
      { label: 'Webcams', path: '/collections/webcams', icon: 'webcam' },
      { label: 'Le Replay', path: '/collections/replays', icon: 'replay' },
    ],
  },
  {
    title: 'Également',
    items: [
      { label: 'Publicités', path: '/collections/ads', icon: 'ad' },
      { label: 'Pages (pied de page)', path: '/collections/pages', icon: 'page' },
      { label: 'Messages reçus', path: '/collections/messages', icon: 'mail' },
      { label: 'Médiathèque', path: '/collections/media', icon: 'media' },
    ],
  },
  {
    title: 'Administration',
    adminOnly: true,
    items: [
      { label: 'Membres du site', path: '/collections/members', icon: 'member' },
      { label: 'Utilisateurs', path: '/collections/users', icon: 'users' },
      { label: 'Redirections', path: '/collections/redirects', icon: 'redirect' },
    ],
  },
]
