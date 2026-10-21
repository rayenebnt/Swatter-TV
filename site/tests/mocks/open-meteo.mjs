// Faux Open-Meteo pour les tests (sans Internet) : prévisions sur 6 jours à partir d'aujourd'hui (heure de Paris), une
// entrée par ville demandée. Le site le lit par OPEN_METEO_URL=http://127.0.0.1:<port>/v1/forecast.
// Utilisé par scripts/test-complet.mjs et les tests d'intégration ; « node tests/mocks/open-meteo.mjs 8770 » le lance seul.
import http from 'node:http'
import { pathToFileURL } from 'node:url'

/** Prévisions du point n° `i` (températures décalées d'une ville à l'autre ; pluie le lendemain). */
function point(i, days) {
  const base = 9 + i
  const time = []
  const temps = []
  const codes = []
  days.forEach((d, di) => {
    for (let h = 0; h < 24; h++) {
      time.push(`${d}T${String(h).padStart(2, '0')}:00`)
      temps.push(Math.round(base - 4 + 6 * Math.sin(((h - 9) / 24) * Math.PI * 2) - di))
      codes.push(di === 1 ? 61 : 2)
    }
  })
  return {
    current: { temperature_2m: 17.4, weather_code: 2 },
    hourly: { time, temperature_2m: temps, weather_code: codes },
    daily: { time: days, weather_code: days.map(() => 3), temperature_2m_max: days.map((_, di) => base + 3 - di), temperature_2m_min: days.map((_, di) => base - 6 - di) },
  }
}

/** Lance le faux service ; renvoie le serveur (server.close() pour l'arrêter). */
export function startOpenMeteoMock(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const n = (url.searchParams.get('latitude') || '').split(',').length
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
    const days = Array.from({ length: 6 }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 864e5).toISOString().slice(0, 10))
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(Array.from({ length: n }, (_, i) => point(i, days))))
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.argv[2] || 8770)
  await startOpenMeteoMock(port)
  console.log(`Faux Open-Meteo : http://127.0.0.1:${port}/v1/forecast`)
}
