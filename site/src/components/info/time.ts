// L'Info : libellés de date calculés après montage (serveur et client donnent le même premier rendu, voir useNow).
import { parisDateTime, parisDay, timeAgo } from '@/lib/format'

const DAY_MS = 24 * 60 * 60 * 1000

/** Fil « En continu » : l'heure (« 10:12 ») pour aujourd'hui, « Hier », sinon le jour (« 14/10 »), en heure de Paris. */
export function feedLabel(iso: string, clock: string, now: number): string {
  const day = parisDay(iso)
  const today = parisDay(new Date(now))
  if (day === today) return clock
  const yesterday = parisDay(new Date(parisDateTime(today, '12:00').getTime() - DAY_MS))
  if (day === yesterday) return 'Hier'
  const [, month, date] = day.split('-')
  return `${date}/${month}`
}

/** « Il y a 3 h », « Hier »… */
export const agoLabel = (iso: string, now: number) => timeAgo(iso, new Date(now))
