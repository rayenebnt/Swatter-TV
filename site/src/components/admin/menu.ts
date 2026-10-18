// Menu de l'administration, dans l'ordre du menu du site (src/components/layout/nav.ts) pour s'y retrouver d'un coup d'œil.
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

/** Grille des programmes : directement sur la semaine en cours (sans passer par la redirection de src/proxy.ts). */
export const scheduleSearch = () => rangeSearch(currentMonday(), 7)

export const MENU: MenuSection[] = [
  {
    title: 'Les rubriques du site',
    items: [
      { label: 'Accueil et direct', path: '/globals/settings', icon: 'home' },
      { label: 'L’Info', path: '/collections/articles', icon: 'article' },
      { label: 'La Météo', path: '/globals/meteo', icon: 'weather' },
      { label: 'Agenda', path: '/collections/events', icon: 'event' },
      { label: 'Programme TV', path: '/collections/schedule', icon: 'grid', search: scheduleSearch },
      { label: 'Émissions', path: '/collections/programs', icon: 'tv', sub: true },
      { label: 'Le Replay', path: '/collections/replays', icon: 'replay' },
      { label: 'Vidéos', path: '/collections/videos', icon: 'video' },
      { label: 'Webcams', path: '/collections/webcams', icon: 'webcam' },
    ],
  },
  {
    title: 'Également',
    items: [
      { label: 'Publicités', path: '/collections/ads', icon: 'ad' },
      { label: 'Pages (pied de page)', path: '/collections/pages', icon: 'page' },
      { label: 'Médiathèque', path: '/collections/media', icon: 'media' },
    ],
  },
  {
    title: 'Administration',
    adminOnly: true,
    items: [
      { label: 'Utilisateurs', path: '/collections/users', icon: 'users' },
      { label: 'Flux RSS', path: '/collections/rss-feeds', icon: 'rss' },
      { label: 'Redirections', path: '/collections/redirects', icon: 'redirect' },
    ],
  },
]
