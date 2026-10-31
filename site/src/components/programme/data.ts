// Programme TV : données côté serveur.
import { cache } from 'react'
import { eveningWindow } from '@/lib/broadcast'
import { getScheduleBetween, type Slot } from '@/lib/queries/schedule'
import { PROGRAMME_DAYS, shiftDay } from './model'

/**
 * Créneaux des soirées proposées (ce soir 18 h → 0 h 30 au bout de la 7e soirée, heure de Paris ; getScheduleBetween
 * regarde aussi en arrière, pour un créneau commencé avant 18 h), mis en cache pour la durée d'un rendu : la grille et la
 * vue liste d'une même page ne font qu'une requête. Les créneaux hors antenne sont écartés ensuite (slotsOfEvening).
 */
export const getProgrammeWeek = cache(
  (today: string): Promise<Slot[]> => getScheduleBetween(eveningWindow(today).start, eveningWindow(shiftDay(today, PROGRAMME_DAYS - 1)).end),
)
