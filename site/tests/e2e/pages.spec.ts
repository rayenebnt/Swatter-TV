import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, expectSeo, firstDoc, settle, watchErrors } from './helpers'
import { AdminApi, unique } from './outils-contenus'

// Adresses principales du site (voir DEV_NOTES.md).
const ROUTES = [
  '/',
  '/direct',
  '/info',
  '/info/haute-savoie',
  '/info/autres-regions',
  '/contact',
  '/meteo',
  '/meteo/isere',
  '/agenda',
  '/programme-tv',
  '/replay',
  '/videos',
  '/webcams',
  '/webcams/savoie',
  '/webcams/plus',
  '/recherche?q=annecy',
  '/canaux-de-reception',
  '/mentions-legales',
  '/le-groupe',
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

test('« Le groupe » : frise des logos, du plus ancien au plus récent (sur une ligne, en colonne sur téléphone)', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  await page.goto('/le-groupe')
  const frise = page.getByRole('region', { name: 'Notre logo au fil du temps' })
  await expect(frise).toBeVisible()
  const steps = frise.getByRole('listitem')
  await expect(steps.getByRole('heading', { level: 3 })).toHaveText(['Swatter TV HD', 'Le triangle jaune', 'Swatter TV Info', 'Le triangle doré', 'Le logo d’aujourd’hui'])
  // logos chargés, décrits pour les lecteurs d'écran
  const images = frise.getByRole('img')
  await expect(images).toHaveCount(5)
  await images.last().scrollIntoViewIfNeeded()
  for (const img of await images.all()) {
    await expect(img).toHaveAttribute('alt', /logo/i)
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: 'logo chargé' }).toBe(true)
  }
  // ordre de lecture : de gauche à droite sur ordinateur, de haut en bas sur téléphone
  const boxes = await steps.evaluateAll((items) => items.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })))
  for (let i = 1; i < boxes.length; i++) {
    if (isMobile) expect(boxes[i].y, `étape ${i + 1} sous la précédente`).toBeGreaterThan(boxes[i - 1].y)
    else {
      expect(boxes[i].x, `étape ${i + 1} à droite de la précédente`).toBeGreaterThan(boxes[i - 1].x)
      expect(boxes[i].y, `étape ${i + 1} sur la même ligne`).toBe(boxes[0].y)
    }
  }
  await expectNoHorizontalOverflow(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test.describe('page à plusieurs frises (page créée pour le test)', () => {
  let admin: AdminApi | null = null
  test.beforeAll(async () => {
    admin = await AdminApi.open()
    test.skip(!admin, 'identifiants administrateur indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
  })
  test.afterAll(async () => {
    await admin?.dispose()
  })

  test('deux frises l’une sous l’autre, dans l’ordre, chacune avec son titre ; une frise vide n’est pas affichée', async ({ page }) => {
    const errors = watchErrors(page)
    const image = await admin!.imageId()
    const slug = unique('frises')
    const step = (date: string, title: string) => ({ date, title, image })
    await admin!.create('pages', {
      title: 'Frises (test)',
      slug,
      timelines: [
        { title: 'Notre logo au fil du temps (test)', intro: 'Les logos.', steps: [step('Novembre', '2025'), step('Avril', '2026')] },
        { title: 'Frise vide (test)', steps: [] },
        { title: 'Notre matériel au fil du temps (test)', intro: 'En un an, Swatter TV Info a connu une évolution de son matériel.', steps: [step('La caméra reportage', '2026'), step('La caméra spectacle', '2026')] },
      ],
    })
    await page.goto(`/${slug}`)
    const regions = page.locator('section.frise')
    await expect(regions).toHaveCount(2)
    await expect(regions.getByRole('heading', { level: 2 })).toHaveText(['Notre logo au fil du temps (test)', 'Notre matériel au fil du temps (test)'])
    // titres aux identifiants uniques : chaque frise est une région nommée par le sien
    const equipment = page.getByRole('region', { name: 'Notre matériel au fil du temps (test)' })
    await expect(equipment).toContainText('En un an, Swatter TV Info a connu une évolution de son matériel.')
    await expect(equipment.locator('.frise__date')).toHaveText(['La caméra reportage', 'La caméra spectacle'])
    await expect(page.getByRole('region', { name: 'Notre logo au fil du temps (test)' }).getByRole('listitem')).toHaveCount(2)
    const [first, second] = await regions.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top))
    expect(second, 'frise du matériel sous celle des logos').toBeGreaterThan(first)
    await expectNoHorizontalOverflow(page)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

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
