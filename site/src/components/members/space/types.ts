// « Mon espace » : données transmises aux composants client (valeurs simples uniquement, jamais le document membre).
import type { MemberItem } from '@/lib/members/items'

/** Une entrée de l'historique ou de « Ma liste » : le contenu, la date de l'action (ISO) et sa mention prête à afficher. */
export type SpaceEntry = {
  /** « video:12 » : clé unique (type et numéro du contenu) */
  key: string
  item: MemberItem
  /** ISO 8601 : regardé le / ajouté le */
  at: string
  /** « Regardée à 14:05 », « Ajouté le 12 octobre 2026 »… (calculée côté serveur, heure de Paris) */
  note: string
}

/** Entrées de l'historique d'un même jour (heure de Paris). */
export type HistoryGroup = {
  /** AAAA-MM-JJ */
  day: string
  /** « Aujourd’hui », « Hier », « Samedi 17 octobre » */
  label: string
  entries: SpaceEntry[]
}
