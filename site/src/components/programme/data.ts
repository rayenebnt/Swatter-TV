// Programme TV : données côté serveur.
import { cache } from 'react'
import { parisDateTime } from '@/lib/format'
import { getScheduleBetween, type Slot } from '@/lib/queries/schedule'
import { GRID_START, PROGRAMME_DAYS, shiftDay } from './model'

/**
 * Créneaux des jours proposés (aujourd'hui 6 h → J+7 6 h, heure de Paris), mis en cache pour la durée d'un rendu :
 * la grille et la vue liste d'une même page ne font qu'une requête.
 */
export const getProgrammeWeek = cache(
  (today: string): Promise<Slot[]> => getScheduleBetween(parisDateTime(today, GRID_START), parisDateTime(shiftDay(today, PROGRAMME_DAYS), GRID_START)),
)
