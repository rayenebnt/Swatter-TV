import { expect, test } from '@playwright/test'
import { atParisTime, expectNoHorizontalOverflow, expectPlayer, firstDoc, linksMatching, settle, watchErrors } from './helpers'

// Un test par rubrique : le contenu attendu est bien là (jeu de démonstration : npm run seed).

test('accueil : toutes les rubriques sont présentes', async ({ page, request }) => {
  const errors = watchErrors(page)
  // sans vidéo (chaîne YouTube pas encore importée), le Top 10, « Vidéos du jour » et « Le Replay » sont masqués
  const { totalDocs: videos } = (await (await request.get('/api/videos?limit=1&depth=0')).json()) as { totalDocs: number }
  const { totalDocs: replays } = (await (await request.get('/api/replays?limit=1&depth=0')).json()) as { totalDocs: number }
  await page.goto('/')
  await settle(page)
  await expect(page.locator('h1')).toHaveCount(1)
  const main = page.locator('main')
  for (const name of [/à la une/i, ...(videos ? [/top 10/i, /vidéos du jour/i] : []), /info/i, /météo/i, /programme tv/i, /agenda/i, /webcams/i, ...(replays ? [/replay/i] : [])]) {
    await expect(main.getByRole('heading', { level: 2, name }).first(), `section ${name}`).toBeAttached()
  }
  if (!videos) await expect(main.getByRole('heading', { level: 2, name: /top 10/i })).toHaveCount(0)
  for (const path of ['/direct', '/info', '/meteo', '/programme-tv', '/agenda', '/webcams', '/replay', '/videos']) {
    await expect(page.locator(`a[href="${path}"]`).first(), `lien vers ${path}`).toBeAttached()
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('info : toute la région, pages par département et article', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/info')
  const articles = await linksMatching(page, /^\/info\/[a-z-]+\/[a-z0-9-]+$/)
  expect(articles.length, 'articles listés sur /info').toBeGreaterThanOrEqual(3)
  // articles de plusieurs départements (contenus de départ : Haute-Savoie, Rhône, Isère)
  expect(new Set(articles.map((a) => a.split('/')[2])).size, 'départements représentés').toBeGreaterThanOrEqual(2)
  expect((await linksMatching(page, /^\/info\/[a-z-]+$/)).length, 'liens vers les départements').toBeGreaterThanOrEqual(2)
  const dept = articles[0].split('/')[2]
  await page.goto(`/info/${dept}`)
  expect((await linksMatching(page, new RegExp(`^/info/${dept}/[a-z0-9-]+$`))).length, `articles du département ${dept}`).toBeGreaterThanOrEqual(1)
  expect((await page.request.get('/info/paris')).status(), 'département hors région').toBe(404)
  const response = await page.goto(articles[0])
  expect(response?.status()).toBe(200)
  await settle(page)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('main time').first()).toBeAttached()
  expect(errors, errors.join('\n')).toEqual([])
})

test('info : catégorie « Autres régions » (Suisse, Vallée d’Aoste), dernier onglet de /info, avec sa page', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/info')
  const tabs = page.getByRole('navigation', { name: 'L’info par département' }).getByRole('link')
  // toujours proposée, après les départements
  await expect(tabs.last()).toHaveText('Autres régions')
  await expect(tabs.last()).toHaveAttribute('href', '/info/autres-regions')
  await tabs.last().click()
  await expect(page).toHaveURL(/\/info\/autres-regions$/)
  await settle(page)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText('Autres régions')
  await expect(page.locator('main')).toContainText('Suisse, Vallée d’Aoste et au-delà')
  await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' }).first()).toContainText('Autres régions')
  await expect(tabs.last()).toHaveAttribute('aria-current', 'page')
  await expectNoHorizontalOverflow(page)
  // ses articles y sont rangés, et seulement eux
  for (const href of await linksMatching(page, /^\/info\/[a-z-]+\/[a-z0-9-]+$/)) expect(href, 'article de la page').toMatch(/^\/info\/autres-regions\//)
  expect(errors, errors.join('\n')).toEqual([])
})

test('météo : prévisions d’Auvergne-Rhône-Alpes, une ville par département', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/meteo')
  await settle(page)
  const main = page.locator('main')
  await expect(main.getByRole('heading', { name: /prévisions/i }).first()).toBeVisible()
  await expect(main).toContainText(/-?\d+\s?°/)
  await expect(main.getByRole('heading', { name: 'Dans la région' })).toBeVisible()
  const cities = main.locator('.city-card__txt b')
  await expect(cities).toHaveText(['Annecy', 'Lyon', 'Grenoble', 'Clermont-Ferrand', 'Saint-Étienne', 'Chambéry', 'Valence', 'Bourg-en-Bresse', 'Le Puy-en-Velay', 'Aurillac', 'Moulins', 'Privas'])
  await expect(main.locator('.now__city').first()).toHaveText('Annecy')
  // filtre par département (les 12) puis carte d'une ville : prévisions détaillées de son département
  await expect(page.getByRole('navigation', { name: 'La météo par département' }).getByRole('link')).toHaveCount(13)
  await main.locator('.city-card', { hasText: 'Grenoble' }).click()
  await page.waitForURL(/\/meteo\/isere$/)
  await expect(page.locator('h1')).toContainText('en Isère')
  await expect(page.locator('main .now__city').first()).toHaveText('Grenoble')
  await expect(page.locator('main .chart').first()).toBeAttached()
  expect((await page.request.get('/meteo/paris')).status(), 'département hors région').toBe(404)
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

test('agenda : filtre par département', async ({ page, request }) => {
  const { docs } = (await (await request.get('/api/events?limit=50&depth=0&where[endDate][greater_than_equal]=' + new Date().toISOString())).json()) as { docs: { title: string; department: string }[] }
  test.skip(!docs.length, 'aucun événement à venir (lancez npm run seed)')
  const errors = watchErrors(page)
  const dept = docs[0].department
  await page.goto('/agenda')
  const filter = page.getByRole('navigation', { name: 'L’agenda par département' })
  await expect(filter.getByRole('link', { name: 'Toute la région' })).toHaveAttribute('aria-current', 'page')
  await page.goto(`/agenda?departement=${dept}`)
  await settle(page)
  await expect(filter.locator('[aria-current="page"]')).not.toHaveText('Toute la région')
  for (const e of docs) {
    const card = page.locator('main').getByText(e.title, { exact: true })
    if (e.department === dept) await expect(card.first(), e.title).toBeAttached()
    else await expect(card, e.title).toHaveCount(0)
  }
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

test('webcams : une page par département, et « Web Cams + » pour les vues hors région', async ({ page, request }) => {
  const { docs } = (await (await request.get('/api/webcams?where[active][equals]=true&limit=50&depth=0')).json()) as { docs: { name: string; department: string }[] }
  test.skip(new Set(docs.map((d) => d.department)).size < 2, 'webcams de moins de deux départements (lancez npm run seed)')
  const errors = watchErrors(page)
  // noms des webcams affichées (les noms de départements figurent aussi dans le filtre : on lit les cartes seulement)
  const shown = async () => (await page.locator('.camp__name').allTextContents()).map((t) => t.trim()).sort()
  const namesOf = (zone: string) => docs.filter((d) => d.department === zone).map((d) => d.name).sort()
  const dept = docs.find((d) => d.department !== 'plus')!.department
  await page.goto('/webcams')
  await page.getByRole('navigation', { name: 'Les webcams par département' }).locator(`a[href="/webcams/${dept}"]`).click()
  await page.waitForURL(new RegExp(`/webcams/${dept}$`))
  await settle(page)
  expect(await shown()).toEqual(namesOf(dept))
  // webcams hors région : leur page, et leur section sous celles de la région
  if (namesOf('plus').length) {
    await page.goto('/webcams/plus')
    await settle(page)
    await expect(page.locator('h1')).toHaveText('Web Cams +')
    expect(await shown()).toEqual(namesOf('plus'))
    await page.goto('/webcams')
    await expect(page.getByRole('heading', { name: 'Web Cams +' })).toBeVisible()
  }
  expect((await page.request.get('/webcams/paris')).status(), 'département hors région').toBe(404)
  expect(errors, errors.join('\n')).toEqual([])
})

test('webcams : les webcams actives sont présentées, « Bientôt en direct » sans lien de flux', async ({ page, request }) => {
  const api = await request.get('/api/webcams?where[active][equals]=true&limit=50&depth=0&sort=order')
  const { docs } = (await api.json()) as { docs: { name: string; embedUrl?: string | null }[] }
  test.skip(!docs.length, 'aucune webcam active (lancez npm run seed)')
  const errors = watchErrors(page)
  await page.goto('/webcams')
  await settle(page)
  for (const { name } of docs) await expect(page.locator('main'), `webcam « ${name} »`).toContainText(name)
  const soon = docs.filter((d) => !d.embedUrl?.trim())
  if (soon.length) {
    const card = page.locator('article.camp').filter({ has: page.locator('.camp__name', { hasText: new RegExp(`^${soon[0].name}$`) }) })
    await expect(card.getByText('Bientôt en direct')).toBeVisible()
    // ni direct ni plein écran tant que le lien n'est pas renseigné
    await expect(card.getByRole('button', { name: /plein écran/ })).toHaveCount(0)
  }
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
  // pas de replay de démonstration : la rubrique attend les vidéos de la chaîne YouTube (import automatique)
  if (!replays.length) {
    expect(errors, errors.join('\n')).toEqual([])
    return
  }
  await page.goto(replays[0])
  await settle(page)
  await expectPlayer(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('direct : le lecteur du direct est présent pendant l’antenne', async ({ page, request }) => {
  const settings = (await (await request.get('/api/globals/settings?depth=0')).json()) as { liveEnabled?: boolean }
  test.skip(settings.liveEnabled === false, 'direct désactivé dans les réglages')
  const errors = watchErrors(page)
  // le lecteur n'est affiché que de 18 h à 0 h 30 (décidé aussi dans le navigateur) : horloge du navigateur à 21 h
  // (hors antenne : voir antenne.spec.ts)
  await atParisTime(page, '21:00')
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

test('recherche : « webcam » trouve les webcams, « webcam chamonix » celle de Chamonix', async ({ request }) => {
  type Hit = { type: string; title: string; href: string }
  const hits = async (q: string) => ((await (await request.get(`/api/search?q=${encodeURIComponent(q)}`)).json()) as { hits: Hit[] }).hits
  const { totalDocs } = (await (await request.get('/api/webcams?limit=1&depth=0')).json()) as { totalDocs: number }
  test.skip(!totalDocs, 'aucune webcam (lancez npm run seed)')
  const all = await hits('webcams')
  expect(all.length).toBeGreaterThan(0)
  expect(all.every((h) => h.type === 'webcam' && h.href.startsWith('/webcams'))).toBe(true)
  expect((await hits('les webcams')).length).toBe(all.length)
  const named = await hits(`webcam ${all[0].title}`)
  expect(named[0]?.title).toBe(all[0].title)
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
  // plan de l'ancien site (SiteW) : info d'un département, de Genève ou d'Aoste (« Autres régions »), destination avec paramètre
  for (const [old, target] of [
    ['/L-info-Haute-Savoie', /\/info\/haute-savoie$/],
    ['/L-info-Aoste', /\/info\/autres-regions$/],
    ['/Deposer-une-publicite', /\/contact\?sujet=publicite$/],
  ] as const) {
    const res = await request.get(old, { maxRedirects: 0 })
    expect(res.status(), old).toBe(308)
    expect(res.headers().location, old).toMatch(target)
  }
})
