import { expect, test } from '@playwright/test'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { expectPlayer, firstDoc, linksMatching, settle, watchErrors } from './helpers'

// Un test par rubrique : le contenu attendu est bien là (jeu de démonstration : npm run seed).

test('accueil : toutes les rubriques sont présentes', async ({ page, request }) => {
  const errors = watchErrors(page)
  // sans vidéo (chaîne YouTube pas encore importée), le Top 10 et « Vidéos du jour » sont masqués
  const { totalDocs: videos } = (await (await request.get('/api/videos?limit=1&depth=0')).json()) as { totalDocs: number }
  await page.goto('/')
  await settle(page)
  await expect(page.locator('h1')).toHaveCount(1)
  const main = page.locator('main')
  for (const name of [/à la une/i, ...(videos ? [/top 10/i, /vidéos du jour/i] : []), /info/i, /météo/i, /programme tv/i, /agenda/i, /webcams/i, /replay/i]) {
    await expect(main.getByRole('heading', { level: 2, name }).first(), `section ${name}`).toBeAttached()
  }
  if (!videos) await expect(main.getByRole('heading', { level: 2, name: /top 10/i })).toHaveCount(0)
  for (const path of ['/direct', '/info', '/meteo', '/programme-tv', '/agenda', '/webcams', '/replay', '/videos']) {
    await expect(page.locator(`a[href="${path}"]`).first(), `lien vers ${path}`).toBeAttached()
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('info : liste, département et article', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/info')
  const articles = await linksMatching(page, /^\/info\/[a-z-]+\/[a-z0-9-]+$/)
  expect(articles.length, 'articles listés sur /info').toBeGreaterThanOrEqual(3)
  await page.goto('/info/haute-savoie')
  expect((await linksMatching(page, /^\/info\/haute-savoie\/[a-z0-9-]+$/)).length, 'articles de Haute-Savoie').toBeGreaterThanOrEqual(1)
  const response = await page.goto(articles[0])
  expect(response?.status()).toBe(200)
  await settle(page)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('main time').first()).toBeAttached()
  expect(errors, errors.join('\n')).toEqual([])
})

test('info : le flux RSS est un XML valide', async ({ request }) => {
  const response = await request.get('/info/rss.xml')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/xml/)
  const xml = await response.text()
  expect(XMLValidator.validate(xml)).toBe(true)
  type Item = { title?: string; link?: string; guid?: unknown; pubDate?: string }
  const feed = new XMLParser().parse(xml) as { rss?: { channel?: { title?: string; item?: Item | Item[] } } }
  expect(feed.rss?.channel?.title).toBeTruthy()
  const items = [feed.rss?.channel?.item ?? []].flat()
  expect(items.length, 'articles dans le flux').toBeGreaterThan(0)
  for (const item of items) {
    expect(item.title).toBeTruthy()
    expect(item.link).toMatch(/^https?:\/\/[^/]+\/info\/[a-z-]+\/[a-z0-9-]+$/)
    expect(new Date(item.pubDate ?? '').getTime(), `date de « ${item.title} »`).not.toBeNaN()
  }
})

test('météo : prévisions de la Haute-Savoie seulement', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/meteo')
  await settle(page)
  const main = page.locator('main')
  await expect(main.getByRole('heading', { name: /prévisions/i }).first()).toBeVisible()
  await expect(main).toContainText(/-?\d+\s?°/)
  await expect(main.getByRole('heading', { name: 'En Haute-Savoie' })).toBeVisible()
  const cities = main.locator('.city-card__txt b')
  await expect(cities).toHaveText(['Annecy', 'Annemasse', 'Thonon-les-Bains', 'Cluses', 'Chamonix', 'La Clusaz'])
  for (const elsewhere of ['Lyon', 'Grenoble', 'Chambéry']) await expect(main).not.toContainText(elsewhere)
  expect(errors, errors.join('\n')).toEqual([])
})

test('programme TV : grille du jour et autre jour', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/programme-tv')
  await settle(page)
  await expect(page.locator('main')).toContainText(/\d{2}:\d{2}/)
  // jours suivants : liens ?jour=AAAA-MM-JJ (le lendemain, couvert par la grille de démonstration)
  const days = await linksMatching(page, /[?&]jour=\d{4}-\d{2}-\d{2}/)
  expect(days.length, 'sélecteur de jours').toBeGreaterThanOrEqual(1)
  const response = await page.goto(days[0])
  expect(response?.status()).toBe(200)
  await expect(page.locator('main')).toContainText(/\d{2}:\d{2}/)
  expect(errors, errors.join('\n')).toEqual([])
})

test('agenda : événements et fiche', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/agenda')
  const events = await linksMatching(page, /^\/agenda\/[a-z0-9-]+$/)
  expect(events.length, 'événements listés').toBeGreaterThanOrEqual(3)
  const response = await page.goto(events[0])
  expect(response?.status()).toBe(200)
  await settle(page)
  await expect(page.locator('h1')).toHaveCount(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('webcams : les webcams actives sont présentées', async ({ page, request }) => {
  const api = await request.get('/api/webcams?where[active][equals]=true&limit=50&depth=0&sort=order')
  const { docs } = (await api.json()) as { docs: { name: string }[] }
  test.skip(!docs.length, 'aucune webcam active (lancez npm run seed)')
  const errors = watchErrors(page)
  await page.goto('/webcams')
  await settle(page)
  for (const { name } of docs) await expect(page.locator('main'), `webcam « ${name} »`).toContainText(name)
  expect(errors, errors.join('\n')).toEqual([])
})

test('vidéos : liste et page vidéo avec son lecteur', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/videos')
  const videos = await linksMatching(page, /^\/videos\/[a-z0-9-]+$/)
  // pas de vidéo de démonstration : la rubrique attend celles de la chaîne YouTube (import automatique)
  if (!videos.length) {
    await expect(page.locator('main')).toContainText('Aucune vidéo pour le moment')
    expect(errors, errors.join('\n')).toEqual([])
    return
  }
  await page.goto(videos[0])
  await settle(page)
  await expectPlayer(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('replay : liste et page replay avec son lecteur', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/replay')
  const replays = await linksMatching(page, /^\/replay\/[a-z0-9-]+$/)
  expect(replays.length, 'replays listés').toBeGreaterThanOrEqual(1)
  await page.goto(replays[0])
  await settle(page)
  await expectPlayer(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('direct : le lecteur du direct est présent', async ({ page, request }) => {
  const settings = (await (await request.get('/api/globals/settings?depth=0')).json()) as { liveEnabled?: boolean }
  test.skip(settings.liveEnabled === false, 'direct désactivé dans les réglages')
  const errors = watchErrors(page)
  await page.goto('/direct')
  await settle(page)
  await expectPlayer(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('recherche : résultats, absence de résultat et API', async ({ page, request }) => {
  await page.goto('/recherche?q=annecy')
  await expect(page.locator('h1')).toContainText(/annecy/i)
  expect((await linksMatching(page, /^\/(info\/[a-z-]+|videos|replay|agenda)\/[a-z0-9-]+$/)).length, 'résultats').toBeGreaterThan(0)
  await page.goto('/recherche?q=zzqxwv')
  await expect(page.locator('main')).toContainText(/aucun résultat/i)
  const api = await request.get('/api/search?q=annecy')
  expect(api.ok()).toBe(true)
  expect(((await api.json()) as { hits: unknown[] }).hits.length).toBeGreaterThan(0)
})

test('page éditoriale et redirections', async ({ page, request }) => {
  const doc = await firstDoc(request, 'pages', '&where[slug][equals]=mentions-legales')
  test.skip(!doc?.slug, 'page « mentions-legales » absente (lancez npm run seed)')
  const errors = watchErrors(page)
  await page.goto('/mentions-legales')
  await settle(page)
  await expect(page.locator('h1')).toContainText(/mentions légales/i)
  await expect(page.locator('main h2').first()).toBeVisible()
  await expect(page.locator('footer a[href="/mentions-legales"]').first()).toBeAttached()
  expect(errors, errors.join('\n')).toEqual([])
  // redirection saisie dans l'administration (jeu de démonstration : /programme → /programme-tv)
  const custom = await request.get('/programme', { maxRedirects: 0 })
  expect([301, 307, 308], 'redirection /programme').toContain(custom.status())
  expect(custom.headers().location).toMatch(/\/programme-tv$/)
  // ancienne adresse du site actuel (next.config.ts)
  const legacy = await request.get('/Le-Direct', { maxRedirects: 0 })
  expect(legacy.status()).toBe(308)
  expect(legacy.headers().location).toMatch(/\/direct$/)
})
