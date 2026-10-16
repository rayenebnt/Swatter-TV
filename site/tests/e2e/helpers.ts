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
    if (url.origin === ORIGIN && response.status() >= 400 && !url.pathname.startsWith('/__nextjs')) {
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

/** Laisse le temps aux révélations au défilement et aux images différées. */
export async function settle(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForTimeout(800)
}

type Doc = { slug?: string | null; department?: string | null }

/** Premier document publié d'une collection (via l'API REST de Payload). */
export async function firstDoc(request: APIRequestContext, collection: string, query = ''): Promise<Doc | null> {
  const response = await request.get(`/api/${collection}?limit=1&depth=0${query}`)
  if (!response.ok()) return null
  const json = (await response.json()) as { docs?: Doc[] }
  return json.docs?.[0] ?? null
}
