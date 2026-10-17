import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, expectSeo, firstDoc, settle, watchErrors } from './helpers'

// Adresses principales du site (voir DEV_NOTES.md).
const ROUTES = [
  '/',
  '/direct',
  '/info',
  '/info/haute-savoie',
  '/meteo',
  '/agenda',
  '/programme-tv',
  '/replay',
  '/videos',
  '/webcams',
  '/recherche?q=annecy',
  '/canaux-de-reception',
  '/mentions-legales',
]

for (const route of ROUTES) {
  test(`${route} répond 200, sans erreur ni débordement`, async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto(route)
    expect(response?.status(), `statut de ${route}`).toBe(200)
    await settle(page)
    await expect(page.locator('h1')).toHaveCount(1)
    await expectNoHorizontalOverflow(page)
    await expectSeo(page)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

// Pages de détail : la première fiche de chaque collection du jeu de démonstration.
const DETAILS = [
  { label: 'article', collection: 'articles', path: (d: { slug?: string | null; department?: string | null }) => `/info/${d.department}/${d.slug}` },
  { label: 'vidéo', collection: 'videos', path: (d: { slug?: string | null }) => `/videos/${d.slug}` },
  { label: 'replay', collection: 'replays', path: (d: { slug?: string | null }) => `/replay/${d.slug}` },
  { label: 'événement', collection: 'events', path: (d: { slug?: string | null }) => `/agenda/${d.slug}` },
]

for (const { label, collection, path } of DETAILS) {
  test(`page ${label} : 200, sans erreur ni débordement`, async ({ page, request }) => {
    const doc = await firstDoc(request, collection)
    test.skip(!doc?.slug, `aucun document dans « ${collection} » (lancez npm run seed)`)
    const errors = watchErrors(page)
    const response = await page.goto(path(doc!))
    expect(response?.status()).toBe(200)
    await settle(page)
    await expect(page.locator('h1')).toHaveCount(1)
    await expectNoHorizontalOverflow(page)
    await expectSeo(page)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('une adresse inconnue renvoie 404 avec des liens utiles', async ({ page }) => {
  const response = await page.goto('/cette-page-n-existe-pas-42')
  expect(response?.status()).toBe(404)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toContainText(/introuvable/i)
  await expect(page.locator('main a[href="/"]').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('un article inconnu renvoie 404', async ({ page }) => {
  const response = await page.goto('/info/haute-savoie/article-inexistant-42')
  expect(response?.status()).toBe(404)
})

test('l’administration et l’API répondent', async ({ request }) => {
  expect((await request.get('/admin')).status()).toBe(200)
  expect((await request.get('/admin/login')).status()).toBe(200)
  // tâche planifiée : refusée sans le secret CRON_SECRET
  expect((await request.get('/api/cron/import')).status()).toBe(401)
  const videos = await request.get('/api/videos?limit=1&depth=0')
  expect(videos.status()).toBe(200)
  const settings = await request.get('/api/globals/settings?depth=0')
  expect(settings.status()).toBe(200)
})
