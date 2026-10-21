// Tests unitaires de src/lib/meteo.ts et src/lib/meteo-types.ts : types de temps et codes WMO d’Open-Meteo,
// températures, villes suivies (une par département, Annecy en tête), adresses, et lecture défensive du champ
// `forecast` du global « meteo » (valeurs absentes ou invalides, villes non suivies, jours triés).
import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '@/lib/departments'
import {
  addDays,
  formatTemp,
  isOpenMeteo,
  isWeatherKind,
  KIND_LABEL,
  METEO_CITIES,
  METEO_CITY_LIST,
  METEO_REGION,
  meteoCityOf,
  meteoHref,
  OPEN_METEO_SOURCE,
  PART_LABELS,
  readForecast,
  wmoKind,
  wmoLabel,
} from '@/lib/meteo'
import { isForecast, type WeatherKind } from '@/lib/meteo-types'

const KINDS: WeatherKind[] = ['sun', 'partly', 'cloud', 'rain', 'snow', 'fog', 'storm']

/** Jour valide au format du global (ville principale, une ville, une vue détaillée). */
function storedDay(date: string, extra: Record<string, unknown> = {}) {
  return {
    date,
    main: { city: 'Annecy', kind: 'sun', label: 'Ensoleillé', now: 14, min: 3, max: 16 },
    hours: [
      { hour: 6, temp: 3, kind: 'sun' },
      { hour: 0, temp: 5, kind: 'cloud' },
    ],
    parts: [
      { label: 'Matin', kind: 'sun', temp: 3 },
      { label: 'Après-midi', kind: 'sun', temp: 16 },
      { label: 'Soirée', kind: 'partly', temp: 9 },
    ],
    bulletin: 'Grand soleil.',
    cities: [{ name: 'Lyon', kind: 'partly', label: 'Éclaircies', min: 6, max: 18 }],
    views: [{ main: { city: 'Lyon', kind: 'partly', label: 'Éclaircies', now: 18, min: 6, max: 18 }, hours: [], parts: [], bulletin: 'Doux.' }],
    ...extra,
  }
}

describe('types de temps et libellés', () => {
  it('sept types de temps, chacun avec son libellé français', () => {
    expect(KIND_LABEL).toEqual({ sun: 'Ensoleillé', partly: 'Éclaircies', cloud: 'Nuageux', rain: 'Pluie', snow: 'Neige', fog: 'Brouillard', storm: 'Orage' })
    for (const k of KINDS) expect(isWeatherKind(k)).toBe(true)
  })

  it('isWeatherKind refuse tout le reste', () => {
    for (const v of ['soleil', 'SUN', '', ' sun', null, undefined, 1, {}, ['sun'], 'toString', 'constructor']) expect(isWeatherKind(v), String(v)).toBe(false)
  })

  it('tranches de la journée, dans l’ordre', () => {
    expect([...PART_LABELS]).toEqual(['Matin', 'Après-midi', 'Soirée'])
  })
})

describe('codes météo WMO (Open-Meteo) → type de temps et libellé', () => {
  it('tous les codes utilisés par Open-Meteo', () => {
    const table: [number, WeatherKind, string][] = [
      [0, 'sun', 'Ensoleillé'],
      [1, 'sun', 'Plutôt ensoleillé'],
      [2, 'partly', 'Éclaircies'],
      [3, 'cloud', 'Couvert'],
      [45, 'fog', 'Brouillard'],
      [48, 'fog', 'Brouillard givrant'],
      [51, 'rain', 'Bruine légère'],
      [53, 'rain', 'Bruine'],
      [55, 'rain', 'Bruine dense'],
      [56, 'rain', 'Bruine verglaçante'],
      [57, 'rain', 'Bruine verglaçante'],
      [61, 'rain', 'Pluie faible'],
      [63, 'rain', 'Pluie modérée'],
      [65, 'rain', 'Pluie forte'],
      [66, 'rain', 'Pluie verglaçante'],
      [67, 'rain', 'Forte pluie verglaçante'],
      [71, 'snow', 'Neige faible'],
      [73, 'snow', 'Neige modérée'],
      [75, 'snow', 'Neige forte'],
      [77, 'snow', 'Grains de neige'],
      [80, 'rain', 'Averses'],
      [81, 'rain', 'Averses modérées'],
      [82, 'rain', 'Fortes averses'],
      [85, 'snow', 'Averses de neige'],
      [86, 'snow', 'Fortes averses de neige'],
      [95, 'storm', 'Orages'],
      [96, 'storm', 'Orages avec grêle'],
      [99, 'storm', 'Orages avec forte grêle'],
    ]
    for (const [code, kind, label] of table) {
      expect(wmoKind(code), String(code)).toBe(kind)
      expect(wmoLabel(code), String(code)).toBe(label)
    }
  })

  it('un code inconnu est rattaché à sa famille, avec le libellé de ce type de temps', () => {
    const families: [number, WeatherKind][] = [
      [4, 'cloud'],
      [10, 'cloud'],
      [44, 'fog'],
      [49, 'fog'],
      [50, 'rain'],
      [60, 'rain'],
      [68, 'rain'],
      [70, 'snow'],
      [79, 'snow'],
      [83, 'rain'],
      [87, 'snow'],
      [97, 'storm'],
      [100, 'storm'],
    ]
    for (const [code, kind] of families) {
      expect(wmoKind(code), String(code)).toBe(kind)
      expect(wmoLabel(code), String(code)).toBe(KIND_LABEL[kind])
    }
  })
})

describe('formatTemp : températures', () => {
  it('« 14° », arrondi au degré', () => {
    expect(formatTemp(14)).toBe('14°')
    expect(formatTemp(14.4)).toBe('14°')
    expect(formatTemp(14.5)).toBe('15°')
    expect(formatTemp(0)).toBe('0°')
  })

  it('négatif avec le signe moins typographique (U+2212), jamais « −0° »', () => {
    expect(formatTemp(-3)).toBe('\u22123°')
    expect(formatTemp(-12.7)).toBe('\u221213°')
    expect(formatTemp(-0.6)).toBe('\u22121°')
    expect(formatTemp(-0.4)).toBe('0°')
    expect(formatTemp(-0.5)).toBe('0°')
  })
})

describe('villes suivies', () => {
  it('une ville par département d’Auvergne-Rhône-Alpes, chacun une seule fois', () => {
    expect(METEO_CITIES).toHaveLength(DEPARTMENTS.length)
    expect(METEO_CITIES.map((c) => c.department).sort()).toEqual(DEPARTMENTS.map((d) => d.value).sort())
    expect(new Set(METEO_CITIES.map((c) => c.name)).size).toBe(METEO_CITIES.length)
  })

  it('Annecy (Haute-Savoie) en tête : la ville principale', () => {
    expect(METEO_CITIES[0]).toMatchObject({ name: 'Annecy', department: 'haute-savoie' })
  })

  it('les villes du guide de l’équipe, coordonnées dans la région', () => {
    expect(METEO_CITIES.map((c) => c.name)).toEqual([
      'Annecy',
      'Lyon',
      'Grenoble',
      'Clermont-Ferrand',
      'Saint-Étienne',
      'Chambéry',
      'Valence',
      'Bourg-en-Bresse',
      'Le Puy-en-Velay',
      'Aurillac',
      'Moulins',
      'Privas',
    ])
    for (const c of METEO_CITIES) {
      expect(c.latitude, c.name).toBeGreaterThan(44)
      expect(c.latitude, c.name).toBeLessThan(47)
      expect(c.longitude, c.name).toBeGreaterThan(2)
      expect(c.longitude, c.name).toBeLessThan(7.5)
    }
  })

  it('ville d’un département ; Annecy à défaut', () => {
    expect(meteoCityOf('isere').name).toBe('Grenoble')
    expect(meteoCityOf('rhone').name).toBe('Lyon')
    expect(meteoCityOf('puy-de-dome').name).toBe('Clermont-Ferrand')
    expect(meteoCityOf('haute-loire').name).toBe('Le Puy-en-Velay')
    for (const d of DEPARTMENTS) expect(meteoCityOf(d.value).department).toBe(d.value)
    expect(meteoCityOf('inconnu' as never).name).toBe('Annecy')
  })

  it('« Annecy, Lyon, … et Privas »', () => {
    expect(METEO_CITY_LIST).toBe(
      'Annecy, Lyon, Grenoble, Clermont-Ferrand, Saint-Étienne, Chambéry, Valence, Bourg-en-Bresse, Le Puy-en-Velay, Aurillac, Moulins et Privas',
    )
  })

  it('région, adresses des pages et source', () => {
    expect(METEO_REGION).toBe('Auvergne-Rhône-Alpes')
    expect(meteoHref(null)).toBe('/meteo')
    expect(meteoHref('isere')).toBe('/meteo/isere')
    expect(OPEN_METEO_SOURCE).toBe('Open-Meteo (CC BY 4.0)')
    expect(isOpenMeteo(OPEN_METEO_SOURCE)).toBe(true)
    expect(isOpenMeteo('open-meteo')).toBe(true)
    expect(isOpenMeteo('OpenMeteo')).toBe(true)
    expect(isOpenMeteo('Prévisions de démonstration')).toBe(false)
    expect(isOpenMeteo('')).toBe(false)
  })

  it('addDays : jour suivant ou précédent, sans fuseau', () => {
    expect(addDays('2026-10-21', 0)).toBe('2026-10-21')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('isForecast', () => {
  it('au moins un jour', () => {
    expect(isForecast({ days: [{}] })).toBe(true)
    for (const v of [null, undefined, 'x', 3, [], {}, { days: [] }, { days: 'lundi' }]) expect(isForecast(v), JSON.stringify(v)).toBe(false)
  })
})

describe('readForecast : lecture défensive du global « meteo »', () => {
  it('rien d’exploitable : null', () => {
    for (const v of [null, undefined, 'texte', 42, [], {}, { days: [] }, { days: [null, 'x', 3] }, { days: [{ date: '2026-10-21' }] }]) {
      expect(readForecast(v), JSON.stringify(v)).toBeNull()
    }
  })

  it('une prévision valide est rendue telle quelle, région imposée, source et date nettoyées', () => {
    const value = { region: 'Ailleurs', source: '  Open-Meteo (CC BY 4.0) ', updatedAt: ' 2026-10-21T10:00:00.000Z ', days: [storedDay('2026-10-21')] }
    expect(readForecast(value)).toEqual({
      region: 'Auvergne-Rhône-Alpes',
      source: 'Open-Meteo (CC BY 4.0)',
      updatedAt: '2026-10-21T10:00:00.000Z',
      days: [storedDay('2026-10-21')],
    })
  })

  it('source et date absentes ou d’un autre type : chaînes vides', () => {
    const forecast = readForecast({ source: 3, days: [storedDay('2026-10-21')] })
    expect(forecast).toMatchObject({ source: '', updatedAt: '' })
  })

  it('jours triés par date ; jours sans date valide ou sans temps principal écartés', () => {
    const forecast = readForecast({
      days: [
        storedDay('2026-10-23'),
        storedDay('21/10/2026'),
        storedDay('2026-10-21'),
        storedDay('2026-10-22', { main: { city: 'Annecy', kind: 'soleil', now: 1, min: 1, max: 1 } }),
        storedDay('2026-10-24', { main: { city: 'Annecy', kind: 'sun', now: '14', min: 3, max: 16 } }),
        storedDay('2026-10-25', { main: { city: 'Annecy', kind: 'sun', now: 14, min: Number.NaN, max: 16 } }),
        storedDay('2026-10-26', { main: null }),
      ],
    })
    expect(forecast?.days.map((d) => d.date)).toEqual(['2026-10-21', '2026-10-23'])
  })

  it('valeurs de repli : ville principale Annecy, libellé du type de temps, nombres arrondis, bulletin vide', () => {
    const day = readForecast({ days: [storedDay('2026-10-21', { main: { kind: 'rain', now: 7.6, min: 2.4, max: 9.5 }, bulletin: 42 })] })?.days[0]
    expect(day?.main).toEqual({ city: 'Annecy', kind: 'rain', label: 'Pluie', now: 8, min: 2, max: 10 })
    expect(day?.bulletin).toBe('')
  })

  it('heures et tranches invalides écartées une à une', () => {
    const day = readForecast({
      days: [
        storedDay('2026-10-21', {
          hours: [
            { hour: 6, temp: 3.4, kind: 'sun' },
            { hour: 9, temp: 'chaud', kind: 'sun' },
            { hour: 12, temp: 9, kind: 'beau' },
            null,
            'x',
            { hour: 15, temp: 11, kind: 'cloud' },
          ],
          parts: [
            { label: 'Matin', kind: 'sun', temp: 3 },
            { label: 'Nuit', kind: 'sun', temp: 1 },
            { label: 'Soirée', kind: 'storm', temp: 12.6 },
            { label: 'Après-midi', kind: 'sun' },
          ],
        }),
      ],
    })?.days[0]
    expect(day?.hours).toEqual([
      { hour: 6, temp: 3, kind: 'sun' },
      { hour: 15, temp: 11, kind: 'cloud' },
    ])
    expect(day?.parts).toEqual([
      { label: 'Matin', kind: 'sun', temp: 3 },
      { label: 'Soirée', kind: 'storm', temp: 13 },
    ])
  })

  it('seulement les villes suivies, dans les résumés comme dans les vues détaillées', () => {
    const day = readForecast({
      days: [
        storedDay('2026-10-21', {
          cities: [
            { name: 'Lyon', kind: 'rain', min: 5, max: 12 },
            { name: 'Cluses', kind: 'sun', label: 'Ensoleillé', min: 1, max: 9 },
            { name: 'Grenoble', kind: 'nuage', min: 5, max: 12 },
            { name: '', kind: 'sun', min: 5, max: 12 },
            { name: 'Privas', kind: 'sun', min: 8, max: null },
            { name: ' Valence ', kind: 'fog', label: '  ', min: 4.5, max: 11.2 },
          ],
          views: [
            { main: { city: 'Lyon', kind: 'rain', now: 9, min: 5, max: 12 }, hours: [], parts: [], bulletin: '' },
            { main: { city: 'Cluses', kind: 'sun', now: 9, min: 1, max: 9 }, hours: [], parts: [], bulletin: '' },
            { main: { city: 'Grenoble', kind: 'sun', now: 9 } },
            'Grenoble',
          ],
        }),
      ],
    })?.days[0]
    expect(day?.cities).toEqual([
      { name: 'Lyon', kind: 'rain', label: 'Pluie', min: 5, max: 12 },
      { name: 'Valence', kind: 'fog', label: 'Brouillard', min: 5, max: 11 },
    ])
    expect(day?.views?.map((v) => v.main.city)).toEqual(['Lyon'])
  })

  it('sans villes ni vues : listes vides', () => {
    const day = readForecast({ days: [storedDay('2026-10-21', { cities: 'Lyon', views: undefined })] })?.days[0]
    expect(day?.cities).toEqual([])
    expect(day?.views).toEqual([])
  })
})
