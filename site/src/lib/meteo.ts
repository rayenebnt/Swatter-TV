// Météo : types de temps, codes WMO d'Open-Meteo, villes suivies et helpers partagés par les composants et l'import.
import { isForecast, type Forecast, type ForecastCity, type ForecastDay, type WeatherKind } from './meteo-types'

/** Libellé court de chaque type de temps (icônes, villes). */
export const KIND_LABEL: Record<WeatherKind, string> = {
  sun: 'Ensoleillé',
  partly: 'Éclaircies',
  cloud: 'Nuageux',
  rain: 'Pluie',
  snow: 'Neige',
  fog: 'Brouillard',
  storm: 'Orage',
}

const KINDS = new Set<string>(Object.keys(KIND_LABEL))
export const isWeatherKind = (v: unknown): v is WeatherKind => typeof v === 'string' && KINDS.has(v)

export const PART_LABELS = ['Matin', 'Après-midi', 'Soirée'] as const
type PartLabel = (typeof PART_LABELS)[number]
const isPartLabel = (v: unknown): v is PartLabel => typeof v === 'string' && (PART_LABELS as readonly string[]).includes(v)

/** Codes météo WMO (champ `weather_code` d'Open-Meteo) : type de temps et libellé français. */
const WMO: Partial<Record<number, readonly [WeatherKind, string]>> = {
  0: ['sun', 'Ensoleillé'],
  1: ['sun', 'Plutôt ensoleillé'],
  2: ['partly', 'Éclaircies'],
  3: ['cloud', 'Couvert'],
  45: ['fog', 'Brouillard'],
  48: ['fog', 'Brouillard givrant'],
  51: ['rain', 'Bruine légère'],
  53: ['rain', 'Bruine'],
  55: ['rain', 'Bruine dense'],
  56: ['rain', 'Bruine verglaçante'],
  57: ['rain', 'Bruine verglaçante'],
  61: ['rain', 'Pluie faible'],
  63: ['rain', 'Pluie modérée'],
  65: ['rain', 'Pluie forte'],
  66: ['rain', 'Pluie verglaçante'],
  67: ['rain', 'Forte pluie verglaçante'],
  71: ['snow', 'Neige faible'],
  73: ['snow', 'Neige modérée'],
  75: ['snow', 'Neige forte'],
  77: ['snow', 'Grains de neige'],
  80: ['rain', 'Averses'],
  81: ['rain', 'Averses modérées'],
  82: ['rain', 'Fortes averses'],
  85: ['snow', 'Averses de neige'],
  86: ['snow', 'Fortes averses de neige'],
  95: ['storm', 'Orages'],
  96: ['storm', 'Orages avec grêle'],
  99: ['storm', 'Orages avec forte grêle'],
}

/** Type de temps d'un code WMO (un code inconnu est rattaché à sa famille). */
export function wmoKind(code: number): WeatherKind {
  const known = WMO[code]
  if (known) return known[0]
  if (code >= 95) return 'storm'
  if (code >= 85) return 'snow'
  if (code >= 80) return 'rain'
  if (code >= 70) return 'snow'
  if (code >= 50) return 'rain'
  if (code >= 40) return 'fog'
  return code <= 1 ? 'sun' : code === 2 ? 'partly' : 'cloud'
}

/** Libellé français d'un code WMO : « Averses modérées », « Brouillard givrant »… */
export const wmoLabel = (code: number): string => WMO[code]?.[1] ?? KIND_LABEL[wmoKind(code)]

/** « 14° », « −3° » (signe moins typographique). */
export function formatTemp(t: number): string {
  const v = Math.round(t)
  return `${v < 0 ? '−' : ''}${Math.abs(v)}°`
}

export type MeteoCity = { name: string; latitude: number; longitude: number }

/** Villes suivies, dans l'ordre d'affichage ; la première est la ville principale. */
export const METEO_CITIES: readonly MeteoCity[] = [
  { name: 'Annecy', latitude: 45.899, longitude: 6.129 },
  { name: 'Chamonix', latitude: 45.924, longitude: 6.869 },
  { name: 'Chambéry', latitude: 45.564, longitude: 5.917 },
  { name: 'Lyon', latitude: 45.764, longitude: 4.835 },
  { name: 'Grenoble', latitude: 45.188, longitude: 5.724 },
  { name: 'Thonon-les-Bains', latitude: 46.371, longitude: 6.479 },
]

export const METEO_REGION = 'Auvergne-Rhône-Alpes'
export const OPEN_METEO_SOURCE = 'Open-Meteo (CC BY 4.0)'
export const isOpenMeteo = (source: string) => /open-?meteo/i.test(source)

/** Jour suivant (ou précédent) d'une date AAAA-MM-JJ, sans fuseau horaire. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// ----- Lecture défensive du champ JSON `forecast` (rempli par l'import ou le jeu de démonstration) -----

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)

function readCity(v: unknown): ForecastCity | null {
  const c = obj(v)
  const name = text(c?.name)
  const min = int(c?.min)
  const max = int(c?.max)
  if (!c || !name || min === null || max === null || !isWeatherKind(c.kind)) return null
  return { name, kind: c.kind, label: text(c.label) || KIND_LABEL[c.kind], min, max }
}

function readDay(v: unknown): ForecastDay | null {
  const d = obj(v)
  const m = obj(d?.main)
  const date = text(d?.date)
  if (!d || !m || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isWeatherKind(m.kind)) return null
  const now = int(m.now)
  const min = int(m.min)
  const max = int(m.max)
  if (now === null || min === null || max === null) return null
  const hours = list(d.hours).flatMap((h) => {
    const o = obj(h)
    const hour = int(o?.hour)
    const temp = int(o?.temp)
    return o && hour !== null && temp !== null && isWeatherKind(o.kind) ? [{ hour, temp, kind: o.kind }] : []
  })
  const parts = list(d.parts).flatMap((p) => {
    const o = obj(p)
    const temp = int(o?.temp)
    return o && temp !== null && isPartLabel(o.label) && isWeatherKind(o.kind) ? [{ label: o.label, kind: o.kind, temp }] : []
  })
  return {
    date,
    main: { city: text(m.city) || METEO_CITIES[0].name, kind: m.kind, label: text(m.label) || KIND_LABEL[m.kind], now, min, max },
    hours,
    parts,
    cities: list(d.cities).map(readCity).filter((c): c is ForecastCity => c !== null),
    bulletin: text(d.bulletin),
  }
}

/** Prévision valide et nettoyée à partir du JSON du global « meteo » (jours triés), ou null. */
export function readForecast(value: unknown): Forecast | null {
  if (!isForecast(value)) return null
  const days = value.days
    .map((d: unknown) => readDay(d))
    .filter((d): d is ForecastDay => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!days.length) return null
  return { region: text(value.region) || METEO_REGION, source: text(value.source), updatedAt: text(value.updatedAt), days }
}
