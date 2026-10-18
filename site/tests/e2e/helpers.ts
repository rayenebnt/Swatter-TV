import { expect, type APIRequestContext, type Page } from '@playwright/test'

const ORIGIN = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000').origin

/**
 * Surveille une page : exceptions JavaScript, erreurs de console (dont les erreurs d'hydratation)
 * et réponses HTTP ≥ 400 du site lui-même. Renvoie la liste (vide si tout va bien).
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`Exception : ${error.message}`))
  page.on('console', (message) => {
    // les ressources en échec sont signalées plus précisément par l'écouteur « response »
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(`Console : ${message.text()}`)
    }
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    // « test-import… » : fiches créées puis supprimées par le test d'import YouTube qui tourne en parallèle (admin.spec.ts) ;
    // une page déjà affichée peut encore précharger leur lien
    const transient = response.status() === 404 && url.pathname.includes('/test-import')
    if (url.origin === ORIGIN && response.status() >= 400 && !url.pathname.startsWith('/__nextjs') && !transient) {
      errors.push(`HTTP ${response.status()} : ${url.pathname}${url.search}`)
    }
  })
  return errors
}

/** Vérifie qu'aucun élément ne provoque de défilement horizontal. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const extra = document.documentElement.scrollWidth - window.innerWidth
    if (extra <= 0) return null
    // repère les éléments qui dépassent, pour un message d'erreur utile
    const culprits = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`)
    return { extra, culprits }
  })
  expect(overflow, `Débordement horizontal : ${JSON.stringify(overflow)}`).toBeNull()
}

/** Référencement de base : langue, titre, URL canonique et données structurées JSON-LD lisibles. */
export async function expectSeo(page: Page) {
  const seo = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => {
      try {
        JSON.parse(script.textContent ?? '')
        return 'ok'
      } catch {
        return (script.textContent ?? '').slice(0, 80)
      }
    }),
  }))
  expect(seo.lang, 'langue du document').toMatch(/^fr/)
  expect(seo.title, 'balise <title>').toMatch(/\S/)
  expect(seo.canonical, 'URL canonique').toMatch(/^https?:\/\//)
  expect(seo.jsonLd.filter((r) => r !== 'ok'), 'données structurées JSON-LD invalides').toEqual([])
}

/** Laisse le temps aux révélations au défilement et aux images différées. */
export async function settle(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForTimeout(800)
}

/** Liens distincts du contenu principal dont le chemin correspond au motif (ex. fiches d'articles). */
export async function linksMatching(page: Page, pattern: RegExp): Promise<string[]> {
  const hrefs = await page.locator('main a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  return [...new Set(hrefs.filter((href) => pattern.test(href)))]
}

/**
 * Vérifie la PRÉSENCE du lecteur vidéo, pas la lecture : façade « clic pour lire », lecteur natif, iframe
 * (YouTube, Bunny) ou message « Vidéo indisponible » (le Chromium de Playwright ne décode pas le H.264 des MP4
 * de démonstration).
 */
export async function expectPlayer(page: Page) {
  const player = page.getByRole('region', { name: /lecteur vidéo/i }).first()
  await expect(player).toBeVisible()
  const content = player
    .locator('video, iframe')
    .or(player.getByRole('button', { name: /lire/i }))
    .or(player.getByText(/vidéo indisponible/i))
  await expect(content.first()).toBeVisible()
}

type Doc = { slug?: string | null; department?: string | null; name?: string | null; title?: string | null }

/** Premier document publié d'une collection (via l'API REST de Payload). */
export async function firstDoc(request: APIRequestContext, collection: string, query = ''): Promise<Doc | null> {
  const response = await request.get(`/api/${collection}?limit=1&depth=0${query}`)
  if (!response.ok()) return null
  const json = (await response.json()) as { docs?: Doc[] }
  return json.docs?.[0] ?? null
}
