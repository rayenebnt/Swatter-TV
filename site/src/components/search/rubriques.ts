// Rubriques du site : suggestions de la recherche (champ vide), page 404 et page de recherche sans résultat.
import type { IconName } from '@/components/ui/Icon'

export type Rubrique = { href: string; label: string; hint: string; icon: IconName }

export const RUBRIQUES: Rubrique[] = [
  { href: '/direct', label: 'Le Direct', hint: 'En direct chaque soir, 18 h – 0 h 30', icon: 'tv' },
  { href: '/programme-tv', label: 'Programme TV', hint: 'La grille des programmes', icon: 'clock' },
  { href: '/meteo', label: 'La Météo', hint: 'Les prévisions de la région', icon: 'now' },
  { href: '/info', label: 'L’Info', hint: 'L’actualité régionale', icon: 'news' },
  { href: '/agenda', label: 'Agenda', hint: 'Les sorties près de chez vous', icon: 'cal' },
  { href: '/replay', label: 'Le Replay', hint: 'Les émissions à voir ou revoir', icon: 'replay' },
  { href: '/videos', label: 'Vidéos', hint: 'Toutes les vidéos de la chaîne', icon: 'play' },
  { href: '/webcams', label: 'Webcams', hint: 'Les webcams de la région', icon: 'pin' },
]

/** Suggestions de la recherche instantanée quand le champ est vide. */
export const SUGGESTIONS = RUBRIQUES.slice(0, 6)

/** Adresse de la page de résultats complets. */
export const searchPageUrl = (q?: string | null) => (q ? `/recherche?q=${encodeURIComponent(q)}` : '/recherche')
