import { cache } from 'react'
import { dateChip, formatDayLong, formatTime, parisDateTime, parisDay } from '@/lib/format'
import { readForecast } from '@/lib/meteo'
import type { ForecastDay } from '@/lib/meteo-types'
import { getMeteoGlobal } from '@/lib/queries/settings'

/** Jour de prévision et ses libellés, calculés côté serveur en heure de Paris (le client n'utilise pas Intl). */
export type MeteoDay = ForecastDay & {
  /** « Ven. » */
  short: string
  /** « 16 » */
  num: string
  /** « Vendredi » */
  weekday: string
  /** « 16 octobre », « 1er novembre » */
  dayMonth: string
}

export type MeteoData = {
  region: string
  source: string
  /** Instant des données (ISO), ou null. */
  updatedAt: string | null
  /** Aujourd'hui (AAAA-MM-JJ, Paris) au moment du rendu. */
  today: string
  /** Jours à partir d'aujourd'hui (au moins un). */
  days: MeteoDay[]
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function withLabels(day: ForecastDay): MeteoDay {
  const at = parisDateTime(day.date, '12:00')
  const chip = dateChip(at)
  const [weekday = '', ...rest] = formatDayLong(at).split(' ')
  return { ...day, short: chip.weekday, num: chip.day, weekday: cap(weekday), dayMonth: rest.join(' ').replace(/^1 /, '1er ') }
}

/**
 * Prévisions à afficher, du jour même aux suivants (le bulletin saisi dans l'administration remplace celui d'aujourd'hui).
 * null sans prévision exploitable. Une seule lecture par rendu (tuile du bento et widget de l'accueil).
 */
export const getMeteo = cache(async (): Promise<MeteoData | null> => {
  const meteo = await getMeteoGlobal()
  const forecast = readForecast(meteo?.forecast)
  if (!forecast) return null
  const today = parisDay()
  const manual = meteo?.bulletin?.trim()
  const days = forecast.days
    .filter((d) => d.date >= today)
    .map((d) => withLabels(manual && d.date === today ? { ...d, bulletin: manual } : d))
  if (!days.length) return null
  // l'heure des données elles-mêmes ; celle du global change aussi quand on modifie le bulletin
  const updatedAt = [forecast.updatedAt, meteo?.updatedAt].find((v): v is string => !!v && !Number.isNaN(Date.parse(v))) ?? null
  return { region: forecast.region, source: forecast.source, updatedAt, today, days }
})

/** « Mis à jour à 14:05 », ou « Mis à jour le jeudi 15 octobre à 14:05 » pour des données d'un autre jour. */
export function updatedLabel(iso: string | null, today: string): string | null {
  if (!iso) return null
  const time = formatTime(iso)
  return parisDay(iso) === today ? `Mis à jour à ${time}` : `Mis à jour le ${formatDayLong(iso).replace(/ 1 /, ' 1er ')} à ${time}`
}
