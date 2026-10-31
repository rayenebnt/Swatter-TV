import { expect, request as apiRequest, test, type APIRequestContext, type Page } from '@playwright/test'
import { settle, watchErrors } from './helpers'
import { mobileContext, presetConsent, recordThirdParty } from './outils-contenus'
import { MOCK_PROGRAM, MOCK_VIDEOS, startYoutubeMock } from './youtube-mock'

/**
 * Administration pensée pour une équipe non technique : tableau de bord, aide intégrée, outil de la grille,
 * brouillons avec aperçu avant publication et rubriques techniques masquées aux éditeurs. Identifiants : E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * (par défaut ceux du poste de développement, voir README) ; sans compte valide, ces tests sont ignorés.
 */
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin@swatter-tv.fr',
  password: process.env.E2E_ADMIN_PASSWORD || 'swatter-admin-2026',
}

/** Origine du site, pour les requêtes de l'espace membres qui modifient quelque chose (contrôle d'origine). */
const SITE = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000').origin

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/admin/login')
  // formulaire prêt (hydraté) : sinon la saisie peut être effacée au chargement
  await page.waitForLoadState('networkidle')
  await page.fill('input[name="email"]', account.email)
  await page.fill('input[name="password"]', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

/** Requêtes d'un visiteur anonyme (sans les cookies de connexion des autres requêtes du test). */
const visitor = () => apiRequest.newContext({ baseURL: test.info().project.use.baseURL })

/** Membre créé par une inscription. Son empreinte de mot de passe n'est jamais renvoyée, même aux administrateurs. */
async function createdMember(request: APIRequestContext, headers: Record<string, string>, email: string): Promise<number> {
  let found: { id: number; passwordHash?: string } | undefined
  await expect
    .poll(async () => {
      const res = await request.get(`/api/members?where[email][equals]=${encodeURIComponent(email)}&depth=0`, { headers })
      found = ((await res.json()) as { docs: { id: number; passwordHash?: string }[] }).docs[0]
      return Boolean(found)
    }, { message: `membre ${email} créé` })
    .toBe(true)
  expect(found?.passwordHash).toBeUndefined()
  return found!.id
}

/**
 * La page tient dans l'écran : le navigateur ne l'a pas élargie (sur téléphone, un contenu trop large fait dézoomer la
 * page entière, ce que scrollWidth seul ne voit pas : innerWidth grandit avec lui) et aucun élément du contenu ne sort à
 * droite, sauf dans un conteneur qui défile ou qui rogne (tableaux des listes).
 */
async function expectFitsScreen(page: Page, width: number) {
  const fit = await page.evaluate(() => {
    const right = document.documentElement.clientWidth + 1
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= right) return true
      }
      return false
    }
    const outside = [...document.querySelectorAll('.template-default__wrap *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > right && !inScroller(el)
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')}`)
    return { innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, outside }
  })
  expect(fit, `la page tient dans ${width} px`).toEqual({ innerWidth: width, scrollWidth: width, outside: [] })
}

/** Texte, nombre de mots et nombre de lignes occupées par chaque élément du sélecteur. */
const textLines = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const text = el.textContent?.trim() ?? ''
      return { text, words: text.split(/\s+/).length, lines: new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size }
    }),
  )

/** Aucun texte coupé mot par mot : sur une seule ligne, ou avec moins de lignes que de mots. */
async function expectNoWordPerLine(page: Page, selector: string) {
  const cut = (await textLines(page, selector)).filter((t) => t.lines > 1 && t.lines >= t.words)
  expect(cut, `textes coupés mot par mot (${selector})`).toEqual([])
}

/** Boîte du menu, de la zone de contenu, et élément au centre de l'écran (le menu, s'il recouvre le contenu). */
const navLayout = (page: Page) =>
  page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect()
      return { x: Math.round(r.x), width: Math.round(r.width) }
    }
    const nav = document.querySelector('aside.nav')!
    return {
      open: nav.classList.contains('nav--nav-open'),
      nav: box('aside.nav'),
      content: box('.template-default__wrap'),
      background: getComputedStyle(nav).backgroundColor,
      onTop: Boolean(document.elementFromPoint(window.innerWidth / 4, window.innerHeight / 2)?.closest('aside.nav')),
      innerWidth: window.innerWidth,
    }
  })

/** Ouvre le menu par son bouton et attend la fin du glissement (menu collé au bord gauche). */
async function openNav(page: Page, toggler: string) {
  await page.locator(toggler).click()
  await expect(page.locator('aside.nav')).toHaveClass(/nav--nav-open/)
  await expect.poll(async () => (await navLayout(page)).nav.x).toBe(0)
}

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

  test('mot de passe oublié : un lien de réinitialisation est demandé par e-mail', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/admin/login')
    await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
    await page.waitForURL(/\/admin\/forgot/)
    await page.waitForLoadState('networkidle')
    await page.fill('input[name="email"]', ADMIN.email)
    await page.click('button[type="submit"]')
    await expect(page.getByText(/Si l.adresse e-mail est associée à un compte/)).toBeVisible()
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('formulaire de contact : un message envoyé arrive dans « Messages reçus »', async ({ page, request }) => {
    const headers = await adminHeaders(request)
    const name = `Test contact ${Date.now()}`
    const errors = watchErrors(page)
    try {
      await page.goto('/contact')
      await settle(page)
      await page.getByLabel(/Nom et prénom/).fill(name)
      await page.getByLabel(/^E-mail/).fill('lecteur@example.com')
      await page.getByLabel(/Commune/).fill('Cluses')
      await page.getByLabel(/Votre info/).fill('Un nouveau marché de producteurs ouvre samedi sur la place.')
      await page.getByLabel(/Lien vers vos photos/).fill('https://example.com/photos')
      await page.getByLabel(/J’accepte/).check()
      // un humain met plus de 3 s à remplir le formulaire (en dessous : traité comme un robot)
      await page.waitForTimeout(3200)
      await page.getByRole('button', { name: 'Envoyer à la rédaction' }).click()
      await expect(page.getByRole('heading', { name: /Merci, votre message est bien parti/ })).toBeVisible()
      const res = await request.get(`/api/messages?where[name][equals]=${encodeURIComponent(name)}&depth=0`, { headers })
      const { docs } = (await res.json()) as { docs: { subject: string; city: string; link: string; handled: boolean }[] }
      expect(docs).toHaveLength(1)
      expect(docs[0]).toMatchObject({ subject: 'info', city: 'Cluses', link: 'https://example.com/photos', handled: false })
      // un visiteur ne peut pas lire les messages reçus
      const anonymous = await page.request.get('/api/messages?depth=0', { headers: { Authorization: '' } })
      expect(((await anonymous.json()) as { docs?: unknown[] }).docs ?? []).toHaveLength(0)
      // l'envoi direct à l'API, sans passer par le formulaire (contact.spec.ts), n'a rien enregistré
      const robot = await request.get('/api/messages?where[name][equals]=Robot%20Test&depth=0', { headers })
      expect(((await robot.json()) as { totalDocs: number }).totalDocs).toBe(0)
      expect(errors, errors.join('\n')).toEqual([])
    } finally {
      await request.delete(`/api/messages?where[name][like]=Test%20contact`, { headers })
    }
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
    // mesure d'audience : sans ID de mesure (contenus de départ), rien n'est mesuré et le lien vers les réglages est proposé
    const audience = page.locator('.sw-status__row').filter({ hasText: 'Mesure d’audience' })
    await expect(audience).toContainText('Aucun ID de mesure')
    await expect(audience.getByRole('link', { name: 'Modifier : Mesure d’audience' })).toHaveAttribute('href', '/admin/globals/settings')
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
    await page.waitForLoadState('networkidle')
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

  test('direct sur Twitch : lien vérifié à la publication ; façade sans accord, lecteur seul et sans le son avec l’accord', async ({ page, request, browser }) => {
    const headers = await adminHeaders(request)
    const published = (await (await request.get('/api/globals/settings?depth=0', { headers })).json()) as Record<string, unknown>
    try {
      const refused = await request.post('/api/globals/settings', { headers, data: { live: { provider: 'twitch', twitchUrl: 'https://www.youtube.com/@swattertv' } } })
      expect(refused.status()).toBe(400)
      expect(await refused.text()).toContain('chaîne Twitch')

      const saved = await request.post('/api/globals/settings', { headers, data: { liveEnabled: true, live: { provider: 'twitch', twitchUrl: 'https://www.twitch.tv/SwatterTV' } } })
      expect(saved.ok()).toBe(true)
      await recordThirdParty(page.context())
      await page.goto('/direct')
      // sans accord aux contenus externes : façade, rien n'est chargé depuis Twitch avant le clic
      await expect(page.locator('.vp__notice')).toContainText('lecteur Twitch')
      await page.waitForTimeout(1_000)
      await expect(page.locator('iframe.vp__frame')).toHaveCount(0)
      await page.locator('.vp__play').click()
      const src = new URL((await page.locator('iframe.vp__frame').getAttribute('src')) ?? '')
      expect(src.origin).toBe('https://player.twitch.tv')
      expect(src.searchParams.get('channel')).toBe('swattertv')
      expect(src.searchParams.getAll('parent')).toContain(new URL(page.url()).hostname)
      // lecture demandée par un clic : avec le son
      expect(src.searchParams.get('muted')).toBe('false')

      // accord aux contenus externes : le direct se charge seul dès qu'il est visible, sans le son (règle des navigateurs)
      const baseURL = test.info().project.use.baseURL
      const accepted = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
      try {
        await presetConsent(accepted, { audience: false, externes: true })
        await recordThirdParty(accepted)
        const visit = await accepted.newPage()
        await visit.goto('/direct')
        const frame = visit.locator('iframe.vp__frame')
        await expect(frame).toHaveAttribute('src', /^https:\/\/player\.twitch\.tv\//)
        const auto = new URL((await frame.getAttribute('src')) ?? '')
        expect(auto.searchParams.get('channel')).toBe('swattertv')
        expect(auto.searchParams.get('autoplay')).toBe('true')
        expect(auto.searchParams.get('muted')).toBe('true')
        expect(auto.searchParams.getAll('parent')).toContain(new URL(visit.url()).hostname)
        await expect(visit.locator('.vp__play')).toHaveCount(0)
      } finally {
        await accepted.close()
      }

      // « réduire les animations » : jamais de lecture automatique, même avec l'accord
      const calm = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
      try {
        await presetConsent(calm, { audience: false, externes: true })
        const third = await recordThirdParty(calm)
        const visit = await calm.newPage()
        await visit.goto('/direct')
        await expect(visit.locator('.vp__play')).toBeVisible()
        await visit.waitForTimeout(1_500)
        await expect(visit.locator('iframe.vp__frame')).toHaveCount(0)
        expect(third, 'rien de Twitch sans clic').toEqual([])
      } finally {
        await calm.close()
      }
    } finally {
      await request.post('/api/globals/settings?depth=0', { headers, data: published })
    }
  })

  test('chaîne YouTube : Shorts et vidéos courtes dans « Vidéos », émissions longues dans « Replays »', async ({ page, request }) => {
    // faux YouTube : le serveur du site doit être lancé avec YOUTUBE_BASE et YOUTUBE_THUMB_BASE pointant sur ce port
    const port = Number(process.env.E2E_YOUTUBE_MOCK_PORT)
    test.skip(!port, 'E2E_YOUTUBE_MOCK_PORT non défini (voir tests/e2e/youtube-mock.ts)')
    const mock = await startYoutubeMock(port)
    const headers = await adminHeaders(request)
    const before = (await (await request.get('/api/globals/youtube?depth=0', { headers })).json()) as Record<string, unknown>
    type Doc = { id: number; title: string; thumbnail?: number | null; duration?: string | null; program?: number | null }
    const find = async (collection: 'videos' | 'replays' | 'programs') =>
      ((await (await request.get(`/api/${collection}?limit=50&depth=0&draft=true&where[title][like]=Test import`, { headers })).json()) as { docs: Doc[] }).docs
    const cleanup = async () => {
      for (const collection of ['videos', 'replays', 'programs'] as const) for (const d of await find(collection)) await request.delete(`/api/${collection}/${d.id}`, { headers })
    }
    try {
      await cleanup()
      const program = (await (await request.post('/api/programs', { headers, data: { title: MOCK_PROGRAM, genre: 'magazine', _status: 'published' } })).json()) as { doc: { id: number } }
      expect(
        (await request.post('/api/globals/youtube', { headers, data: { channel: 'https://www.youtube.com/@swattertv-test', autoImport: true, replayMinutes: 20, publishMode: 'published', category: 'magazine', channelId: null, channelFrom: null } })).ok(),
      ).toBe(true)

      // bouton « Importer maintenant » de la fiche
      await login(page, ADMIN)
      await page.goto('/admin/globals/youtube')
      await page.getByRole('button', { name: 'Importer maintenant' }).click()
      await expect(page.getByText('2 vidéos ajoutées dans « Vidéos », 1 vidéo dans « Replays »').first()).toBeVisible({ timeout: 30_000 })

      const [short, medium, long] = MOCK_VIDEOS
      const videos = await find('videos')
      expect(videos.map((v) => v.title).sort()).toEqual([short.title, medium.title].sort())
      expect(videos.find((v) => v.title === medium.title)?.duration).toBe('04:05')
      expect(videos.every((v) => v.thumbnail), 'vignette YouTube récupérée').toBe(true)
      const replays = await find('replays')
      expect(replays.map((r) => r.title)).toEqual([long.title])
      expect(replays[0]).toMatchObject({ duration: '45 min', program: program.doc.id })
      await page.goto('/replay')
      await expect(page.locator('main')).toContainText(long.title)

      // relancé : rien à ajouter ; une vidéo supprimée revient, une vidéo « retirée du site » reste cachée
      const sync = async () => (await (await request.post('/api/youtube/import', { headers })).json()) as { ok: boolean; videos: number; replays: number; total: number }
      expect(await sync()).toMatchObject({ ok: true, videos: 0, replays: 0, total: 3 })
      await request.delete(`/api/replays/${replays[0].id}`, { headers })
      expect((await request.patch(`/api/videos/${videos[0].id}`, { headers, data: { _status: 'draft' } })).ok()).toBe(true)
      expect(await sync()).toMatchObject({ ok: true, videos: 0, replays: 1 })

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

  test('membres : 5 mauvais mots de passe bloquent le compte, même envoyés tous en même temps', async ({ request }) => {
    const headers = await adminHeaders(request)
    const email = `e2e-verrou-${Date.now()}@example.com`
    const guest = await visitor()
    const login = (password: string) => guest.post('/api/compte/connexion', { headers: { origin: SITE }, data: { email, password } })
    await guest.post('/api/compte/inscription', {
      headers: { origin: SITE },
      data: { firstName: 'Dominique', email, password: 'mot-de-passe-e2e', website: '', elapsed: 5000 },
    })
    const memberId = await createdMember(request, headers, email)
    try {
      // rafale de 8 essais faux : tous comptés, le compte est bloqué
      const burst = await Promise.all(Array.from({ length: 8 }, (_, i) => login(`faux-mot-de-passe-${i}`)))
      expect(burst.map((r) => r.status()).sort()).toEqual([401, 401, 401, 401, 401, 429, 429, 429])
      // même le bon mot de passe est refusé pendant le blocage
      const blocked = await login('mot-de-passe-e2e')
      expect(blocked.status()).toBe(429)
      expect(((await blocked.json()) as { code?: string }).code).toBe('locked')
      // une adresse sans compte se comporte de la même façon (rien ne révèle si elle est inscrite)
      const nobody = `e2e-personne-${Date.now()}@example.com`
      const unknown: number[] = []
      for (let i = 0; i < 6; i++) unknown.push((await guest.post('/api/compte/connexion', { headers: { origin: SITE }, data: { email: nobody, password: 'faux' } })).status())
      expect(unknown).toEqual([401, 401, 401, 401, 401, 429])
    } finally {
      await request.delete(`/api/members/${memberId}`, { headers }).catch(() => undefined)
      await guest.dispose()
    }
  })

  test('membres : parcours complet d’un membre, et sa gestion dans « Membres du site »', async ({ page, request, browser }) => {
    test.setTimeout(180_000)
    const headers = await adminHeaders(request)
    const errors = watchErrors(page)
    const email = `e2e-membre-${Date.now()}@example.com`
    const password = 'mot-de-passe-e2e'
    const replays = (await (await request.get('/api/replays?limit=1&depth=0')).json()) as { docs: { id: number; slug: string; title: string }[] }
    const replay = replays.docs[0]
    test.skip(!replay, 'aucun replay publié (npm run seed)')

    // inscription d'un visiteur (compte actif aussitôt)
    const guest = await visitor()
    const signup = await guest.post('/api/compte/inscription', { headers: { origin: SITE }, data: { firstName: 'Camille', email, password, website: '', elapsed: 5000 } })
    expect(await signup.json()).toMatchObject({ ok: true })
    const memberId = await createdMember(request, headers, email)

    try {
      // connexion depuis la page d'un replay : retour sur cette page
      await page.goto(`/replay/${replay.slug}`)
      await settle(page)
      await page.locator('header').getByRole('link', { name: /Se connecter/ }).click()
      await expect(page).toHaveURL(new RegExp(`/connexion\\?retour=%2Freplay%2F${replay.slug}$`))
      await settle(page)
      await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
      await page.locator('input[name="password"]').fill(password)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await page.waitForURL(new RegExp(`/replay/${replay.slug}$`))
      await expect(page.locator('header').getByRole('link', { name: 'Mon espace' })).toHaveAttribute('href', '/compte')

      // la session d'un membre ne donne aucun droit dans l'administration ni sur les données des autres
      const me = (await (await page.request.get('/api/users/me')).json()) as { user: unknown }
      expect(me.user, 'un membre n’est pas un utilisateur de l’administration').toBeNull()
      expect((await page.request.get('/api/members')).status()).toBe(403)
      expect((await page.request.get('/api/membres/lettre-info.csv')).status()).toBe(403)

      // « Ajouter à ma liste »
      const save = page.getByRole('button', { name: /Ajouter à ma liste/ })
      await save.click()
      await expect(page.getByRole('button', { name: /Dans ma liste/ })).toHaveAttribute('aria-pressed', 'true')
      // le bouton change aussitôt ; l'enregistrement est fait quand le message s'affiche
      await expect(page.getByRole('status').filter({ hasText: 'Ajouté à votre liste.' })).toBeVisible()
      await page.goto('/compte/ma-liste')
      await expect(page.locator('main').getByRole('link', { name: replay.title }).first()).toBeVisible()

      // historique (enregistré par le lecteur à la lecture : ici par l'API, le Chromium des tests ne lit pas les vidéos)
      const watched = await page.request.post('/api/compte/historique', { headers: { origin: SITE }, data: { kind: 'replay', id: replay.id } })
      expect(watched.ok()).toBe(true)
      await page.goto('/compte/historique')
      await expect(page.locator('main').getByRole('link', { name: replay.title }).first()).toBeVisible()
      await page.getByRole('button', { name: /Retirer de l’historique/ }).first().click()
      await expect(page.locator('main').getByRole('link', { name: replay.title })).toHaveCount(0)

      // profil : département (repris par le tableau de bord) et accord pour les e-mails, choisis après l'inscription
      await page.goto('/compte/profil')
      await settle(page)
      await page.getByLabel('Mon département').selectOption('rhone')
      await page.getByRole('checkbox', { name: /Recevoir les actualités/ }).check()
      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Vos informations sont enregistrées.' })).toBeVisible()
      await page.goto('/compte')
      await expect(page.getByRole('heading', { name: 'Ma météo' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Ma météo' })).toContainText('Rhône')

      // export des données : profil, liste, sans aucun secret
      const exported = await page.request.get('/api/compte/export')
      expect(exported.headers()['content-disposition']).toContain('attachment')
      const text = await exported.text()
      expect(text).toContain(email)
      expect(text).not.toMatch(/passwordHash|scrypt\$|TokenHash|sessionVersion/)

      // administration : export CSV des membres qui acceptent les e-mails (une formule saisie dans le nom reste du texte
      // dans Excel), fiche du membre
      expect((await page.request.patch('/api/compte/profil', { headers: { origin: SITE }, data: { lastName: '=1+1' } })).ok()).toBe(true)
      const csv = await request.get('/api/membres/lettre-info.csv', { headers })
      expect(csv.ok()).toBe(true)
      expect(await csv.text()).toContain(`Camille;'=1+1;${email};`)
      const admin = await browser.newPage()
      await login(admin, ADMIN)
      await admin.goto(`/admin/collections/members?search=${encodeURIComponent(email)}`)
      await expect(admin.getByText(email).first()).toBeVisible()
      await admin.close()

      // suspension : la session en cours est fermée ; levée de la suspension : nouvelle connexion nécessaire
      expect((await request.patch(`/api/members/${memberId}`, { headers, data: { blocked: true } })).ok()).toBe(true)
      expect((await page.request.get('/api/compte/moi')).status()).toBe(401)
      const blocked = await page.request.post('/api/compte/connexion', { headers: { origin: SITE }, data: { email, password } })
      expect(((await blocked.json()) as { code?: string }).code).toBe('blocked')
      expect((await request.patch(`/api/members/${memberId}`, { headers, data: { blocked: false } })).ok()).toBe(true)
      expect((await page.request.post('/api/compte/connexion', { headers: { origin: SITE }, data: { email, password } })).ok()).toBe(true)

      // suppression du compte par le membre (mot de passe demandé) : tout est effacé
      await page.goto('/compte/profil')
      await settle(page)
      await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
      await page.locator('.space-danger input[name="password"]').fill(password)
      await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
      await expect(page.getByRole('heading', { name: 'Votre compte a été supprimé' })).toBeVisible()
      const gone = (await (await request.get(`/api/members?where[email][equals]=${encodeURIComponent(email)}&depth=0`, { headers })).json()) as { totalDocs: number }
      expect(gone.totalDocs).toBe(0)
      expect((await guest.post('/api/compte/connexion', { headers: { origin: SITE }, data: { email, password } })).status()).toBe(401)
      // seules erreurs attendues : la session fermée par la suspension (401 de la page, avant la nouvelle connexion)
      expect(errors.filter((e) => !/HTTP 401 : \/api\/compte\//.test(e)), errors.join('\n')).toEqual([])
    } finally {
      // nettoyage si le test s'est arrêté avant la suppression
      await request.delete(`/api/members/${memberId}`, { headers }).catch(() => undefined)
      await guest.dispose()
    }
  })

  // Téléphone et tablette (≤ 1024 px) : le menu passe par-dessus le contenu, qui garde toute la largeur (custom.scss,
  // useModalNav de NavLinks.tsx). Contextes « mobile » ouverts ici : les connexions administrateur restent une à une.
  test('téléphone : menu fermé à l’arrivée, ouvert par-dessus le contenu, rien ne déborde à 390 px', async ({ browser }) => {
    test.setTimeout(150_000)
    const context = await mobileContext(browser)
    const page = await context.newPage()
    const errors = watchErrors(page)
    const width = page.viewportSize()!.width
    const toggler = '.app-header__mobile-nav-toggler'
    const expectClosed = async () => {
      await expect(page.locator('aside.nav')).not.toHaveClass(/nav--nav-open/)
      await expect(page.locator('aside.nav')).toBeHidden()
    }
    // API avec la session de la page (cookie de connexion passé en en-tête : l'API refuse le cookie seul sans Origin)
    const auth = async () => ({ Authorization: `JWT ${(await context.cookies()).find((c) => c.name === 'payload-token')?.value}` })
    const preference = async (method: 'POST' | 'DELETE') =>
      page.request.fetch('/api/payload-preferences/nav', { method, headers: await auth(), data: method === 'POST' ? { value: { open: true } } : undefined })
    try {
      await login(page, ADMIN)
      // menu laissé ouvert sur un ordinateur (préférence de Payload) : sur téléphone, il ne s'ouvre pas tout seul
      expect((await preference('POST')).ok()).toBe(true)

      // HTML du serveur, avant l'hydratation (sans JavaScript, il ne change jamais) : il arrive menu ouvert, mais tant
      // que le menu reste masqué, ni voile sur la page ni défilement bloqué
      const noScript = await mobileContext(browser, { javaScriptEnabled: false })
      try {
        await noScript.addCookies(await context.cookies())
        const raw = await noScript.newPage()
        await raw.goto('/admin')
        await expect(raw.locator('.template-default')).toHaveClass(/template-default--nav-open/)
        await expect(raw.locator('.template-default')).not.toHaveClass(/template-default--nav-hydrated/)
        const beforeHydration = await raw.evaluate(() => ({
          veil: getComputedStyle(document.querySelector('.template-default__wrap')!, '::before').opacity,
          scroll: getComputedStyle(document.body).overflowY,
        }))
        expect(beforeHydration.veil, 'voile avant l’hydratation').toBe('0')
        expect(beforeHydration.scroll, 'défilement avant l’hydratation').not.toBe('hidden')
      } finally {
        await noScript.close()
      }

      await page.goto('/admin')
      await expect(page.locator('.template-default--nav-hydrated')).toBeAttached()
      await expectClosed()

      // tableau de bord : pleine largeur, boutons et cartes à la largeur de l'écran, aucun libellé coupé mot par mot
      await expect(page.getByRole('heading', { level: 1, name: /^Bon(jour|soir)/ })).toBeVisible()
      await expectFitsScreen(page, width)
      expect((await textLines(page, '.sw-dash__links .sw-btn')).map((t) => t.lines)).toEqual([1, 1])
      // (le grand titre « Bonjour Prénom » n'est pas compté : deux mots, dont un prénom de longueur quelconque)
      await expectNoWordPerLine(page, '.sw-dash__h2, .sw-dash__lead, .sw-action__text > *, .sw-tile__text > *, .sw-status__text > *')
      const gutter = await page.locator('.sw-dash').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
      for (const card of await page.locator('.sw-action').all()) {
        expect((await card.boundingBox())!.width).toBeGreaterThanOrEqual(width - 2 * gutter - 1)
      }

      // menu ouvert : il recouvre l'écran (fond opaque), le contenu derrière garde toute sa largeur
      await openNav(page, toggler)
      const layout = await navLayout(page)
      expect(layout).toMatchObject({ open: true, onTop: true, innerWidth: width, nav: { x: 0 }, content: { x: 0, width } })
      expect(layout.nav.width).toBeGreaterThanOrEqual(width * 0.9)
      expect(layout.background).toMatch(/^rgb\(/)
      await expectFitsScreen(page, width)

      // fermeture : la croix, puis Échap, puis un lien du menu (navigation)
      await page.locator('.nav__mobile-close').click()
      await expectClosed()
      // ouvert au clavier : le focus entre dans le menu et le contenu derrière (en-tête, page) est inerte, si bien que
      // Tab ne mène jamais à la page cachée ; le contenu lui-même ne l'est pas (son voile reste touchable)
      const behind = page.locator('.template-default__wrap > *')
      const focusIn = (selector: string) => page.evaluate((s) => Boolean(document.activeElement?.closest(s)), selector)
      await page.locator(toggler).focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('aside.nav')).toHaveClass(/nav--nav-open/)
      await expect.poll(() => focusIn('aside.nav'), 'focus dans le menu').toBe(true)
      expect(await behind.count()).toBeGreaterThan(0)
      for (const el of await behind.all()) await expect(el).toHaveAttribute('inert', '')
      await expect(page.locator('.template-default__wrap')).not.toHaveAttribute('inert')
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab')
        expect(await focusIn('.template-default__wrap'), `Tab n°${i + 1} : focus dans la page cachée`).toBe(false)
      }
      // Échap libère le contenu et le focus revient au bouton du menu affiché (celui de l'en-tête sur téléphone)
      await page.keyboard.press('Escape')
      await expectClosed()
      await expect(page.locator('.template-default__wrap > [inert]')).toHaveCount(0)
      await expect(page.locator(toggler)).toBeFocused()
      await openNav(page, toggler)
      await page.locator('aside.nav').getByRole('link', { name: 'Vidéos', exact: true }).click()
      await expectClosed()
      await expect(page).toHaveURL(/\/admin\/collections\/videos/)
      await expect(page.locator('.template-default__wrap > [inert]')).toHaveCount(0)
      await expectFitsScreen(page, width)

      // fiche d'une vidéo : formulaire à la largeur de l'écran, menu ouvert compris
      const videos = (await (await page.request.get('/api/videos?limit=1&depth=0&draft=true', { headers: await auth() })).json()) as { docs: { id: number }[] }
      test.skip(!videos.docs.length, 'aucune vidéo (lancez npm run seed)')
      await page.goto(`/admin/collections/videos/${videos.docs[0].id}`)
      await expect(page.getByText('Où se trouve la vidéo ?')).toBeVisible()
      await expectClosed()
      await expectFitsScreen(page, width)
      await openNav(page, toggler)
      expect(await navLayout(page)).toMatchObject({ onTop: true, innerWidth: width, content: { x: 0, width } })
      await expectFitsScreen(page, width)
      expect(errors, errors.join('\n')).toEqual([])
    } finally {
      await preference('DELETE').catch(() => undefined)
      await context.close()
    }
  })

  test('tablette : le menu s’ouvre en tiroir sur un voile, sans pousser le contenu, et se referme au toucher du voile', async ({ browser }) => {
    test.setTimeout(120_000)
    const context = await mobileContext(browser, { viewport: { width: 820, height: 1180 } })
    const page = await context.newPage()
    const errors = watchErrors(page)
    const nav = page.locator('aside.nav')
    try {
      await login(page, ADMIN)
      await expect(page.locator('.template-default--nav-hydrated')).toBeAttached()
      await expect(nav).not.toHaveClass(/nav--nav-open/)

      await openNav(page, '.template-default__nav-toggler')
      const layout = await navLayout(page)
      expect(layout).toMatchObject({ onTop: true, innerWidth: 820, nav: { x: 0, width: 320 }, content: { x: 0, width: 820 } })
      await expectFitsScreen(page, 820)

      // toucher le voile, à droite du tiroir, referme le menu sans rien activer derrière
      await page.mouse.click(700, 600)
      await expect(nav).not.toHaveClass(/nav--nav-open/)
      await expect(page).toHaveURL(/\/admin$/)

      // un lien du menu le referme aussi (Payload ne le fait lui-même que sous 768 px)
      await openNav(page, '.template-default__nav-toggler')
      await nav.getByRole('link', { name: 'L’Info', exact: true }).click()
      await expect(page).toHaveURL(/\/admin\/collections\/articles/)
      await expect(nav).not.toHaveClass(/nav--nav-open/)
      expect(errors, errors.join('\n')).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('ordinateur : le menu ouvert reste à côté du contenu, sans voile ni contenu inerte', async ({ page }) => {
    const nav = page.locator('aside.nav')
    const behindState = () =>
      page.evaluate(() => ({
        inert: document.querySelectorAll('.template-default__wrap > [inert]').length,
        veil: getComputedStyle(document.querySelector('.template-default__wrap')!, '::before').opacity,
        scroll: getComputedStyle(document.body).overflowY,
      }))
    await login(page, ADMIN)
    for (const width of [1280, 1600]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/admin')
      await expect(page.locator('.template-default--nav-hydrated')).toBeAttached()
      if (!(await nav.evaluate((el) => el.classList.contains('nav--nav-open')))) await page.locator('.template-default__nav-toggler').click()
      await expect(nav).toHaveClass(/nav--nav-open/)
      expect(await behindState(), `${width} px`).toEqual({ inert: 0, veil: '0', scroll: expect.not.stringMatching(/^hidden$/) })
    }

    // menu ouvert sur un écran étroit (contenu inerte), puis fenêtre agrandie : le contenu est aussitôt libéré
    await page.setViewportSize({ width: 390, height: 844 })
    await openNav(page, '.app-header__mobile-nav-toggler')
    await expect(page.locator('.template-default__wrap > [inert]')).not.toHaveCount(0)
    await page.setViewportSize({ width: 1600, height: 900 })
    await expect.poll(behindState).toEqual({ inert: 0, veil: '0', scroll: expect.not.stringMatching(/^hidden$/) })
  })
})
