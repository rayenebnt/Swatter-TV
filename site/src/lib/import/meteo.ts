// Import des prévisions (Open-Meteo, sans clé) dans le global « meteo » : un seul appel multi-points,
// puis une transformation pure (buildForecast) testable hors ligne.
import http from 'node:http'
import https from 'node:https'
import type { Payload } from 'payload'
import { formatDayLong, parisDateTime, parisDay } from '@/lib/format'
import { addDays, KIND_LABEL, METEO_CITIES, METEO_REGION, OPEN_METEO_SOURCE, PART_LABELS, wmoKind, wmoLabel } from '@/lib/meteo'
import type { CityView, Forecast, ForecastCity, ForecastDay, WeatherKind } from '@/lib/meteo-types'

// OPEN_METEO_URL : autre adresse (tests sans accès à internet)
const API = process.env.OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast'
const TIMEOUT_MS = 10_000
/** Jours conservés. Un sixième est demandé pour disposer de minuit (0 h) du dernier jour. */
const DAYS = 5
/** Points de la courbe : de 6 h à minuit, toutes les 3 h (0 = minuit, en fin de journée). */
const CHART_HOURS = [6, 9, 12, 15, 18, 21, 0]
/** Tranches de la journée ; températures à la française : minimale le matin, maximale l'après-midi, moyenne le soir. */
const PARTS: { label: (typeof PART_LABELS)[number]; from: number; to: number; temp: 'min' | 'max' | 'mean' }[] = [
  { label: 'Matin', from: 6, to: 11, temp: 'min' },
  { label: 'Après-midi', from: 12, to: 17, temp: 'max' },
  { label: 'Soirée', from: 18, to: 23, temp: 'mean' },
]
/** Adresse de l'appel unique : un point par ville suivie, heure de Paris. */
export function meteoRequestUrl(): string {
  const params = new URLSearchParams({
    latitude: METEO_CITIES.map((c) => c.latitude).join(','),
    longitude: METEO_CITIES.map((c) => c.longitude).join(','),
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'Europe/Paris',
    forecast_days: String(DAYS + 1),
  })
  return `${API}?${params}`
}

// ----- Lecture d'une réponse Open-Meteo (un objet par point) -----

type Reading = { temp: number; code: number }
type DailyReading = { code: number; min: number; max: number }
type Point = { current: Reading | null; hourly: Map<string, Reading>; daily: Map<string, DailyReading> }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const hourKey = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00`
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

function readPoint(raw: unknown, name: string): Point {
  const o = obj(raw)
  if (o?.error === true) throw new Error(`Open-Meteo (${name}) : ${typeof o.reason === 'string' ? o.reason : 'erreur inconnue'}`)
  const hourly = obj(o?.hourly)
  const daily = obj(o?.daily)
  if (!o || !hourly || !daily) throw new Error(`Réponse Open-Meteo incomplète pour ${name}`)

  const hours = new Map<string, Reading>()
  const temps = list(hourly.temperature_2m)
  const codes = list(hourly.weather_code)
  list(hourly.time).forEach((t, i) => {
    const temp = num(temps[i])
    const code = num(codes[i])
    if (typeof t === 'string' && temp !== null && code !== null) hours.set(t, { temp, code })
  })

  const days = new Map<string, DailyReading>()
  const dayCodes = list(daily.weather_code)
  const maxima = list(daily.temperature_2m_max)
  const minima = list(daily.temperature_2m_min)
  list(daily.time).forEach((t, i) => {
    const code = num(dayCodes[i])
    const max = num(maxima[i])
    const min = num(minima[i])
    if (typeof t === 'string' && code !== null && max !== null && min !== null) days.set(t, { code, min, max })
  })

  const current = obj(o.current)
  const temp = num(current?.temperature_2m)
  const code = num(current?.weather_code)
  return { current: temp !== null && code !== null ? { temp, code } : null, hourly: hours, daily: days }
}

// ----- Synthèse : temps dominant, libellé du jour -----

/** Poids de chaque type de temps : quelques heures de pluie l'emportent sur une majorité d'heures sèches. */
const WEIGHT: Record<WeatherKind, number> = { sun: 1, partly: 1, cloud: 1.1, fog: 1.2, rain: 1.8, snow: 2, storm: 3 }
const isWet = (k: WeatherKind) => k === 'rain' || k === 'snow' || k === 'storm'

function dominant(codes: number[]): WeatherKind {
  const score = new Map<WeatherKind, number>()
  for (const code of codes) {
    const k = wmoKind(code)
    score.set(k, (score.get(k) ?? 0) + WEIGHT[k])
  }
  let best: WeatherKind = 'cloud'
  let top = -1
  for (const [k, s] of score) {
    if (s > top || (s === top && WEIGHT[k] > WEIGHT[best])) {
      best = k
      top = s
    }
  }
  return best
}

/**
 * Temps représentatif d'une période à partir des codes horaires : les précipitations l'emportent dès `wetHours` heures,
 * sinon le temps dominant. (Le code quotidien d'Open-Meteo, le plus « sévère » de la journée, est trop pessimiste.)
 */
export function summarize(codes: number[], wetHours: number): { kind: WeatherKind; label: string } {
  const wet = codes.filter((c) => isWet(wmoKind(c)))
  const pool = wet.length >= wetHours ? wet : codes
  const kind = dominant(pool)
  // libellé : le code le plus fréquent de ce type (à égalité, le plus intense)
  const counts = new Map<number, number>()
  for (const c of pool) if (wmoKind(c) === kind) counts.set(c, (counts.get(c) ?? 0) + 1)
  let code = -1
  let n = 0
  for (const [c, k] of counts) {
    if (k > n || (k === n && c > code)) {
      code = c
      n = k
    }
  }
  return { kind, label: wmoLabel(code) }
}

const AFTER_FOG: Record<WeatherKind, string> = {
  sun: 'Soleil après dissipation des brouillards',
  partly: 'Éclaircies après dissipation des brouillards',
  cloud: 'Brouillards matinaux, puis ciel gris',
  fog: 'Brouillard persistant',
  rain: 'Brouillard, puis pluie',
  snow: 'Brouillard, puis neige',
  storm: 'Brouillard, puis orages',
}
const EVENING: Record<WeatherKind, string> = { sun: '', partly: '', cloud: '', fog: '', rain: 'quelques averses', snow: 'quelques flocons', storm: 'risque d’orage' }
const MORNING: Record<WeatherKind, string> = { sun: '', partly: '', cloud: '', fog: '', rain: 'Pluie', snow: 'Neige', storm: 'Orages' }
const CLEARING: Record<WeatherKind, string> = { sun: 'retour du soleil', partly: 'éclaircies', cloud: 'temps sec', fog: 'temps brumeux', rain: '', snow: '', storm: '' }

/** Libellé principal du jour d'après l'évolution matin / après-midi / soirée (à défaut, le libellé WMO du jour). */
export function describeDay(parts: ForecastDay['parts'], city: ForecastCity): string {
  const [m, a, s] = parts.map((p) => p.kind)
  if (!m || !a || !s) return city.label
  if (m === 'fog' && a !== 'fog' && !isWet(a)) return AFTER_FOG[a]
  if (isWet(s) && !isWet(m) && !isWet(a)) return `${KIND_LABEL[a]}, ${EVENING[s]} en soirée`
  if (isWet(m) && !isWet(a) && !isWet(s)) return `${MORNING[m]} le matin, puis ${CLEARING[a]}`
  return city.label
}

// ----- Bulletin rédigé automatiquement -----

/** Graine stable par date : le texte d'un jour ne change pas d'un import à l'autre mais varie d'un jour à l'autre. */
function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const pick = <T>(choices: readonly T[], seed: number, salt = 0): T => choices[(seed + salt) % choices.length]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** « 17 °C », « −2 °C » */
const deg = (t: number) => `${t < 0 ? '−' : ''}${Math.abs(t)} °C`
/** « à Cluses », « à Cluses et à Annemasse », « à Cluses, à Annemasse et à La Clusaz » */
function atPlaces(names: string[]): string {
  const at = names.map((n) => `à ${n}`)
  return at.length > 1 ? `${at.slice(0, -1).join(', ')} et ${at[at.length - 1]}` : (at[0] ?? '')
}
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

/** Journée homogène ({when} = « ce samedi »). */
const UNIFORM: Record<WeatherKind, string[]> = {
  sun: [
    '{when}, grand soleil du matin au soir.',
    'Le soleil s’impose {when}, avec un ciel limpide toute la journée.',
    'Une journée radieuse s’annonce {when}, sans le moindre nuage à l’horizon.',
  ],
  partly: [
    '{when}, nuages et éclaircies se partagent le ciel tout au long de la journée.',
    'Le ciel hésite {when} entre passages nuageux et belles éclaircies.',
    '{when}, le soleil joue à cache-cache avec les nuages.',
  ],
  cloud: ['{when}, le ciel reste gris et chargé toute la journée.', 'Les nuages dominent {when} du matin au soir.'],
  rain: ['{when}, la pluie s’installe pour la journée : prévoyez le parapluie.', 'Journée maussade et pluvieuse {when}.'],
  snow: ['{when}, la neige tombe toute la journée, jusque dans les vallées.', 'Place à la neige {when}, y compris à basse altitude : prudence sur les routes.'],
  fog: ['{when}, le brouillard s’accroche aux vallées et peine à se dissiper.', 'Grisaille et brouillard persistent {when} dans les vallées.'],
  storm: ['{when}, temps lourd et orageux : restez vigilants.', 'Des orages pourront éclater {when} à tout moment de la journée.'],
}
const NOUN: Record<WeatherKind, string> = {
  sun: 'du soleil',
  partly: 'des éclaircies',
  cloud: 'des nuages',
  fog: 'du brouillard',
  rain: 'de la pluie',
  snow: 'de la neige',
  storm: 'des orages',
}

/** Première phrase : l'évolution du ciel au fil de la journée. */
function skySentence([m, a, s]: WeatherKind[], when: string, seed: number): string {
  let template: string
  if (m === a && a === s) {
    template = pick(UNIFORM[m], seed)
  } else if (m === 'fog' && a !== 'fog' && !isWet(a)) {
    const after = { sun: ['un beau soleil', 'le soleil prend le dessus'], partly: ['de belles éclaircies', 'les éclaircies gagnent du terrain'], cloud: ['un ciel nuageux', 'les nuages prennent le relais'] }[a as 'sun' | 'partly' | 'cloud']
    template = pick(
      [`{when}, les brouillards matinaux se dissipent pour laisser place à ${after[0]}.`, `Après un début de journée dans le brouillard, ${after[1]} {when} après-midi.`],
      seed,
    )
  } else if (isWet(s) && !isWet(m) && !isWet(a)) {
    const day = { sun: 'le soleil brille', partly: 'les éclaircies dominent', cloud: 'le ciel reste nuageux', fog: 'la grisaille domine' }[a as 'sun' | 'partly' | 'cloud' | 'fog']
    const arrival = { rain: 'de la pluie', snow: 'de la neige', storm: 'des orages' }[s as 'rain' | 'snow' | 'storm']
    const warn = { rain: 'des averses sont attendues', snow: 'la neige fait son retour', storm: 'des orages menacent' }[s as 'rain' | 'snow' | 'storm']
    template = pick([`{when}, ${day} avant l’arrivée ${arrival} en soirée.`, `Profitez {when} ${a === 'sun' || a === 'partly' ? NOUN[a] : 'du temps sec'} en journée : ${warn} en soirée.`], seed)
  } else if (isWet(m) && !isWet(a) && !isWet(s)) {
    const morning = { rain: ['quelques pluies', 'une pluie'], snow: ['quelques flocons', 'une neige'], storm: ['un épisode orageux', 'une dégradation orageuse'] }[m as 'rain' | 'snow' | 'storm']
    const better = { sun: 'retour du soleil', partly: 'retour des éclaircies', cloud: 'accalmie sous un ciel gris', fog: 'temps brumeux' }[a as 'sun' | 'partly' | 'cloud' | 'fog']
    template = pick([`{when}, ${morning[0]} en matinée, puis ${better} l’après-midi.`, `Le temps s’améliore {when} au fil des heures, après ${morning[1]} matinale.`], seed)
  } else if (isWet(a)) {
    const clause = { rain: 'des averses se développent', snow: 'la neige fait son apparition', storm: 'des orages éclatent' }[a as 'rain' | 'snow' | 'storm']
    template = pick([`{when}, ${clause} au fil de l’après-midi.`, `Le ciel se dégrade {when} après-midi, avec ${NOUN[a]}.`], seed)
  } else if (m === a && !isWet(s)) {
    const daytime = { sun: 'grand soleil', partly: 'alternance de nuages et d’éclaircies', cloud: 'ciel gris', fog: 'brouillard tenace' }[m as 'sun' | 'partly' | 'cloud' | 'fog']
    const evening = { sun: 'un ciel dégagé', partly: 'quelques nuages', cloud: 'les nuages gagnent du terrain', fog: 'le brouillard se reforme' }[s as 'sun' | 'partly' | 'cloud' | 'fog']
    template = `{when}, ${daytime} en journée, puis ${evening} en soirée.`
  } else if (a === s) {
    template = `{when}, ${NOUN[m]} le matin, puis ${NOUN[a]} jusqu’au soir.`
  } else {
    template = `{when}, ${NOUN[m]} le matin, ${NOUN[a]} l’après-midi et ${NOUN[s]} en soirée.`
  }
  return cap(fill(template, { when }))
}

/** Deuxième phrase : les températures de la ville du bulletin et leur évolution par rapport à la veille. */
function tempSentence(day: ForecastDay, previous: CityView | undefined, seed: number): string {
  const { city, min, max } = day.main
  const delta = previous ? max - previous.main.max : 0
  const trend =
    delta >= 5
      ? `, soit ${delta} degrés de plus que la veille`
      : delta >= 3
        ? ', en nette hausse par rapport à la veille'
        : delta <= -5
          ? `, soit ${-delta} degrés de moins que la veille`
          : delta <= -3
            ? ', en net recul par rapport à la veille'
            : ''
  const values = { city, min: deg(min), max: deg(max), trend }
  if (max <= 3) return fill('Froid marqué à {city}, avec {min} au petit matin et seulement {max} l’après-midi{trend}.', values)
  if (max >= 30) return fill('Chaleur à {city}, où le thermomètre atteindra {max} l’après-midi après {min} au petit matin{trend}.', values)
  return fill(
    pick(
      [
        'À {city}, le thermomètre oscillera entre {min} et {max}{trend}.',
        'Les températures iront de {min} au petit matin à {max} l’après-midi à {city}{trend}.',
        'À {city}, le mercure grimpera jusqu’à {max}, après {min} au lever du jour{trend}.',
        'Jusqu’à {max} sont attendus l’après-midi à {city}, pour une minimale de {min}{trend}.',
      ],
      seed,
      1,
    ),
    values,
  )
}

/** Remarques régionales (deux au plus, par ordre d'importance). */
function regionalNotes(day: ForecastDay, seed: number): string[] {
  const { main, cities } = day
  const notes: string[] = []
  const snowy = cities.filter((c) => c.kind === 'snow' && c.name !== main.city).slice(0, 3)
  if (snowy.length && main.kind !== 'snow') {
    notes.push(pick([`La neige fait son retour ${atPlaces(snowy.map((c) => c.name))}.`, `Des flocons sont attendus ${atPlaces(snowy.map((c) => c.name))}.`], seed, 2))
  }
  const stormy = cities.filter((c) => c.kind === 'storm' && c.name !== main.city).slice(0, 3)
  if (stormy.length && main.kind !== 'storm') notes.push(`Des orages sont possibles ${atPlaces(stormy.map((c) => c.name))}.`)
  const coldest = cities.reduce<ForecastCity | null>((low, c) => (!low || c.min < low.min ? c : low), null)
  if (coldest && coldest.min <= 0) {
    notes.push(pick([`Gelées au petit matin à ${coldest.name} (${deg(coldest.min)}).`, `Il gèlera au lever du jour à ${coldest.name}, avec ${deg(coldest.min)}.`], seed, 4))
  }
  const warmest = cities.reduce<ForecastCity | null>((high, c) => (!high || c.max > high.max ? c : high), null)
  if (warmest && warmest.name !== main.city && warmest.max >= main.max + 2) {
    notes.push(pick([`C’est à ${warmest.name} qu’il fera le plus doux, avec ${deg(warmest.max)}.`, `Le thermomètre affichera jusqu’à ${deg(warmest.max)} à ${warmest.name}.`], seed, 5))
  }
  return notes.slice(0, 2)
}

/** Bulletin en français naturel, sans « aujourd'hui » ni « demain » (il reste juste si l'import a pris du retard). */
export function writeBulletin(day: ForecastDay, previous: CityView | undefined): string {
  const seed = seedOf(day.date)
  const weekday = formatDayLong(parisDateTime(day.date, '12:00')).split(' ')[0]
  const kinds = day.parts.length === 3 ? day.parts.map((p) => p.kind) : [day.main.kind, day.main.kind, day.main.kind]
  return [skySentence(kinds, `ce ${weekday}`, seed), tempSentence(day, previous, seed), ...regionalNotes(day, seed)].join(' ')
}

// ----- Transformation complète -----

/** Prévisions détaillées d'une ville pour un jour (sans bulletin). Aujourd'hui : température actuelle, sinon la maximale. */
function cityDetail(point: Point, city: ForecastCity, date: string, today: string): Omit<CityView, 'bulletin'> {
  const hours = CHART_HOURS.flatMap((hour) => {
    const r = point.hourly.get(hourKey(hour === 0 ? addDays(date, 1) : date, hour))
    return r ? [{ hour, temp: Math.round(r.temp), kind: wmoKind(r.code) }] : []
  })
  const parts = PARTS.flatMap((p) => {
    const readings = range(p.from, p.to).flatMap((h) => point.hourly.get(hourKey(date, h)) ?? [])
    if (!readings.length) return []
    const temps = readings.map((r) => r.temp)
    const temp = p.temp === 'min' ? Math.min(...temps) : p.temp === 'max' ? Math.max(...temps) : temps.reduce((a, b) => a + b, 0) / temps.length
    return [{ label: p.label, kind: summarize(readings.map((r) => r.code), 2).kind, temp: Math.round(temp) }]
  })
  // min / max élargis si besoin par la température actuelle, pour rester cohérents
  let { min, max } = city
  let now = max
  if (date === today && point.current) {
    now = Math.round(point.current.temp)
    min = Math.min(min, now)
    max = Math.max(max, now)
  }
  return { main: { city: city.name, kind: city.kind, label: describeDay(parts, city), now, min, max }, hours, parts }
}

/**
 * Transforme les réponses d'Open-Meteo (une par ville de METEO_CITIES, dans le même ordre) en prévisions détaillées
 * de chaque ville sur cinq jours à partir du jour de `now` (heure de Paris). Fonction pure ; lève une erreur si la réponse est inexploitable.
 */
export function buildForecast(responses: readonly unknown[], now: Date): Forecast {
  if (responses.length !== METEO_CITIES.length) {
    throw new Error(`Open-Meteo a renvoyé ${responses.length} point(s) au lieu de ${METEO_CITIES.length}`)
  }
  const points = METEO_CITIES.map((city, i) => readPoint(responses[i], city.name))
  const today = parisDay(now)
  const dates = [...points[0].daily.keys()].filter((d) => d >= today).sort().slice(0, DAYS)

  const days: ForecastDay[] = []
  for (const date of dates) {
    const cities: ForecastCity[] = METEO_CITIES.flatMap((city, i) => {
      const d = points[i].daily.get(date)
      if (!d) return []
      const codes = range(6, 21).flatMap((h) => points[i].hourly.get(hourKey(date, h))?.code ?? [])
      const sky = codes.length >= 8 ? summarize(codes, 3) : { kind: wmoKind(d.code), label: wmoLabel(d.code) }
      return [{ name: city.name, ...sky, min: Math.round(d.min), max: Math.round(d.max) }]
    })
    if (cities[0]?.name !== METEO_CITIES[0].name) continue

    // Détail de chaque ville (courbe, tranches, temps actuel) ; ses min / max élargis valent aussi pour la liste des villes
    const details = cities.map((c, i) => {
      const view = cityDetail(points[METEO_CITIES.findIndex((m) => m.name === c.name)], c, date, today)
      cities[i] = { ...c, min: view.main.min, max: view.main.max }
      return view
    })
    const previous = days.at(-1)
    const withBulletin = (view: Omit<CityView, 'bulletin'>): CityView => {
      const before = view.main.city === previous?.main.city ? previous : previous?.views?.find((v) => v.main.city === view.main.city)
      return { ...view, bulletin: writeBulletin({ date, ...view, cities, bulletin: '' }, before) }
    }
    const [main, ...others] = details
    days.push({ date, ...withBulletin(main), cities, views: others.map(withBulletin) })
  }

  if (!days.length) throw new Error('Open-Meteo : aucune journée exploitable à partir d’aujourd’hui')
  return { region: METEO_REGION, source: OPEN_METEO_SOURCE, updatedAt: now.toISOString(), days }
}

/**
 * GET JSON par le client HTTP de Node plutôt que par fetch : le fetch de Next refuse les requêtes sans cache pendant la
 * régénération d'une page, moment où la mise à jour en arrière-plan est lancée (voir src/lib/meteo-refresh.ts).
 */
function getJson(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('https:') ? https : http).get(url, { headers: { accept: 'application/json' }, timeout: TIMEOUT_MS }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => {
        let json: unknown = null
        try {
          json = JSON.parse(body)
        } catch {
          // réponse illisible : json reste null
        }
        const status = res.statusCode ?? 0
        resolve({ ok: status >= 200 && status < 300, status, json })
      })
    })
    req.on('timeout', () => {
      const error = new Error('délai dépassé')
      error.name = 'TimeoutError'
      req.destroy(error)
    })
    req.on('error', reject)
  })
}

/**
 * Met à jour le global « meteo » (appelé par GET /api/cron/import et `npm run import`).
 * Ne fait rien si la mise à jour automatique est désactivée ; ne lève jamais d'exception.
 */
export async function importMeteo(payload: Payload): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  try {
    const meteo = await payload.findGlobal({ slug: 'meteo', depth: 0 })
    if (meteo.autoUpdate === false) {
      return { ok: false, skipped: true, error: 'mise à jour automatique désactivée dans l’administration (Réglages › Météo)' }
    }
    const res = await getJson(meteoRequestUrl())
    const json = res.json
    if (!res.ok) {
      const reason = obj(json)?.reason
      return { ok: false, error: `Open-Meteo a répondu ${res.status}${typeof reason === 'string' ? ` (${reason})` : ''}` }
    }
    if (json === null) return { ok: false, error: 'réponse d’Open-Meteo illisible (JSON attendu)' }
    const forecast = buildForecast(Array.isArray(json) ? json : [json], new Date())
    await payload.updateGlobal({ slug: 'meteo', data: { forecast, updatedAt: forecast.updatedAt, _status: 'published' }, context: { disableRevalidate: true } })
    return { ok: true }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return { ok: false, error: 'Open-Meteo ne répond pas (délai de 10 s dépassé)' }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
