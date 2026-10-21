// « npm run test:complet » : toute la vérification du projet en une commande, sans toucher à la base de travail, au
// dossier media/ ni à la construction .next du site :
//   1. TypeScript (site et tests) et ESLint ;
//   2. tests unitaires et d'intégration (Vitest ; base <base>_tests, recréée) ;
//   3. tests de bout en bout (Playwright, ordinateur et mobile) sur un site de production construit à part (.next-test),
//      avec une base <base>_e2e remplie par les contenus de départ, des médias dans .tests/media-e2e et de faux services
//      (YouTube, Open-Meteo) : aucun accès à Internet n'est nécessaire.
// Options : --rapide (étapes 1 et 2 seulement), --e2e (étape 3 seulement), --garder (laisse le site de test ouvert à la
// fin, pour y regarder ; Ctrl+C pour l'arrêter).
// Ports (variables d'environnement) : TEST_PORT 3100 (site), TEST_YOUTUBE_PORT 8766, TEST_METEO_PORT 8771.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'
import { startOpenMeteoMock } from '../tests/mocks/open-meteo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnv({ path: path.join(ROOT, '.env') })

const args = new Set(process.argv.slice(2))
const quick = args.has('--rapide')
const e2eOnly = args.has('--e2e')
const keep = args.has('--garder')

const PORT = Number(process.env.TEST_PORT || 3100)
const YOUTUBE_PORT = Number(process.env.TEST_YOUTUBE_PORT || 8766)
const METEO_PORT = Number(process.env.TEST_METEO_PORT || 8771)
const SITE = `http://localhost:${PORT}`
const DIST = '.next-test'

const bin = {
  tsc: 'node_modules/typescript/bin/tsc',
  eslint: 'node_modules/eslint/bin/eslint.js',
  vitest: 'node_modules/vitest/vitest.mjs',
  payload: 'node_modules/payload/bin.js',
  next: 'node_modules/next/dist/bin/next',
  playwright: 'node_modules/@playwright/test/cli.js',
}

/* ----- base de données ----- */

const workUri = process.env.DATABASE_URI || 'postgres://swatter:swatter@127.0.0.1:5432/swatter'
const withDatabase = (uri, name) => {
  const url = new URL(uri)
  url.pathname = `/${name}`
  return url.toString()
}
const workName = decodeURIComponent(new URL(workUri).pathname.slice(1))
const e2eName = process.env.TEST_E2E_DATABASE_NAME || `${workName}_e2e`
const e2eUri = withDatabase(workUri, e2eName)

async function recreateDatabase(name) {
  const client = new pg.Client({ connectionString: withDatabase(workUri, 'postgres') })
  await client.connect()
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await client.query(`CREATE DATABASE "${name}"`)
  await client.end()
}

/* ----- étapes ----- */

const results = []
const started = Date.now()
const minutes = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`)

/** Lance `node <script> <args>` (sortie affichée) ; vrai si le code de sortie est 0. */
function node(script, scriptArgs, env = {}, cwd = ROOT) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, script), ...scriptArgs], { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
    child.on('exit', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/** Étape nommée : durée et résultat retenus pour le bilan ; une étape « bloquante » qui échoue arrête la suite. */
async function step(label, fn, { blocking = false } = {}) {
  console.log(`\n\x1b[1m▶ ${label}\x1b[0m\n`)
  const t = Date.now()
  let ok = false
  try {
    ok = await fn()
  } catch (error) {
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
  }
  results.push({ label, ok, ms: Date.now() - t })
  if (!ok && blocking) throw new Error(`Étape « ${label} » en échec : arrêt.`)
  return ok
}

function summary() {
  console.log('\n\x1b[1mBilan\x1b[0m')
  for (const r of results) console.log(`  ${r.ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${r.label} (${minutes(r.ms)})`)
  const failed = results.filter((r) => !r.ok).length
  console.log(failed ? `\n\x1b[31m${failed} étape(s) en échec.\x1b[0m` : `\n\x1b[32mTout est vert\x1b[0m, en ${minutes(Date.now() - started)}.`)
  return failed
}

async function waitFor(url, timeoutMs) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.ok) return true
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

/* ----- déroulé ----- */

let server
let meteo
const stop = () => {
  server?.kill()
  meteo?.close()
}
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

try {
  // PostgreSQL disponible ?
  try {
    const client = new pg.Client({ connectionString: withDatabase(workUri, 'postgres') })
    await client.connect()
    await client.end()
  } catch (error) {
    throw new Error(`PostgreSQL injoignable (${error.message}) : lancez la base (docker start swatter-db), puis relancez.`)
  }

  if (!e2eOnly) {
    await step('TypeScript — site', () => node(bin.tsc, ['--noEmit', '-p', 'tsconfig.json']))
    await step('TypeScript — tests', () => node(bin.tsc, ['--noEmit', '-p', 'tests/tsconfig.json']))
    await step('ESLint', () => node(bin.eslint, ['.', '--quiet']))
    await step('Tests unitaires', () => node(bin.vitest, ['run', '--project', 'unitaires']))
    await step("Tests d'intégration (base de test)", () => node(bin.vitest, ['run', '--project', 'integration'], { NODE_OPTIONS: '--no-deprecation' }))
  }

  if (!quick) {
    const mediaDir = path.join(ROOT, '.tests/media-e2e')
    const env = {
      DATABASE_URI: e2eUri,
      MEDIA_DIR: mediaDir,
      NEXT_DIST_DIR: DIST,
      NEXT_PUBLIC_SITE_URL: SITE,
      OPEN_METEO_URL: `http://127.0.0.1:${METEO_PORT}/v1/forecast`,
      YOUTUBE_BASE: `http://127.0.0.1:${YOUTUBE_PORT}`,
      YOUTUBE_THUMB_BASE: `http://127.0.0.1:${YOUTUBE_PORT}/vi`,
      // tous les tests partent de la même adresse IP : limites anti-abus relâchées
      MEMBER_RATE_FACTOR: '10',
      CRON_SECRET: 'secret-cron-des-tests-e2e',
      ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || 'admin@swatter-tv.fr',
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || 'swatter-admin-2026',
      SMTP_HOST: '',
      S3_BUCKET: '',
      TRUSTED_PROXY_HOPS: '',
      NODE_ENV: 'production',
      NODE_OPTIONS: '--no-deprecation',
    }
    meteo = await startOpenMeteoMock(METEO_PORT)

    await step(
      `Base de test des tests de bout en bout (${e2eName}) : migrations, administrateur, contenus de départ`,
      async () => {
        await recreateDatabase(e2eName)
        rmSync(mediaDir, { recursive: true, force: true })
        mkdirSync(mediaDir, { recursive: true })
        return (
          (await node(bin.payload, ['migrate'], env)) &&
          (await node(bin.payload, ['run', 'src/scripts/init-db.ts'], env)) &&
          (await node(bin.payload, ['run', 'src/scripts/seed.ts'], { ...env, SEED_FORCE: '1' }))
        )
      },
      { blocking: true },
    )

    await step(
      `Construction du site de test (${DIST})`,
      async () => {
        // next-env.d.ts (généré par Next, hors Git) désignerait ensuite les types de .next-test : remis tel quel après
        const nextEnv = path.join(ROOT, 'next-env.d.ts')
        const savedNextEnv = existsSync(nextEnv) ? readFileSync(nextEnv, 'utf8') : null
        const ok = await node(bin.next, ['build'], { ...env, NODE_OPTIONS: '--no-deprecation --max-old-space-size=6000' })
        if (savedNextEnv !== null) writeFileSync(nextEnv, savedNextEnv)
        if (!ok) return false
        // fichiers statiques à côté du serveur autonome (comme en production)
        const standalone = path.join(ROOT, DIST, 'standalone')
        rmSync(path.join(standalone, DIST, 'static'), { recursive: true, force: true })
        cpSync(path.join(ROOT, DIST, 'static'), path.join(standalone, DIST, 'static'), { recursive: true })
        rmSync(path.join(standalone, 'public'), { recursive: true, force: true })
        cpSync(path.join(ROOT, 'public'), path.join(standalone, 'public'), { recursive: true })
        return true
      },
      { blocking: true },
    )

    await step(
      `Démarrage du site de test (${SITE})`,
      async () => {
        const standalone = path.join(ROOT, DIST, 'standalone')
        if (!existsSync(path.join(standalone, 'server.js'))) throw new Error('server.js introuvable : la construction a échoué.')
        server = spawn(process.execPath, ['server.js'], { cwd: standalone, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env, PORT: String(PORT), HOSTNAME: '127.0.0.1' } })
        return waitFor(`${SITE}/robots.txt`, 120_000)
      },
      { blocking: true },
    )

    await step('Tests de bout en bout (Playwright, ordinateur et mobile)', () =>
      node(bin.playwright, ['test'], { E2E_BASE_URL: SITE, E2E_YOUTUBE_MOCK_PORT: String(YOUTUBE_PORT), NODE_OPTIONS: '' }),
    )
  }
} catch (error) {
  console.error(`\n\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m`)
}

const failed = summary()
if (keep && server) {
  console.log(`\nSite de test ouvert : ${SITE} (administration : ${SITE}/admin, admin@swatter-tv.fr / swatter-admin-2026). Ctrl+C pour l'arrêter.`)
} else {
  stop()
  process.exit(failed ? 1 : 0)
}
