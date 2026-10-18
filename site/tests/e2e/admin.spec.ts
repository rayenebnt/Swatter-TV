import { expect, request as apiRequest, test, type APIRequestContext, type Page } from '@playwright/test'
import { watchErrors } from './helpers'
import { MOCK_VIDEOS, startYoutubeMock } from './youtube-mock'

/**
 * Administration pensée pour une équipe non technique : tableau de bord, aide intégrée, outil de la grille,
 * brouillons avec aperçu avant publication et rubriques techniques masquées aux éditeurs. Identifiants : E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * (par défaut ceux du poste de développement, voir README) ; sans compte valide, ces tests sont ignorés.
 */
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin@swatter-tv.fr',
  password: process.env.E2E_ADMIN_PASSWORD || 'swatter-admin-2026',
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/admin/login')
  await page.fill('input[name="email"]', account.email)
  await page.fill('input[name="password"]', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

/** Requêtes d'un visiteur anonyme (sans les cookies de connexion des autres requêtes du test). */
const visitor = () => apiRequest.newContext({ baseURL: test.info().project.use.baseURL })

async function adminHeaders(request: APIRequestContext) {
  const res = await request.post('/api/users/login', { data: ADMIN })
  const { token } = (await res.json()) as { token: string }
  return { Authorization: `JWT ${token}` }
}

test.describe('administration', () => {
  test.skip(({ isMobile }) => isMobile, 'parcours de l’administration : sur ordinateur')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/users/login', { data: ADMIN })
    test.skip(!res.ok(), 'identifiants administrateur de test indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
  })

  test('tableau de bord : actions courantes et état du site', async ({ page, request }) => {
    const errors = watchErrors(page)
    await login(page, ADMIN)
    await expect(page.getByRole('heading', { level: 1, name: /^Bon(jour|soir)/ })).toBeVisible()
    for (const action of ['Publier une vidéo', 'Écrire une info', 'Ajouter une sortie', 'Mettre un replay en ligne']) {
      await expect(page.getByRole('link', { name: new RegExp(action) })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Sur le site en ce moment' })).toBeVisible()
    expect(await page.locator('.sw-status__row').count()).toBeGreaterThanOrEqual(8)
    await expect(page.getByRole('heading', { name: 'Derniers contenus modifiés' })).toBeVisible()

    await page.getByRole('link', { name: /Publier une vidéo/ }).click()
    // la fiche est créée aussitôt en brouillon (enregistrement automatique), intitulée « Nouvelle fiche » sans titre
    await expect(page).toHaveURL(/\/admin\/collections\/videos\/\d+$/)
    const id = new URL(page.url()).pathname.split('/').pop()
    try {
      await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle fiche : Vidéo' })).toBeVisible()
      await expect(page.getByText('Où se trouve la vidéo ?')).toBeVisible()
      await expect(page.locator('.date-time-picker input').first()).toHaveValue(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
      expect(errors).toEqual([])
    } finally {
      await request.delete(`/api/videos/${id}`, { headers: await adminHeaders(request) })
    }
  })

  test('aide : réservée aux personnes connectées', async ({ page }) => {
    await page.goto('/admin/aide')
    await expect(page).toHaveURL(/\/admin\/login\?redirect=/)
    await expect(page.getByText('Guide de l’administration')).toHaveCount(0)
    await page.fill('input[name="email"]', ADMIN.email)
    await page.fill('input[name="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/admin\/aide$/)
  })

  test('aide : le guide s’affiche et le sommaire mène aux parties', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ADMIN)
    await page.goto('/admin/aide')
    await expect(page.getByRole('heading', { level: 1, name: /Guide de l’administration/ })).toBeVisible()
    await page.locator('.sw-doc ol').first().getByRole('link').nth(3).click()
    await expect(page).toHaveURL(/#4-/)
    await expect(page.locator('.sw-doc h2').nth(4)).toBeInViewport()
    expect(errors).toEqual([])
  })

  test('grille des programmes : semaine en cours et filtre par jour', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ADMIN)
    await page.goto('/admin/collections/schedule')
    await expect(page).toHaveURL(/where/)
    await expect(page.locator('.sw-week__title')).toHaveText(/^Semaine du lundi/)
    await expect(page.locator('.sw-week__count')).toContainText(/créneau/)
    const wednesday = page.locator('.sw-day').nth(3)
    await wednesday.click()
    await expect(wednesday).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.sw-week__count')).toContainText(/mercredi/)
    expect(errors).toEqual([])
  })

  test('recopie de semaine : refus clairs sans compte ou sans créneau à recopier', async ({ request }) => {
    expect((await request.post('/api/schedule/copy-week', { data: { from: '2026-01-05' } })).status()).toBe(401)
    const headers = await adminHeaders(request)
    const invalid = await request.post('/api/schedule/copy-week', { headers, data: { from: 'lundi' } })
    expect(invalid.status()).toBe(400)
    // une semaine lointaine, forcément vide : rien n'est modifié
    const empty = await request.post('/api/schedule/copy-week', { headers, data: { from: '2099-06-01' } })
    expect(empty.status()).toBe(400)
    expect(((await empty.json()) as { error: string }).error).toMatch(/ne contient aucun créneau/)
  })

  test('Top 10 : une vidéo mise à la place 1 est 1re sur l’accueil, les autres se décalent', async ({ page, request }) => {
    const headers = await adminHeaders(request)
    type V = { id: number; title: string; top10Rank?: number | null }
    const list = async () =>
      ((await (await request.get(`/api/videos?limit=200&depth=0&where[publishedAt][less_than_equal]=${new Date().toISOString()}`, { headers })).json()) as { docs: V[] }).docs
    const before = await list()
    const target = before.find((v) => v.top10Rank == null)
    test.skip(!target || before.filter((v) => v.top10Rank != null).length === 0, 'il faut des vidéos classées et une vidéo hors classement (lancez npm run seed)')
    const original = new Map(before.map((v) => [v.id, v.top10Rank ?? null]))
    const setRank = (id: number, top10Rank: number | null) => request.patch(`/api/videos/${id}`, { headers, data: { top10Rank } })
    try {
      expect((await setRank(target!.id, 1)).ok()).toBe(true)
      const after = await list()
      const ranks = after.filter((v) => v.top10Rank != null).map((v) => v.top10Rank)
      expect(new Set(ranks).size, 'aucune place en double').toBe(ranks.length)
      await page.goto('/')
      await expect(page.locator('#rail-top a').first()).toHaveAttribute('aria-label', `1. ${target!.title}`)
    } finally {
      // classement d'origine : la vidéo testée sort, puis chaque vidéo décalée retrouve sa place
      await setRank(target!.id, null)
      const now = await list()
      const moved = now.filter((v) => (v.top10Rank ?? null) !== original.get(v.id)).sort((a, b) => (original.get(a.id) ?? 99) - (original.get(b.id) ?? 99))
      for (const v of moved) await setRank(v.id, original.get(v.id) ?? null)
    }
  })

  test('éditeur : rubriques techniques masquées, compte personnel accessible', async ({ page, request }) => {
    const headers = await adminHeaders(request)
    const account = { email: 'e2e-editeur@swatter-tv.fr', password: 'e2e-editeur-2026!' }
    const previous = (await (await request.get(`/api/users?where[email][equals]=${encodeURIComponent(account.email)}&depth=0`, { headers })).json()) as {
      docs: { id: number }[]
    }
    for (const user of previous.docs) await request.delete(`/api/users/${user.id}`, { headers })
    const created = await request.post('/api/users', { headers, data: { ...account, role: 'editeur', name: 'Dominique Testeur' } })
    expect(created.ok()).toBe(true)
    const { doc } = (await created.json()) as { doc: { id: number } }
    try {
      await login(page, account)
      await expect(page.getByRole('heading', { level: 1, name: /Dominique/ })).toBeVisible()
      const nav = page.locator('.nav__wrap')
      await expect(nav.getByText('Les rubriques du site', { exact: true })).toHaveCount(1)
      await expect(nav.getByText('Administration', { exact: true })).toHaveCount(0)
      await page.goto('/admin/collections/users')
      await expect(page.getByText('Rien n’a été trouvé')).toBeVisible()
      await page.goto('/admin/account')
      await expect(page.getByText('Changer le mot de passe')).toBeVisible()
    } finally {
      await request.delete(`/api/users/${doc.id}`, { headers })
    }
  })

  test('brouillon : invisible des visiteurs, visible en aperçu, en ligne une fois publié', async ({ page, request }) => {
    const headers = await adminHeaders(request)
    const slug = `e2e-brouillon-${Date.now()}`
    const title = 'Page de test en brouillon'
    const created = await request.post('/api/pages?draft=true', { headers, data: { title, slug, _status: 'draft' } })
    expect(created.ok()).toBe(true)
    const { doc } = (await created.json()) as { doc: { id: number } }
    const anonymous = await visitor()
    try {
      expect((await anonymous.get(`/${slug}`)).status()).toBe(404)
      expect(((await (await anonymous.get(`/api/pages?where[slug][equals]=${slug}`)).json()) as { totalDocs: number }).totalDocs).toBe(0)

      // l'aperçu demande d'être connecté, puis montre le brouillon avec un bandeau
      await page.goto(`/apercu?chemin=${encodeURIComponent(`/${slug}`)}`)
      await expect(page).toHaveURL(/\/admin\/login\?redirect=/)
      await page.fill('input[name="email"]', ADMIN.email)
      await page.fill('input[name="password"]', ADMIN.password)
      await page.click('button[type="submit"]')
      await expect(page).toHaveURL(new RegExp(`/${slug}$`))
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.locator('.preview-bar')).toContainText('pas encore publiées')

      await page.getByRole('link', { name: 'Voir le site comme les visiteurs' }).click()
      await expect(page.locator('.preview-bar')).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1, name: title })).toHaveCount(0)

      expect((await request.patch(`/api/pages/${doc.id}`, { headers, data: { _status: 'published' } })).ok()).toBe(true)
      const live = await anonymous.get(`/${slug}`)
      expect(live.status()).toBe(200)
      expect(await live.text()).toContain(title)
    } finally {
      await request.delete(`/api/pages/${doc.id}`, { headers })
      await anonymous.dispose()
    }
  })

  test('accueil et direct : un brouillon reste invisible des visiteurs, même par l’API', async ({ request }) => {
    const headers = await adminHeaders(request)
    const published = (await (await request.get('/api/globals/settings?depth=0', { headers })).json()) as { flashItems?: unknown[] }
    const message = `Message de test en brouillon ${Date.now()}`
    const anonymous = await visitor()
    try {
      const draft = await request.post('/api/globals/settings?draft=true', { headers, data: { flashItems: [{ label: 'Essai', text: message }] } })
      expect(draft.ok()).toBe(true)
      expect(await (await request.get('/api/globals/settings?depth=0&draft=true', { headers })).text()).toContain(message)
      for (const url of ['/api/globals/settings?depth=0', '/api/globals/settings?depth=0&draft=true', '/']) {
        expect(await (await anonymous.get(url)).text(), url).not.toContain(message)
      }
    } finally {
      // retour à la version publiée (comme « Annuler les modifications »)
      await request.post('/api/globals/settings?depth=0', { headers, data: published })
      await anonymous.dispose()
    }
  })

  test('direct sur Twitch : lien vérifié à la publication, lecteur Twitch au clic', async ({ page, request }) => {
    const headers = await adminHeaders(request)
    const published = (await (await request.get('/api/globals/settings?depth=0', { headers })).json()) as Record<string, unknown>
    try {
      const refused = await request.post('/api/globals/settings', { headers, data: { live: { provider: 'twitch', twitchUrl: 'https://www.youtube.com/@swattertv' } } })
      expect(refused.status()).toBe(400)
      expect(await refused.text()).toContain('chaîne Twitch')

      const saved = await request.post('/api/globals/settings', { headers, data: { liveEnabled: true, live: { provider: 'twitch', twitchUrl: 'https://www.twitch.tv/SwatterTV' } } })
      expect(saved.ok()).toBe(true)
      await page.goto('/direct')
      // façade : rien n'est chargé depuis Twitch avant le clic (consentement « contenus externes »)
      await expect(page.locator('.vp__notice')).toContainText('lecteur Twitch')
      await expect(page.locator('iframe.vp__frame')).toHaveCount(0)
      await page.locator('.vp__play').click()
      const src = new URL((await page.locator('iframe.vp__frame').getAttribute('src')) ?? '')
      expect(src.origin).toBe('https://player.twitch.tv')
      expect(src.searchParams.get('channel')).toBe('swattertv')
      expect(src.searchParams.getAll('parent')).toContain(new URL(page.url()).hostname)
    } finally {
      await request.post('/api/globals/settings?depth=0', { headers, data: published })
    }
  })

  test('chaîne YouTube : les vidéos de la chaîne dans « Vidéos » et « Replays », recréées si elles manquent', async ({ page, request }) => {
    // faux YouTube : le serveur du site doit être lancé avec YOUTUBE_BASE et YOUTUBE_THUMB_BASE pointant sur ce port
    const port = Number(process.env.E2E_YOUTUBE_MOCK_PORT)
    test.skip(!port, 'E2E_YOUTUBE_MOCK_PORT non défini (voir tests/e2e/youtube-mock.ts)')
    const mock = await startYoutubeMock(port)
    const headers = await adminHeaders(request)
    const before = (await (await request.get('/api/globals/youtube?depth=0', { headers })).json()) as Record<string, unknown>
    type Doc = { id: number; title: string; thumbnail?: number | null }
    const find = async (collection: 'videos' | 'replays') =>
      ((await (await request.get(`/api/${collection}?limit=50&depth=0&draft=true&where[title][like]=Test import`, { headers })).json()) as { docs: Doc[] }).docs
    const cleanup = async () => {
      for (const collection of ['videos', 'replays'] as const) for (const d of await find(collection)) await request.delete(`/api/${collection}/${d.id}`, { headers })
    }
    try {
      await cleanup()
      expect(
        (await request.post('/api/globals/youtube', { headers, data: { channel: 'https://www.youtube.com/@swattertv-test', autoImport: true, inVideos: true, inReplays: true, publishMode: 'published', category: 'magazine', channelId: null, channelFrom: null } })).ok(),
      ).toBe(true)

      // bouton « Importer maintenant » de la fiche
      await login(page, ADMIN)
      await page.goto('/admin/globals/youtube')
      await page.getByRole('button', { name: 'Importer maintenant' }).click()
      await expect(page.getByText('3 vidéos ajoutées dans « Vidéos », 3 vidéos dans « Replays »').first()).toBeVisible({ timeout: 30_000 })

      const titles = MOCK_VIDEOS.map((v) => v.title).sort()
      const videos = await find('videos')
      expect(videos.map((v) => v.title).sort()).toEqual(titles)
      expect((await find('replays')).map((v) => v.title).sort()).toEqual(titles)
      expect(videos.every((v) => v.thumbnail), 'vignette YouTube récupérée').toBe(true)
      await page.goto('/videos')
      await expect(page.locator('main')).toContainText(MOCK_VIDEOS[2].title)
      await page.goto('/replay')
      await expect(page.locator('main')).toContainText(MOCK_VIDEOS[2].title)

      // relancé : rien à ajouter ; une vidéo supprimée revient, une vidéo « retirée du site » reste cachée
      const sync = async () => (await (await request.post('/api/youtube/import', { headers })).json()) as { ok: boolean; videos: number; replays: number; total: number }
      expect(await sync()).toMatchObject({ ok: true, videos: 0, replays: 0, total: 3 })
      await request.delete(`/api/videos/${videos[0].id}`, { headers })
      expect((await request.patch(`/api/videos/${videos[1].id}`, { headers, data: { _status: 'draft' } })).ok()).toBe(true)
      expect(await sync()).toMatchObject({ ok: true, videos: 1, replays: 0 })
      expect(await find('videos')).toHaveLength(3)

      // adresse invalide refusée à l'enregistrement
      const refused = await request.post('/api/globals/youtube', { headers, data: { channel: 'https://www.dailymotion.com/swattertv' } })
      expect(refused.status()).toBe(400)
    } finally {
      await cleanup()
      await request.post('/api/globals/youtube', { headers, data: before })
      mock.close()
    }
  })

  test('aperçu en direct : il montre l’endroit modifié (onglet, webcam)', async ({ page, request }) => {
    const errors = watchErrors(page)
    await login(page, ADMIN)
    const preview = () => page.frames().find((f) => f !== page.mainFrame() && f.url().includes('://') && !f.url().includes('/admin'))
    const shown = async () => (await preview()?.evaluate(() => document.documentElement.dataset.previewFocus)) ?? null
    await page.goto('/admin/globals/settings')
    await expect(page.locator('.live-preview-window iframe')).toBeVisible({ timeout: 30_000 })
    await expect.poll(shown, { timeout: 20_000 }).toBe('hero')
    await page.getByRole('button', { name: 'Le direct', exact: true }).click()
    await expect.poll(async () => `${new URL(preview()?.url() ?? 'http://x/').pathname} ${await shown()}`, { timeout: 20_000 }).toBe('/direct live')
    await page.getByRole('button', { name: 'Flash info', exact: true }).click()
    await expect.poll(shown, { timeout: 20_000 }).toBe('flash')

    const headers = await adminHeaders(request)
    const cams = ((await (await request.get('/api/webcams?limit=1&depth=0&sort=order', { headers })).json()) as { docs: { id: number; slug: string }[] }).docs
    test.skip(!cams.length, 'aucune webcam (lancez npm run seed)')
    await page.goto(`/admin/collections/webcams/${cams[0].id}`)
    await expect.poll(shown, { timeout: 30_000 }).toBe(`webcam-${cams[0].slug}`)
    // l'administration elle-même ne défile pas
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(errors).toEqual([])
  })

  test('aperçu en direct : la modification s’affiche à côté du formulaire, le site change à la publication', async ({ page, request }) => {
    const errors = watchErrors(page)
    const headers = await adminHeaders(request)
    const slug = `e2e-apercu-${Date.now()}`
    const created = await request.post('/api/pages', { headers, data: { title: 'Page de test publiée', slug, _status: 'published' } })
    expect(created.ok()).toBe(true)
    const { doc } = (await created.json()) as { doc: { id: number } }
    const anonymous = await visitor()
    const changed = 'Titre modifié dans l’aperçu'
    try {
      await login(page, ADMIN)
      await page.goto(`/admin/collections/pages/${doc.id}`)
      // l'aperçu s'ouvre d'office à côté du formulaire
      const preview = page.frameLocator('.live-preview-window iframe')
      await expect(preview.getByRole('heading', { level: 1, name: 'Page de test publiée' })).toBeVisible({ timeout: 30_000 })
      await page.locator('#field-title').fill(changed)
      await expect(preview.getByRole('heading', { level: 1, name: changed })).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('.doc-controls__status')).toContainText('Modifications non publiées')
      expect(await (await anonymous.get(`/${slug}`)).text()).not.toContain(changed)

      await page.getByRole('button', { name: 'Publier les modifications' }).click()
      await expect(page.locator('.doc-controls__status')).toContainText('Publié')
      expect(await (await anonymous.get(`/${slug}`)).text()).toContain(changed)
      expect(errors).toEqual([])
    } finally {
      await request.delete(`/api/pages/${doc.id}`, { headers })
      await anonymous.dispose()
    }
  })
})
