// Prévisions de démonstration sur 5 jours (mi-octobre en Auvergne-Rhône-Alpes), au format Forecast : une prévision
// détaillée par ville suivie (une par département), remplacée par Open-Meteo dès que le site peut le joindre.
import { METEO_CITIES } from '@/lib/meteo'
import type { CityView, Forecast, ForecastDay, WeatherKind } from '@/lib/meteo-types'

const LABELS: Record<WeatherKind, string> = {
  sun: 'Ensoleillé',
  partly: 'Éclaircies',
  cloud: 'Nuageux',
  rain: 'Pluie',
  snow: 'Neige',
  fog: 'Brouillard',
  storm: 'Orage',
}

const HOURS = [6, 9, 12, 15, 18, 21, 0]
const PART_LABELS = ['Matin', 'Après-midi', 'Soirée'] as const

/** Journée type de la ville principale (Annecy). */
type DayTemplate = {
  main: { kind: WeatherKind; label: string; now: number; min: number; max: number }
  hours: [number, WeatherKind][]
  parts: [WeatherKind, number][]
  bulletin: string
}

const DAYS: DayTemplate[] = [
  {
    main: { kind: 'partly', label: 'Éclaircies après dissipation des brouillards', now: 14, min: 7, max: 17 },
    hours: [[7, 'fog'], [9, 'fog'], [13, 'partly'], [16, 'partly'], [17, 'partly'], [14, 'cloud'], [11, 'cloud']],
    parts: [['fog', 8], ['partly', 17], ['cloud', 12]],
    bulletin:
      'Les bancs de brouillard du matin se dissipent lentement dans les vallées, laissant place à de belles éclaircies l’après-midi. Les températures restent supérieures de 3 °C aux normales de saison. Les nuages gagnent du terrain en soirée.',
  },
  {
    main: { kind: 'sun', label: 'Grand soleil', now: 16, min: 6, max: 19 },
    hours: [[6, 'sun'], [9, 'sun'], [15, 'sun'], [18, 'sun'], [19, 'sun'], [15, 'partly'], [12, 'partly']],
    parts: [['sun', 7], ['sun', 19], ['partly', 13]],
    bulletin: 'Grand soleil sur l’ensemble de la région : une journée idéale pour les sorties. Après une matinée fraîche, le thermomètre grimpe nettement l’après-midi.',
  },
  {
    main: { kind: 'cloud', label: 'Nuageux, quelques averses en soirée', now: 13, min: 8, max: 15 },
    hours: [[8, 'cloud'], [10, 'cloud'], [13, 'cloud'], [15, 'cloud'], [14, 'cloud'], [12, 'rain'], [10, 'rain']],
    parts: [['cloud', 9], ['cloud', 15], ['rain', 11]],
    bulletin: 'Les nuages gagnent du terrain par l’ouest et le ciel se voile progressivement. Quelques averses sont possibles en fin de journée. Températures en légère baisse.',
  },
  {
    main: { kind: 'rain', label: 'Pluie modérée', now: 11, min: 7, max: 12 },
    hours: [[7, 'rain'], [8, 'rain'], [10, 'rain'], [12, 'rain'], [11, 'rain'], [9, 'cloud'], [8, 'cloud']],
    parts: [['rain', 8], ['rain', 12], ['cloud', 9]],
    bulletin: 'Passage pluvieux sur l’ensemble de la région, avec des cumuls parfois importants sur les reliefs. Les premiers flocons sont attendus au-dessus de 2 200 mètres.',
  },
  {
    main: { kind: 'partly', label: 'Retour des éclaircies', now: 12, min: 4, max: 14 },
    hours: [[4, 'fog'], [6, 'fog'], [11, 'partly'], [14, 'partly'], [13, 'partly'], [10, 'partly'], [7, 'partly']],
    parts: [['fog', 5], ['partly', 14], ['partly', 9]],
    bulletin: 'Matinée fraîche avec des bancs de brouillard dans les vallées, puis retour des éclaircies l’après-midi.',
  },
]

/** Écart de température de chaque ville par rapport à Annecy (dans l'ordre de METEO_CITIES). */
const OFFSET = [0, 2, 1, 0, 1, 1, 3, 1, -2, -3, 0, 2]

function cityView(t: DayTemplate, name: string, offset: number, bulletin: string): CityView {
  const shift = (n: number) => n + offset
  return {
    main: { city: name, kind: t.main.kind, label: t.main.label, now: shift(t.main.now), min: shift(t.main.min), max: shift(t.main.max) },
    hours: t.hours.map(([temp, kind], h) => ({ hour: HOURS[h], temp: shift(temp), kind })),
    parts: t.parts.map(([kind, temp], p) => ({ label: PART_LABELS[p], kind, temp: shift(temp) })),
    bulletin,
  }
}

/** Prévisions sur 5 jours à partir de `days[0]` (jours AAAA-MM-JJ, heure de Paris). */
export function demoForecast(days: string[], now: Date): Forecast {
  const out: ForecastDay[] = DAYS.slice(0, days.length).map((t, i) => {
    const [main, ...others] = METEO_CITIES.map((c, j) =>
      cityView(t, c.name, OFFSET[j] ?? 0, j === 0 ? t.bulletin : `Prévisions de démonstration à ${c.name} : ${t.main.label.toLowerCase()}.`),
    )
    return {
      date: days[i],
      ...main,
      cities: [main, ...others].map((v) => ({ name: v.main.city, kind: v.main.kind, label: LABELS[v.main.kind], min: v.main.min, max: v.main.max })),
      views: others,
    }
  })
  return { region: 'Auvergne-Rhône-Alpes', source: 'Données de démonstration', updatedAt: now.toISOString(), days: out }
}
