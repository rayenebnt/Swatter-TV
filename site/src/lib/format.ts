import { TIMEZONE } from './site'

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, ...opts })
const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d))

/** « 20:30 » */
export const formatTime = (d: Date | string) => fmt({ hour: '2-digit', minute: '2-digit' }).format(toDate(d))
/** « samedi 17 octobre » */
export const formatDayLong = (d: Date | string) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(d))
/** « 17 octobre 2026 » */
export const formatDate = (d: Date | string) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(d))
/** { weekday: 'Sam.', day: '17', month: 'Oct.' } pour les pastilles de date */
export function dateChip(d: Date | string) {
  const date = toDate(d)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return {
    weekday: cap(fmt({ weekday: 'short' }).format(date)),
    day: fmt({ day: 'numeric' }).format(date),
    month: cap(fmt({ month: 'short' }).format(date)),
  }
}
/** Jour civil à Paris au format AAAA-MM-JJ */
export const parisDay = (d: Date | string = new Date()) => {
  const p = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(toDate(d))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
/** Décalage horaire de Paris (en minutes) à un instant donné, sans dépendre du libellé du fuseau (« GMT+2 », « UTC+2 »…). */
function parisOffsetMinutes(at: Date): number {
  const p = fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((wall - at.getTime()) / 60_000)
}
/** Instant UTC correspondant à « AAAA-MM-JJ HH:MM » heure de Paris (seconde passe pour les jours de changement d'heure). */
export function parisDateTime(day: string, time = '00:00'): Date {
  const guess = new Date(`${day}T${time}:00Z`)
  const first = guess.getTime() - parisOffsetMinutes(guess) * 60_000
  return new Date(guess.getTime() - parisOffsetMinutes(new Date(first)) * 60_000)
}
/** « Il y a 3 h », « Hier », « Il y a 2 j » */
export function timeAgo(d: Date | string, now = new Date()): string {
  const diff = Math.max(0, now.getTime() - toDate(d).getTime()) / 60_000
  if (diff < 1) return 'À l’instant'
  if (diff < 60) return `Il y a ${Math.round(diff)} min`
  if (diff < 24 * 60) return `Il y a ${Math.round(diff / 60)} h`
  const days = Math.floor(diff / (24 * 60))
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days} j`
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`
  return formatDate(d)
}
/** Format numérique français : 995 349 */
export const formatNumber = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ')
