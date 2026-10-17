// Prévisions de démonstration sur 5 jours (mi-octobre en Haute-Savoie), au format Forecast.
import type { Forecast, ForecastDay, WeatherKind } from '@/lib/meteo-types'

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

type DayTemplate = {
  main: { kind: WeatherKind; label: string; now: number; min: number; max: number }
  hours: [number, WeatherKind][]
  parts: [WeatherKind, number][]
  /** Chamonix, Chambéry, Lyon, Grenoble, Thonon-les-Bains : [type, min, max] */
  cities: [WeatherKind, number, number][]
  bulletin: string
}

const CITY_NAMES = ['Chamonix', 'Chambéry', 'Lyon', 'Grenoble', 'Thonon-les-Bains']

const DAYS: DayTemplate[] = [
  {
    main: { kind: 'partly', label: 'Éclaircies après dissipation des brouillards', now: 14, min: 7, max: 17 },
    hours: [[7, 'fog'], [9, 'fog'], [13, 'partly'], [16, 'partly'], [17, 'partly'], [14, 'cloud'], [11, 'cloud']],
    parts: [['fog', 8], ['partly', 17], ['cloud', 12]],
    cities: [['partly', -1, 6], ['sun', 8, 16], ['partly', 10, 18], ['sun', 9, 17], ['cloud', 8, 13]],
    bulletin:
      'Les bancs de brouillard du matin se dissipent lentement dans la cluse d’Annecy et la vallée de l’Arve, laissant place à de belles éclaircies l’après-midi. Les températures, jusqu’à 17 °C à Annecy, restent supérieures de 3 °C aux normales de saison. Les nuages gagnent du terrain en soirée.',
  },
  {
    main: { kind: 'sun', label: 'Grand soleil sur les massifs', now: 16, min: 6, max: 19 },
    hours: [[6, 'sun'], [9, 'sun'], [15, 'sun'], [18, 'sun'], [19, 'sun'], [15, 'partly'], [12, 'partly']],
    parts: [['sun', 7], ['sun', 19], ['partly', 13]],
    cities: [['sun', 0, 8], ['sun', 7, 18], ['sun', 9, 20], ['sun', 8, 19], ['partly', 9, 15]],
    bulletin:
      'Grand soleil sur l’ensemble des massifs : une journée idéale pour les sorties en montagne. Après une matinée fraîche, le thermomètre grimpe jusqu’à 19 °C à Annecy et 20 °C à Lyon. Excellente visibilité en altitude.',
  },
  {
    main: { kind: 'cloud', label: 'Nuageux, quelques averses en soirée', now: 13, min: 8, max: 15 },
    hours: [[8, 'cloud'], [10, 'cloud'], [13, 'cloud'], [15, 'cloud'], [14, 'cloud'], [12, 'rain'], [10, 'rain']],
    parts: [['cloud', 9], ['cloud', 15], ['rain', 11]],
    cities: [['cloud', 1, 5], ['cloud', 8, 14], ['partly', 10, 16], ['cloud', 9, 15], ['rain', 8, 12]],
    bulletin:
      'Les nuages gagnent du terrain par l’ouest et le ciel se voile progressivement. Quelques averses sont possibles en fin de journée, notamment sur le Chablais et les bords du Léman. Températures en légère baisse.',
  },
  {
    main: { kind: 'rain', label: 'Pluie modérée, neige au-dessus de 2 200 m', now: 11, min: 7, max: 12 },
    hours: [[7, 'rain'], [8, 'rain'], [10, 'rain'], [12, 'rain'], [11, 'rain'], [9, 'cloud'], [8, 'cloud']],
    parts: [['rain', 8], ['rain', 12], ['cloud', 9]],
    cities: [['snow', -2, 2], ['rain', 8, 12], ['rain', 10, 14], ['rain', 9, 13], ['rain', 7, 10]],
    bulletin:
      'Passage pluvieux sur l’ensemble de la région, avec des cumuls parfois importants sur les Aravis et le massif du Mont-Blanc. Les premiers flocons sont attendus au-dessus de 2 200 mètres : prudence en altitude.',
  },
  {
    main: { kind: 'partly', label: 'Retour des éclaircies', now: 12, min: 4, max: 14 },
    hours: [[4, 'fog'], [6, 'fog'], [11, 'partly'], [14, 'partly'], [13, 'partly'], [10, 'partly'], [7, 'partly']],
    parts: [['fog', 5], ['partly', 14], ['partly', 9]],
    cities: [['partly', -3, 3], ['partly', 5, 13], ['sun', 7, 15], ['partly', 6, 14], ['partly', 5, 11]],
    bulletin:
      'Matinée fraîche avec des bancs de brouillard dans les vallées, puis retour des éclaircies l’après-midi. Les sommets, fraîchement enneigés, se dévoilent sous un ciel lumineux.',
  },
]

const PART_LABELS = ['Matin', 'Après-midi', 'Soirée'] as const

/** Prévisions sur 5 jours à partir de `days[0]` (jours AAAA-MM-JJ, heure de Paris). */
export function demoForecast(days: string[], now: Date): Forecast {
  const out: ForecastDay[] = DAYS.slice(0, days.length).map((t, i) => ({
    date: days[i],
    main: { city: 'Annecy', ...t.main },
    hours: t.hours.map(([temp, kind], h) => ({ hour: HOURS[h], temp, kind })),
    parts: t.parts.map(([kind, temp], p) => ({ label: PART_LABELS[p], kind, temp })),
    cities: [
      { name: 'Annecy', kind: t.main.kind, label: LABELS[t.main.kind], min: t.main.min, max: t.main.max },
      ...t.cities.map(([kind, min, max], c) => ({ name: CITY_NAMES[c], kind, label: LABELS[kind], min, max })),
    ],
    bulletin: t.bulletin,
  }))
  return {
    region: 'Auvergne-Rhône-Alpes',
    source: 'Données de démonstration',
    updatedAt: now.toISOString(),
    days: out,
  }
}
