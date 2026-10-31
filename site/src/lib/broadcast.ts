// Horaires d'antenne de Swatter TV Info : la chaîne diffuse tous les jours de 18 h à 0 h 30 (heure de Paris) ; le reste
// du temps, il ne se passe rien. Source unique pour la grille, « à l'antenne », la saisie des créneaux et la recopie.
// Logique pure (serveur et navigateur). Aucun changement d'heure ne tombe entre 18 h et 0 h 30 (ils ont lieu à 2 h / 3 h) :
// une soirée dure toujours 6 h 30 réelles.
import { formatTime, parisDateTime, parisDay } from './format'

/** Début de l'antenne, chaque soir (heure de Paris). */
export const BROADCAST_START = '18:00'
/** Fin de l'antenne, le lendemain (heure de Paris). */
export const BROADCAST_END = '00:30'
/** Durée d'une soirée d'antenne, en minutes (18 h → 0 h 30). */
export const BROADCAST_MINUTES = 390

/** « 18 h – 0 h 30 » : horaires affichés aux visiteurs et à l'équipe. */
export const BROADCAST_HOURS_LABEL = '18 h – 0 h 30'

const END_MS = 30 * 60_000

/** Jour civil AAAA-MM-JJ décalé de n jours (calcul calendaire pur, indépendant du fuseau). */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * Soirée (AAAA-MM-JJ, jour où elle commence) à laquelle appartient l'instant `d` : jusqu'à 0 h 30, celle de la veille
 * (encore à l'antenne) ; ensuite, celle du jour, à venir à partir de 18 h. Retirer 30 min réelles revient à retirer
 * 30 min d'horloge : aucun changement d'heure entre 0 h et 0 h 30.
 */
export const eveningOf = (d: Date = new Date()) => parisDay(new Date(d.getTime() - END_MS))

/** Soirée d'antenne `day` : de 18 h ce jour-là à 0 h 30 le lendemain (heure de Paris). */
export function eveningWindow(day: string): { start: Date; end: Date } {
  return { start: parisDateTime(day, BROADCAST_START), end: parisDateTime(shiftDay(day, 1), BROADCAST_END) }
}

/**
 * Soirée en cours, ou la prochaine hors antenne : entre 0 h 30 et 18 h, celle qui commence à 18 h le jour même.
 * `onAir` : la chaîne est à l'antenne à l'instant `d`.
 */
export function currentEvening(d: Date = new Date()): { day: string; start: Date; end: Date; onAir: boolean } {
  const day = eveningOf(d)
  const { start, end } = eveningWindow(day)
  const t = d.getTime()
  return { day, start, end, onAir: t >= start.getTime() && t < end.getTime() }
}

/** La chaîne est à l'antenne à l'instant `d` (de 18 h inclus à 0 h 30 exclu). */
export const isOnAir = (d: Date = new Date()) => currentEvening(d).onAir

/** Soirée d'un créneau qui commence à `start` pendant l'antenne (de 18 h à 0 h 30 exclu) ; null hors antenne. */
export function broadcastEvening(start: Date): string | null {
  if (Number.isNaN(start.getTime())) return null
  const { day, onAir } = currentEvening(start)
  return onAir ? day : null
}

/**
 * Créneau qui commence à `start` et dure `minutes` : null s'il tient dans l'antenne (début de 18 h à 0 h 30 exclu, fin
 * à 0 h 30 au plus tard), sinon la raison, à afficher à l'équipe.
 */
export function slotOutsideBroadcast(start: Date, minutes: number): string | null {
  const day = broadcastEvening(start)
  if (!day) {
    return `La chaîne diffuse tous les jours de ${BROADCAST_HOURS_LABEL} : choisissez une heure de début entre 18:00 et 00:25 (un créneau après minuit se saisit à la date du lendemain).`
  }
  const end = eveningWindow(day).end.getTime()
  const max = Math.floor((end - start.getTime()) / 60_000)
  if (Number.isFinite(minutes) && minutes > max) {
    const finish = formatTime(new Date(start.getTime() + minutes * 60_000))
    return `Ce créneau finirait à ${finish}, après la fin de l'antenne (0 h 30) : ${max} min au plus à partir de ${formatTime(start)}.`
  }
  return null
}
