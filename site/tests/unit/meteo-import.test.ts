// Tests unitaires de l’import météo (src/lib/import/meteo.ts), sans réseau : adresse de l’appel unique à Open-Meteo,
// transformation des réponses (une par ville suivie) en prévisions par jour et par ville (jour de Paris, courbe,
// tranches, température actuelle, villes et vues détaillées), codes météo résumés, jours ou valeurs manquants,
// erreurs, et bulletin rédigé automatiquement. Réponses construites comme celles de tests/mocks/open-meteo.mjs.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildForecast, describeDay, meteoRequestUrl, summarize, writeBulletin } from '@/lib/import/meteo'
import { METEO_CITIES, readForecast } from '@/lib/meteo'
import type { CityView, ForecastCity, ForecastDay, WeatherKind } from '@/lib/meteo-types'

const NBSP = '\u00a0'
const MINUS = '\u2212'
const KINDS: WeatherKind[] = ['sun', 'partly', 'cloud', 'fog', 'rain', 'snow', 'storm']

type Reading = { temp: number | null; code: number | null }
type Daily = { code: number | null; min: number | null; max: number | null }
type PointOptions = {
  hourly?: (hour: number, dayIndex: number, date: string) => Reading
  daily?: (dayIndex: number, date: string) => Daily
  current?: { temperature_2m: unknown; weather_code: unknown } | null
}

/** Jours AAAA-MM-JJ consécutifs. */
const daysFrom = (first: string, n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${first}T12:00:00Z`) + i * 864e5).toISOString().slice(0, 10))

/** Réponse d'Open-Meteo pour un point (forme de tests/mocks/open-meteo.mjs : températures décalées par ville, pluie le lendemain). */
function point(i: number, days: string[], options: PointOptions = {}) {
  const base = 9 + i
  const hourly = options.hourly ?? ((h, di) => ({ temp: Math.round(base - 4 + 6 * Math.sin(((h - 9) / 24) * Math.PI * 2) - di), code: di === 1 ? 61 : 2 }))
  const daily = options.daily ?? ((di) => ({ code: 3, min: base - 6 - di, max: base + 3 - di }))
  const time: string[] = []
  const temps: (number | null)[] = []
  const codes: (number | null)[] = []
  days.forEach((d, di) => {
    for (let h = 0; h < 24; h++) {
      const r = hourly(h, di, d)
      time.push(`${d}T${String(h).padStart(2, '0')}:00`)
      temps.push(r.temp)
      codes.push(r.code)
    }
  })
  const dailies = days.map((d, di) => daily(di, d))
  return {
    current: options.current === undefined ? { temperature_2m: 17.4, weather_code: 2 } : options.current,
    hourly: { time, temperature_2m: temps, weather_code: codes },
    daily: {
      time: days,
      weather_code: dailies.map((x) => x.code),
      temperature_2m_max: dailies.map((x) => x.max),
      temperature_2m_min: dailies.map((x) => x.min),
    },
  }
}

/** Une réponse par ville suivie ; `overrides[i]` remplace les options de la ville n° i. */
const responses = (days: string[], options: PointOptions = {}, overrides: Record<number, PointOptions> = {}) =>
  METEO_CITIES.map((_, i) => point(i, days, overrides[i] ?? options))

const NOW = new Date('2026-10-21T10:00:00Z')
const SIX_DAYS = daysFrom('2026-10-21', 6)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('meteoRequestUrl : un seul appel pour toutes les villes', () => {
  it('coordonnées de chaque ville suivie dans l’ordre, données horaires et quotidiennes, heure de Paris, six jours', () => {
    const url = new URL(meteoRequestUrl())
    const p = url.searchParams
    expect(p.get('latitude')).toBe(METEO_CITIES.map((c) => c.latitude).join(','))
    expect(p.get('longitude')).toBe(METEO_CITIES.map((c) => c.longitude).join(','))
    expect(p.get('current')).toBe('temperature_2m,weather_code')
    expect(p.get('hourly')).toBe('temperature_2m,weather_code')
    expect(p.get('daily')).toBe('weather_code,temperature_2m_max,temperature_2m_min')
    expect(p.get('timezone')).toBe('Europe/Paris')
    expect(p.get('forecast_days')).toBe('6')
  })

  it('Open-Meteo par défaut ; OPEN_METEO_URL le remplace (tests hors ligne)', async () => {
    vi.stubEnv('OPEN_METEO_URL', '')
    vi.resetModules()
    const defaults = await import('@/lib/import/meteo')
    expect(defaults.meteoRequestUrl().startsWith('https://api.open-meteo.com/v1/forecast?')).toBe(true)
    vi.stubEnv('OPEN_METEO_URL', 'http://127.0.0.1:8772/v1/forecast')
    vi.resetModules()
    const local = await import('@/lib/import/meteo')
    expect(local.meteoRequestUrl().startsWith('http://127.0.0.1:8772/v1/forecast?')).toBe(true)
  })
})

describe('buildForecast : forme des prévisions', () => {
  const forecast = buildForecast(responses(SIX_DAYS), NOW)

  it('région, source Open-Meteo et heure de l’import', () => {
    expect(forecast.region).toBe('Auvergne-Rhône-Alpes')
    expect(forecast.source).toBe('Open-Meteo (CC BY 4.0)')
    expect(forecast.updatedAt).toBe(NOW.toISOString())
  })

  it('cinq jours à partir d’aujourd’hui (le sixième ne sert qu’à minuit du dernier jour)', () => {
    expect(forecast.days.map((d) => d.date)).toEqual(SIX_DAYS.slice(0, 5))
  })

  it('chaque jour : Annecy en détail, toutes les villes en résumé, les autres en vues détaillées, dans l’ordre', () => {
    for (const day of forecast.days) {
      expect(day.main.city).toBe('Annecy')
      expect(day.cities.map((c) => c.name)).toEqual(METEO_CITIES.map((c) => c.name))
      expect(day.views?.map((v) => v.main.city)).toEqual(METEO_CITIES.slice(1).map((c) => c.name))
      expect(day.bulletin.length).toBeGreaterThan(0)
      for (const v of day.views ?? []) expect(v.bulletin).toContain(v.main.city)
    }
  })

  it('ce que l’import enregistre (JSON) est relu tel quel par le site', () => {
    const stored = JSON.parse(JSON.stringify(forecast))
    expect(readForecast(stored)).toEqual(stored)
  })

  it('même réponse, même résultat (bulletins compris)', () => {
    expect(buildForecast(responses(SIX_DAYS), NOW)).toEqual(forecast)
  })

  it('le jour de départ est celui de Paris : à 0 h 30 à Paris (22 h 30 UTC), c’est déjà le lendemain', () => {
    const late = buildForecast(responses(daysFrom('2026-10-21', 7)), new Date('2026-10-21T22:30:00Z'))
    expect(late.days.map((d) => d.date)).toEqual(daysFrom('2026-10-22', 5))
  })

  it('les jours passés de la réponse sont ignorés', () => {
    const f = buildForecast(responses(daysFrom('2026-10-18', 9)), NOW)
    expect(f.days[0].date).toBe('2026-10-21')
    expect(f.days).toHaveLength(5)
  })
})

describe('buildForecast : courbe, tranches et températures d’une ville', () => {
  // température = 100 × n° du jour + heure : la lecture de chaque heure se vérifie directement
  const clock: PointOptions = {
    hourly: (h, di) => ({ temp: di * 100 + h, code: 0 }),
    daily: () => ({ code: 0, min: 1, max: 30 }),
    current: { temperature_2m: 12.6, weather_code: 0 },
  }
  const f = buildForecast(responses(SIX_DAYS, clock), NOW)

  it('courbe de 6 h à minuit toutes les 3 h ; minuit est lu sur le lendemain', () => {
    expect(f.days[0].hours.map((h) => [h.hour, h.temp])).toEqual([
      [6, 6],
      [9, 9],
      [12, 12],
      [15, 15],
      [18, 18],
      [21, 21],
      [0, 100],
    ])
    expect(f.days[2].hours.at(-1)).toEqual({ hour: 0, temp: 300, kind: 'sun' })
  })

  it('tranches : minimale le matin (6-11 h), maximale l’après-midi (12-17 h), moyenne le soir (18-23 h)', () => {
    expect(f.days[0].parts).toEqual([
      { label: 'Matin', kind: 'sun', temp: 6 },
      { label: 'Après-midi', kind: 'sun', temp: 17 },
      { label: 'Soirée', kind: 'sun', temp: 21 },
    ])
  })

  it('aujourd’hui : température actuelle arrondie ; les jours suivants : la maximale', () => {
    expect(f.days[0].main).toMatchObject({ now: 13, min: 1, max: 30 })
    expect(f.days[1].main).toMatchObject({ now: 30, min: 1, max: 30 })
  })

  it('la température actuelle élargit la minimale et la maximale du jour, aussi dans la liste des villes', () => {
    const hot = buildForecast(responses(SIX_DAYS, { ...clock, current: { temperature_2m: 34.6, weather_code: 0 } }), NOW)
    expect(hot.days[0].main).toMatchObject({ now: 35, min: 1, max: 35 })
    expect(hot.days[0].cities[0]).toMatchObject({ name: 'Annecy', min: 1, max: 35 })
    const cold = buildForecast(responses(SIX_DAYS, { ...clock, current: { temperature_2m: -4.4, weather_code: 0 } }), NOW)
    expect(cold.days[0].main).toMatchObject({ now: -4, min: -4, max: 30 })
    expect(cold.days[1].main).toMatchObject({ now: 30, min: 1, max: 30 })
  })

  it('sans température actuelle (ou illisible), aujourd’hui aussi affiche la maximale', () => {
    for (const current of [null, { temperature_2m: null, weather_code: 0 }, { temperature_2m: '12', weather_code: 0 }]) {
      const g = buildForecast(responses(SIX_DAYS, { ...clock, current }), NOW)
      expect(g.days[0].main.now, JSON.stringify(current)).toBe(30)
    }
  })

  it('minimales et maximales quotidiennes arrondies', () => {
    const g = buildForecast(responses(SIX_DAYS, { ...clock, daily: () => ({ code: 0, min: -2.6, max: 14.5 }), current: null }), NOW)
    expect(g.days[1].cities[0]).toMatchObject({ min: -3, max: 15 })
  })
})

describe('buildForecast : temps de chaque ville et de chaque tranche', () => {
  it('ville : trois heures de pluie entre 6 h et 21 h suffisent pour un temps pluvieux', () => {
    const f = buildForecast(responses(SIX_DAYS, { hourly: (h) => ({ temp: 10, code: h >= 13 && h <= 15 ? 61 : 0 }) }), NOW)
    expect(f.days[0].cities[1]).toMatchObject({ name: 'Lyon', kind: 'rain', label: 'Pluie faible' })
  })

  it('ville : deux heures de pluie seulement, le temps dominant l’emporte', () => {
    const f = buildForecast(responses(SIX_DAYS, { hourly: (h) => ({ temp: 10, code: h === 13 || h === 14 ? 61 : 0 }) }), NOW)
    expect(f.days[0].cities[1]).toMatchObject({ kind: 'sun', label: 'Ensoleillé' })
  })

  it('ville : moins de huit heures connues entre 6 h et 21 h, le code quotidien est repris', () => {
    const f = buildForecast(
      responses(SIX_DAYS, {
        hourly: (h) => (h >= 6 && h <= 12 ? { temp: 10, code: 0 } : { temp: null, code: null }),
        daily: () => ({ code: 45, min: 2, max: 9 }),
        current: null,
      }),
      NOW,
    )
    expect(f.days[0].cities[0]).toMatchObject({ kind: 'fog', label: 'Brouillard', min: 2, max: 9 })
  })

  it('tranche : deux heures de pluie suffisent', () => {
    const f = buildForecast(responses(SIX_DAYS, { hourly: (h) => ({ temp: 10, code: h === 7 || h === 8 ? 63 : 0 }) }), NOW)
    expect(f.days[0].parts.map((p) => p.kind)).toEqual(['rain', 'sun', 'sun'])
    expect(f.days[0].main.label).toBe('Pluie le matin, puis retour du soleil')
  })

  it('brouillard le matin puis soleil : libellé du jour d’après l’évolution', () => {
    const f = buildForecast(responses(SIX_DAYS, { hourly: (h) => ({ temp: 10, code: h < 12 ? 45 : 0 }) }), NOW)
    expect(f.days[0].main.label).toBe('Soleil après dissipation des brouillards')
  })

  it('courbe : type de temps de chaque heure', () => {
    const f = buildForecast(responses(SIX_DAYS, { hourly: (h) => ({ temp: 10, code: h === 18 ? 95 : h === 21 ? 71 : 2 }) }), NOW)
    expect(f.days[0].hours.map((h) => h.kind)).toEqual(['partly', 'partly', 'partly', 'partly', 'storm', 'snow', 'partly'])
  })
})

describe('buildForecast : valeurs et jours manquants', () => {
  it('heures sans température : absentes de la courbe ; tranche sans aucune donnée : absente', () => {
    const f = buildForecast(responses(SIX_DAYS, { hourly: (h) => (h >= 18 || h === 9 ? { temp: null, code: 0 } : { temp: 10, code: 0 }) }), NOW)
    expect(f.days[0].hours.map((h) => h.hour)).toEqual([6, 12, 15, 0])
    expect(f.days[0].parts.map((p) => p.label)).toEqual(['Matin', 'Après-midi'])
    // sans les trois tranches, le libellé du jour est celui de la ville
    expect(f.days[0].main.label).toBe(f.days[0].cities[0].label)
  })

  it('une ville sans prévision un jour : absente de ce jour-là seulement', () => {
    const lyon: PointOptions = { daily: (di) => (di === 2 ? { code: 3, min: null, max: 12 } : { code: 3, min: 4, max: 12 }) }
    const f = buildForecast(responses(SIX_DAYS, {}, { 1: lyon }), NOW)
    expect(f.days[2].cities.map((c) => c.name)).not.toContain('Lyon')
    expect(f.days[2].views?.map((v) => v.main.city)).not.toContain('Lyon')
    expect(f.days[2].cities).toHaveLength(METEO_CITIES.length - 1)
    expect(f.days[1].cities.map((c) => c.name)).toContain('Lyon')
  })

  it('un jour sans prévision pour la ville principale est sauté', () => {
    const annecy: PointOptions = { daily: (di) => ({ code: 3, min: 3, max: di === 1 ? null : 12 }) }
    const f = buildForecast(responses(SIX_DAYS, {}, { 0: annecy }), NOW)
    expect(f.days.map((d) => d.date)).toEqual([SIX_DAYS[0], SIX_DAYS[2], SIX_DAYS[3], SIX_DAYS[4], SIX_DAYS[5]])
  })

  it('une réponse plus courte donne moins de jours', () => {
    expect(buildForecast(responses(daysFrom('2026-10-21', 2)), NOW).days.map((d) => d.date)).toEqual(['2026-10-21', '2026-10-22'])
  })

  it('jour du passage à l’heure d’été (23 heures, sans 2 h) : prévisions complètes', () => {
    const days = daysFrom('2026-03-28', 6)
    const r = responses(days).map((p) => {
      const keep = p.hourly.time.map((t) => t !== '2026-03-29T02:00')
      return {
        ...p,
        hourly: {
          time: p.hourly.time.filter((_, i) => keep[i]),
          temperature_2m: p.hourly.temperature_2m.filter((_, i) => keep[i]),
          weather_code: p.hourly.weather_code.filter((_, i) => keep[i]),
        },
      }
    })
    const f = buildForecast(r, new Date('2026-03-28T10:00:00Z'))
    expect(f.days[1].date).toBe('2026-03-29')
    expect(f.days[1].hours).toHaveLength(7)
    expect(f.days[1].parts).toHaveLength(3)
  })
})

describe('buildForecast : réponses inexploitables', () => {
  it('nombre de points différent du nombre de villes', () => {
    expect(() => buildForecast(responses(SIX_DAYS).slice(0, 1), NOW)).toThrow('Open-Meteo a renvoyé 1 point(s) au lieu de 12')
    expect(() => buildForecast([], NOW)).toThrow('Open-Meteo a renvoyé 0 point(s) au lieu de 12')
  })

  it('erreur signalée par Open-Meteo, avec ou sans raison', () => {
    const r = responses(SIX_DAYS) as unknown[]
    r[0] = { error: true, reason: 'Latitude must be in range of -90 to 90°.' }
    expect(() => buildForecast(r, NOW)).toThrow(`Open-Meteo (Annecy)${NBSP}: Latitude must be in range of -90 to 90°.`)
    r[0] = { error: true }
    expect(() => buildForecast(r, NOW)).toThrow(`Open-Meteo (Annecy)${NBSP}: erreur inconnue`)
  })

  it('point sans données horaires ou quotidiennes', () => {
    const r = responses(SIX_DAYS) as unknown[]
    r[1] = { current: null, daily: {} }
    expect(() => buildForecast(r, NOW)).toThrow('Réponse Open-Meteo incomplète pour Lyon')
    r[1] = null
    expect(() => buildForecast(r, NOW)).toThrow('Réponse Open-Meteo incomplète pour Lyon')
  })

  it('aucune journée à partir d’aujourd’hui', () => {
    expect(() => buildForecast(responses(daysFrom('2026-10-15', 6)), NOW)).toThrow(`Open-Meteo${NBSP}: aucune journée exploitable à partir d’aujourd’hui`)
  })
})

describe('summarize : temps représentatif d’une période', () => {
  it('les précipitations l’emportent dès le nombre d’heures demandé', () => {
    expect(summarize([0, 0, 0, 0, 0, 61, 61, 61], 3)).toEqual({ kind: 'rain', label: 'Pluie faible' })
    expect(summarize([0, 0, 0, 0, 0, 95, 95], 2)).toEqual({ kind: 'storm', label: 'Orages' })
  })

  it('sinon le temps dominant, pondéré (quelques heures de pluie pèsent plus que des heures sèches)', () => {
    expect(summarize([0, 0, 0, 0, 0, 0, 61, 61], 3)).toEqual({ kind: 'sun', label: 'Ensoleillé' })
    expect(summarize([0, 0, 0, 61, 61], 3)).toEqual({ kind: 'rain', label: 'Pluie faible' })
    expect(summarize([0, 0, 0, 0, 0, 3, 3, 3, 3, 3], 3)).toEqual({ kind: 'cloud', label: 'Couvert' })
  })

  it('libellé : le code le plus fréquent du type retenu, à égalité le plus intense', () => {
    expect(summarize([61, 61, 63], 2)).toEqual({ kind: 'rain', label: 'Pluie faible' })
    expect(summarize([61, 63], 2)).toEqual({ kind: 'rain', label: 'Pluie modérée' })
    expect(summarize([61, 71, 71], 2)).toEqual({ kind: 'snow', label: 'Neige faible' })
    expect(summarize([1, 1, 0], 2)).toEqual({ kind: 'sun', label: 'Plutôt ensoleillé' })
  })
})

describe('describeDay : libellé du jour d’après le matin, l’après-midi et la soirée', () => {
  const city: ForecastCity = { name: 'Annecy', kind: 'cloud', label: 'Couvert', min: 3, max: 12 }
  const parts = (m: WeatherKind, a: WeatherKind, s: WeatherKind): ForecastDay['parts'] => [
    { label: 'Matin', kind: m, temp: 3 },
    { label: 'Après-midi', kind: a, temp: 12 },
    { label: 'Soirée', kind: s, temp: 8 },
  ]

  it('brouillards matinaux qui se dissipent', () => {
    expect(describeDay(parts('fog', 'sun', 'sun'), city)).toBe('Soleil après dissipation des brouillards')
    expect(describeDay(parts('fog', 'partly', 'rain'), city)).toBe('Éclaircies après dissipation des brouillards')
    expect(describeDay(parts('fog', 'cloud', 'cloud'), city)).toBe('Brouillards matinaux, puis ciel gris')
  })

  it('dégradation en soirée', () => {
    expect(describeDay(parts('sun', 'sun', 'rain'), city)).toBe('Ensoleillé, quelques averses en soirée')
    expect(describeDay(parts('partly', 'partly', 'snow'), city)).toBe('Éclaircies, quelques flocons en soirée')
    expect(describeDay(parts('cloud', 'cloud', 'storm'), city)).toBe('Nuageux, risque d’orage en soirée')
  })

  it('amélioration après une matinée humide', () => {
    expect(describeDay(parts('rain', 'sun', 'sun'), city)).toBe('Pluie le matin, puis retour du soleil')
    expect(describeDay(parts('snow', 'partly', 'cloud'), city)).toBe('Neige le matin, puis éclaircies')
    expect(describeDay(parts('storm', 'cloud', 'cloud'), city)).toBe('Orages le matin, puis temps sec')
    expect(describeDay(parts('rain', 'fog', 'fog'), city)).toBe('Pluie le matin, puis temps brumeux')
  })

  it('journée homogène, pluie persistante ou tranches incomplètes : libellé de la ville', () => {
    expect(describeDay(parts('sun', 'sun', 'sun'), city)).toBe('Couvert')
    expect(describeDay(parts('rain', 'rain', 'rain'), city)).toBe('Couvert')
    expect(describeDay(parts('fog', 'rain', 'rain'), city)).toBe('Couvert')
    expect(describeDay(parts('sun', 'sun', 'sun').slice(0, 2), city)).toBe('Couvert')
    expect(describeDay([], city)).toBe('Couvert')
  })

  it('toutes les combinaisons donnent un libellé', () => {
    for (const m of KINDS) for (const a of KINDS) for (const s of KINDS) expect(describeDay(parts(m, a, s), city), `${m}/${a}/${s}`).toMatch(/^\p{Lu}\S.*\S$/u)
  })
})

describe('writeBulletin : bulletin rédigé automatiquement', () => {
  function day(over: { date?: string; main?: Partial<ForecastDay['main']>; parts?: WeatherKind[]; cities?: ForecastCity[] } = {}): ForecastDay {
    const [m, a, s] = over.parts ?? ['sun', 'sun', 'sun']
    const main = { city: 'Annecy', kind: a, label: 'Ensoleillé', now: 14, min: 3, max: 16, ...over.main }
    return {
      date: over.date ?? '2026-10-21',
      main,
      hours: [],
      parts: [
        { label: 'Matin', kind: m, temp: main.min },
        { label: 'Après-midi', kind: a, temp: main.max },
        { label: 'Soirée', kind: s, temp: main.min + 4 },
      ],
      bulletin: '',
      cities: over.cities ?? [{ name: 'Annecy', kind: a, label: 'Ensoleillé', min: main.min, max: main.max }],
    }
  }
  const previous = (max: number): CityView => ({
    main: { city: 'Annecy', kind: 'sun', label: 'Ensoleillé', now: max, min: 0, max },
    hours: [],
    parts: [],
    bulletin: '',
  })
  const city = (name: string, kind: WeatherKind, min: number, max: number): ForecastCity => ({ name, kind, label: 'x', min, max })

  it('le jour de la semaine, la ville et ses températures (espace insécable, signe moins)', () => {
    const text = writeBulletin(day({ main: { min: -2, max: 9 } }), undefined)
    expect(text).toMatch(/\bce mercredi\b/i)
    expect(text).toContain('Annecy')
    expect(text).toContain(`${MINUS}2${NBSP}°C`)
    expect(text).toContain(`9${NBSP}°C`)
  })

  it('jamais « aujourd’hui » ni « demain » (le texte reste juste si l’import prend du retard)', () => {
    for (const date of daysFrom('2026-10-19', 7)) {
      const text = writeBulletin(day({ date, parts: ['fog', 'sun', 'rain'] }), previous(12))
      expect(text).not.toMatch(/aujourd|demain/i)
    }
  })

  it('le même jour donne toujours le même texte', () => {
    expect(writeBulletin(day(), previous(10))).toBe(writeBulletin(day(), previous(10)))
  })

  it('évolution par rapport à la veille', () => {
    expect(writeBulletin(day({ main: { max: 16 } }), previous(10))).toContain(', soit 6 degrés de plus que la veille')
    expect(writeBulletin(day({ main: { max: 14 } }), previous(10))).toContain(', en nette hausse par rapport à la veille')
    expect(writeBulletin(day({ main: { max: 10 } }), previous(16))).toContain(', soit 6 degrés de moins que la veille')
    expect(writeBulletin(day({ main: { max: 13 } }), previous(16))).toContain(', en net recul par rapport à la veille')
    const stable = writeBulletin(day({ main: { max: 12 } }), previous(10))
    expect(stable).not.toMatch(/la veille/)
    expect(writeBulletin(day(), undefined)).not.toMatch(/la veille/)
  })

  it('froid marqué et chaleur', () => {
    expect(writeBulletin(day({ main: { min: -6, max: 2 } }), undefined)).toContain(
      `Froid marqué à Annecy, avec ${MINUS}6${NBSP}°C au petit matin et seulement 2${NBSP}°C l’après-midi.`,
    )
    expect(writeBulletin(day({ main: { min: 18, max: 33 } }), undefined)).toContain(
      `Chaleur à Annecy, où le thermomètre atteindra 33${NBSP}°C l’après-midi après 18${NBSP}°C au petit matin.`,
    )
  })

  it('neige ailleurs dans la région (trois villes au plus), mais pas si la ville principale l’a déjà', () => {
    const cities = [
      city('Annecy', 'sun', 3, 16),
      city('Lyon', 'snow', 1, 4),
      city('Grenoble', 'snow', 1, 4),
      city('Chambéry', 'snow', 1, 4),
      city('Aurillac', 'snow', 1, 4),
    ]
    const text = writeBulletin(day({ cities }), undefined)
    expect(text).toContain('à Lyon, à Grenoble et à Chambéry.')
    expect(text).not.toContain('Aurillac')
    const snowy = writeBulletin(
      day({ parts: ['snow', 'snow', 'snow'], main: { kind: 'snow' }, cities: [city('Annecy', 'snow', -1, 2), city('Lyon', 'snow', 1, 4)] }),
      undefined,
    )
    expect(snowy).not.toContain('Lyon')
  })

  it('orages, gelées et ville la plus douce ; deux remarques au plus, par ordre d’importance', () => {
    const storms = writeBulletin(day({ cities: [city('Annecy', 'sun', 3, 16), city('Valence', 'storm', 12, 17)] }), undefined)
    expect(storms).toContain('Des orages sont possibles à Valence.')
    const frost = writeBulletin(day({ cities: [city('Annecy', 'sun', 3, 16), city('Moulins', 'sun', -2, 15)] }), undefined)
    expect(frost).toContain('Moulins')
    expect(frost).toContain(`${MINUS}2${NBSP}°C`)
    const warm = writeBulletin(day({ cities: [city('Annecy', 'sun', 3, 16), city('Privas', 'sun', 8, 23)] }), undefined)
    expect(warm).toContain('Privas')
    expect(warm).toContain(`23${NBSP}°C`)
    const all = writeBulletin(
      day({
        cities: [
          city('Annecy', 'sun', 3, 16),
          city('Lyon', 'snow', 1, 4),
          city('Valence', 'storm', 12, 17),
          city('Moulins', 'sun', -2, 15),
          city('Privas', 'sun', 8, 23),
        ],
      }),
      undefined,
    )
    expect(all).toContain('Lyon')
    expect(all).toContain('Valence')
    expect(all).not.toContain('Moulins')
    expect(all).not.toContain('Privas')
  })

  it('toutes les évolutions de la journée donnent un texte bien formé', () => {
    for (const m of KINDS) {
      for (const a of KINDS) {
        for (const s of KINDS) {
          const text = writeBulletin(day({ parts: [m, a, s] }), previous(12))
          const label = `${m}/${a}/${s} : ${text}`
          expect(text, label).not.toMatch(/undefined|null|NaN|[{}]| {2}| [,.]/)
          expect(text, label).toMatch(/\.$/)
          for (const sentence of text.split(/(?<=\.) /)) expect(sentence, label).toMatch(/^\p{Lu}/u)
        }
      }
    }
  })
})
