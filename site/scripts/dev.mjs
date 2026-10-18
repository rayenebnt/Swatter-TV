// « npm run dev » : lance le serveur de développement de Next, puis ouvre une fois chaque rubrique du site et
// l'administration en arrière-plan. En développement, chaque page est compilée à sa première visite (plusieurs
// secondes) : ce préchauffage évite que ce délai tombe sur les premiers clics. « npm run dev:brut » s'en passe.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const flag = args.findIndex((a) => a === '-p' || a === '--port')
const port = (flag >= 0 && args[flag + 1]) || process.env.PORT || '3000'
const base = `http://localhost:${port}`
const PAGES = ['/', '/direct', '/videos', '/info', '/meteo', '/programme-tv', '/agenda', '/webcams', '/replay', '/recherche?q=annecy', '/admin/login', '/admin']

const next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...args], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' ') },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => next.kill(signal))
next.on('exit', (code) => process.exit(code ?? 0))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function warmUp() {
  // serveur prêt ?
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(2000) })
      break
    } catch {
      await wait(1000)
    }
  }
  const started = Date.now()
  for (const page of PAGES) {
    try {
      await fetch(`${base}${page}`, { redirect: 'manual', signal: AbortSignal.timeout(180_000) })
    } catch {
      // page en erreur ou serveur arrêté : on passe à la suivante
    }
  }
  console.log(`\n ✓ Site et administration préchauffés en ${Math.round((Date.now() - started) / 1000)} s : les premiers clics seront rapides.\n`)
}
void warmUp()
