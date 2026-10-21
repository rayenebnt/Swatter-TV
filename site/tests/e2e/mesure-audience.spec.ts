import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { AdminApi, SITE } from './outils-contenus'

/**
 * Mesure d'audience (Google Analytics) : avec un ID de mesure saisi dans les réglages, gtag.js n'est chargé qu'après
 * l'accord « Mesure d'audience » du bandeau cookies ; refus, retrait ou choix expiré : rien n'est chargé ni envoyé, et les
 * cookies de Google Analytics sont effacés. Google est simulé (aucun accès à Internet). Projet « mesure-audience » lancé
 * après tous les autres (l'ID est actif sur tout le site pendant ces tests) ; connexion administrateur par l'API.
 */

const ID = 'G-TESTE2E123'
const consentOf = (audience: boolean, date = new Date()) => JSON.stringify({ v: 1, audience, externes: false, date: date.toISOString() })
const banner = (page: Page) => page.getByRole('dialog', { name: 'Vos choix cookies' })

/** Faux Google : script gtag.js minimal, envois de mesures acceptés ; renvoie les adresses de gtag.js demandées. */
async function fakeGoogle(context: BrowserContext): Promise<string[]> {
  const scripts: string[] = []
  await context.route(/^https:\/\/www\.googletagmanager\.com\//, (route) => {
    scripts.push(route.request().url())
    return route.fulfill({ contentType: 'text/javascript', body: 'window.__gtagCharge = true' })
  })
  await context.route(/^https:\/\/([\w-]+\.)*google-analytics\.com\//, (route) => route.fulfill({ status: 204 }))
  return scripts
}

/** Commandes reçues par la file de gtag (`arguments` convertis en tableaux). */
const gtagCommands = (page: Page) =>
  page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => JSON.parse(JSON.stringify(Array.from(entry)))))
const disabled = (page: Page) => page.evaluate((id) => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`], ID)

test.describe.configure({ mode: 'serial' })

let admin: AdminApi | null = null
let before: string | null = null

test.beforeAll(async () => {
  admin = await AdminApi.open()
  test.skip(!admin, 'identifiants administrateur indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
  const settings = (await (await admin!.send('GET', '/api/globals/settings?depth=0')).json()) as { analytics?: { measurementId?: string | null } }
  before = settings.analytics?.measurementId ?? null
  const res = await admin!.send('POST', '/api/globals/settings', { analytics: { measurementId: ID }, _status: 'published' })
  expect(res.ok(), `ID de mesure enregistré : ${res.status()} ${await res.text()}`).toBe(true)
})

test.afterAll(async () => {
  if (!admin) return
  await admin.send('POST', '/api/globals/settings', { analytics: { measurementId: before ?? '' }, _status: 'published' })
  await admin.dispose()
})

test('sans choix, puis refus : Google Analytics n’est jamais chargé ; le bandeau le nomme', async ({ page, context }) => {
  const scripts = await fakeGoogle(context)
  await page.goto('/')
  await expect(banner(page)).toBeVisible({ timeout: 10_000 })
  await banner(page).getByRole('button', { name: 'Personnaliser' }).click()
  await expect(banner(page).getByText(/Statistiques de fréquentation avec Google Analytics/)).toBeVisible()
  await banner(page).getByRole('button', { name: 'Tout refuser' }).click()
  await page.goto('/agenda')
  await page.waitForTimeout(1_000)
  expect(scripts, 'gtag.js demandé sans accord').toEqual([])
  expect(await gtagCommands(page)).toEqual([])
  expect(await disabled(page)).toBe(true)
})

test('accord donné : gtag.js chargé une fois avec l’ID, configuration sans signaux Google ni publicité', async ({ page, context }) => {
  const scripts = await fakeGoogle(context)
  await page.goto('/')
  await banner(page).getByRole('button', { name: 'Accepter' }).click()
  await expect.poll(() => scripts.length, { message: 'gtag.js demandé après l’accord' }).toBe(1)
  expect(new URL(scripts[0]).searchParams.get('id')).toBe(ID)
  const commands = await gtagCommands(page)
  expect(commands).toContainEqual(['consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }])
  expect(commands).toContainEqual(['config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false }])
  expect(await disabled(page)).toBe(false)
  // navigation dans le site : ni second script, ni seconde configuration (les pages suivantes : mesure améliorée de GA4)
  await page.locator('header').getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.waitForURL(/\/agenda$/)
  await page.waitForTimeout(800)
  expect(scripts).toHaveLength(1)
  expect((await gtagCommands(page)).filter((c) => c[0] === 'config')).toHaveLength(1)
})

test('accord retiré depuis « Gestion des cookies » : envoi coupé et cookies de Google Analytics effacés', async ({ page, context }) => {
  await fakeGoogle(context)
  await page.goto('/')
  await page.evaluate((value) => window.localStorage.setItem('swatter-consent', value), consentOf(true))
  const host = new URL(SITE).hostname
  await context.addCookies([
    { name: '_ga', value: 'GA1.1.123.456', domain: host, path: '/' },
    { name: '_ga_TESTE2E123', value: 'GS1.1.789', domain: host, path: '/' },
  ])
  await page.reload()
  await expect.poll(() => disabled(page), { message: 'mesure active avec l’accord' }).toBe(false)
  await page.locator('footer').getByRole('button', { name: 'Gestion des cookies' }).click()
  const audience = banner(page).getByRole('switch', { name: 'Mesure d’audience' })
  await expect(audience).toBeChecked()
  await audience.uncheck()
  await banner(page).getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(() => disabled(page), { message: 'envoi coupé après le retrait' }).toBe(true)
  await expect.poll(async () => (await context.cookies()).map((c) => c.name).filter((n) => n.startsWith('_ga')), { message: 'cookies _ga effacés' }).toEqual([])
  expect((await gtagCommands(page)).at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }])
})

test('tableau de bord : Google Analytics actif, lien « Voir les statistiques » vers Google Analytics', async () => {
  const res = await admin!.send('GET', '/admin')
  expect(res.ok()).toBe(true)
  const html = await res.text()
  expect(html).toContain(`Google Analytics actif (${ID})`)
  expect(html).toMatch(/href="https:\/\/analytics\.google\.com\/analytics\/web\/"[^>]*target="_blank"/)
})

test('choix de plus de 6 mois : expiré, le bandeau revient et Google Analytics n’est pas chargé', async ({ page, context }) => {
  const scripts = await fakeGoogle(context)
  await page.goto('/')
  await page.evaluate((value) => window.localStorage.setItem('swatter-consent', value), consentOf(true, new Date(Date.now() - 200 * 24 * 3600_000)))
  await page.reload()
  await expect(banner(page)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(500)
  expect(scripts).toEqual([])
})
