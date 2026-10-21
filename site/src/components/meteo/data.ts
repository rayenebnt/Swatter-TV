import { cache } from 'react'
import { dateChip, formatDayLong, formatTime, parisDateTime, parisDay } from '@/lib/format'
import { departmentLabel, type DepartmentSlug } from '@/lib/departments'
import { METEO_CITIES, meteoCityOf, readForecast } from '@/lib/meteo'
import type { ForecastDay } from '@/lib/meteo-types'
import { refreshMeteoIfStale } from '@/lib/meteo-refresh'
import { getMeteoGlobal } from '@/lib/queries/settings'

/** Jour de prévision et ses libellés, calculés côté serveur en heure de Paris (le client n'utilise pas Intl). */
export type MeteoDay = Omit<ForecastDay, 'views'> & {
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

function withLabels({ views: _views, ...day }: ForecastDay): MeteoDay {
  const at = parisDateTime(day.date, '12:00')
  const chip = dateChip(at)
  const [weekday = '', ...rest] = formatDayLong(at).split(' ')
  // sans les prévisions détaillées des autres villes : inutiles au composant client
  return { ...day, short: chip.weekday, num: chip.day, weekday: cap(weekday), dayMonth: rest.join(' ').replace(/^1 /, '1er ') }
}

/**
 * Jour vu depuis la ville d'un département : ses prévisions détaillées à la place de celles de la ville principale.
 * Prévision enregistrée avant l'ajout du détail par ville : résumé de la ville seulement (la mise à jour suit).
 */
function dayFor(day: ForecastDay, city: string): ForecastDay {
  if (day.main.city === city) return day
  const view = day.views?.find((v) => v.main.city === city)
  if (view) return { ...day, ...view }
  const c = day.cities.find((x) => x.name === city)
  if (!c) return day
  return { ...day, main: { city: c.name, kind: c.kind, label: c.label, now: c.max, min: c.min, max: c.max }, hours: [], parts: [], bulletin: '' }
}

/**
 * Prévisions à afficher, du jour même aux suivants, pour toute la région (ville principale) ou un département (sa ville).
 * Le bulletin saisi dans l'administration remplace celui d'aujourd'hui sur la vue de toute la région.
 * null sans prévision exploitable. Une seule lecture par rendu (tuile du bento et widget de l'accueil).
 */
export const getMeteo = cache(async (dept: DepartmentSlug | null = null): Promise<MeteoData | null> => {
  const meteo = await getMeteoGlobal()
  const forecast = readForecast(meteo?.forecast)
  // prévisions de plus d'une heure (ou de démonstration) : nouvelle lecture d'Open-Meteo après l'envoi de la page
  if (meteo) {
    refreshMeteoIfStale({
      autoUpdate: meteo.autoUpdate !== false,
      source: forecast?.source ?? null,
      updatedAt: forecast?.updatedAt ?? null,
      // toutes les villes suivies, chacune avec ses prévisions détaillées
      complete: (forecast?.days[0]?.cities.length ?? 0) >= METEO_CITIES.length && (forecast?.days[0]?.views?.length ?? 0) >= METEO_CITIES.length - 1,
    })
  }
  if (!forecast) return null
  const today = parisDay()
  // Bulletin saisi à la main : seulement le jour où il a été écrit, et pour toute la région
  const manual = !dept && meteo?.bulletinDay === today ? meteo?.bulletin?.trim() : undefined
  const city = dept ? meteoCityOf(dept).name : null
  const days = forecast.days
    .filter((d) => d.date >= today)
    .map((d) => (city ? dayFor(d, city) : d))
    .map((d) => withLabels(manual && d.date === today ? { ...d, bulletin: manual } : d))
  if (!days.length) return null
  // l'heure des données elles-mêmes ; celle du global change aussi quand on modifie le bulletin
  const updatedAt = [forecast.updatedAt, meteo?.updatedAt].find((v): v is string => !!v && !Number.isNaN(Date.parse(v))) ?? null
  return { region: dept ? departmentLabel(dept) : forecast.region, source: forecast.source, updatedAt, today, days }
})

/** « Mis à jour à 14:05 », ou « Mis à jour le jeudi 15 octobre à 14:05 » pour des données d'un autre jour. */
export function updatedLabel(iso: string | null, today: string): string | null {
  if (!iso) return null
  const time = formatTime(iso)
  return parisDay(iso) === today ? `Mis à jour à ${time}` : `Mis à jour le ${formatDayLong(iso).replace(/ 1 /, ' 1er ')} à ${time}`
}
