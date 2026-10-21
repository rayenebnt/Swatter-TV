// Format du champ `forecast` du global « meteo » (rempli par src/lib/import/meteo.ts, lu par les composants météo).

export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm'

export type ForecastCity = {
  name: string
  kind: WeatherKind
  /** Libellé français : « Ensoleillé », « Averses »… */
  label: string
  min: number
  max: number
}

/** Prévisions détaillées d'une ville pour un jour : temps actuel, courbe horaire, tranches, bulletin. */
export type CityView = {
  main: { city: string; kind: WeatherKind; label: string; now: number; min: number; max: number }
  /** Températures de 6 h à minuit (pas de 2 ou 3 h). */
  hours: { hour: number; temp: number; kind: WeatherKind }[]
  parts: { label: 'Matin' | 'Après-midi' | 'Soirée'; kind: WeatherKind; temp: number }[]
  /** Texte généré automatiquement (pour la ville principale : remplacé par le bulletin saisi pour aujourd'hui s'il existe). */
  bulletin: string
}

/** Un jour : la ville principale en détail (vue de toute la région), toutes les villes en résumé, les autres en détail. */
export type ForecastDay = CityView & {
  /** Jour au format AAAA-MM-JJ (heure de Paris). */
  date: string
  cities: ForecastCity[]
  /** Prévisions détaillées des autres villes suivies (pages Météo par département). */
  views?: CityView[]
}

export type Forecast = {
  region: string
  /** Attribution de la source, ex. « Open-Meteo (CC BY 4.0) ». */
  source: string
  /** ISO 8601. */
  updatedAt: string
  days: ForecastDay[]
}

export const isForecast = (v: unknown): v is Forecast =>
  typeof v === 'object' && v !== null && Array.isArray((v as Forecast).days) && (v as Forecast).days.length > 0
