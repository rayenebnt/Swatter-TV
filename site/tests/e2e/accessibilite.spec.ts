import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { atParisTime, firstDoc } from './helpers'
import { AdminApi, deleteMember, mobileContext, signupMember, unique } from './outils-contenus'

/**
 * Accessibilité : audit axe-core (règles WCAG 2.0 et 2.1, niveaux A et AA) des pages principales, en bureau et sur
 * mobile, puis des états ouverts (bandeau cookies déplié, recherche, menu mobile, fiche d'une émission, formulaires en
 * erreur, « Mon espace » d'un membre). Aucune violation « critical » ni « serious » n'est admise, et aucune règle n'est
 * désactivée : le message d'échec liste chaque violation (règle, éléments en cause, explication d'axe).
 *
 * Les pages sont auditées comme à la première visite (bandeau cookies affiché, il fait partie de l'audit), avec les
 * animations coupées (prefers-reduced-motion) : les éléments révélés au défilement sont alors visibles d'emblée, sans
 * fondu en cours qui fausserait la mesure des contrastes ou les ferait ignorer.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } })

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const SERIOUS = new Set(['critical', 'serious'])
const MAX_NODES = 10

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number]

/** Violations graves, une ligne par règle puis une ligne par élément (sélecteur, extrait HTML, explication). */
function report(label: string, violations: Violation[]): string {
  const lines = [`${violations.length} violation(s) grave(s) d’accessibilité — ${label} :`]
  for (const v of violations) {
    lines.push(`• [${v.impact}] ${v.id} : ${v.help} — ${v.nodes.length} élément(s) — ${v.helpUrl}`)
    for (const node of v.nodes.slice(0, MAX_NODES)) {
      lines.push(`    - ${node.target.join(' ')} : ${node.html.replace(/\s+/g, ' ').slice(0, 160)}`)
      const why = (node.failureSummary ?? '')
        .split('\n')
        .slice(1)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ; ')
      if (why) lines.push(`      ${why.slice(0, 300)}`)
    }
    if (v.nodes.length > MAX_NODES) lines.push(`    - … et ${v.nodes.length - MAX_NODES} autre(s) élément(s)`)
  }
  return lines.join('\n')
}

/**
 * Audit axe-core de la page : aucune violation critique ni sérieuse. Vérification « souple » : un test qui audite
 * plusieurs pages ou plusieurs états continue et liste tous les défauts trouvés.
 */
async function expectAccessible(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze()
  const serious = violations.filter((v) => SERIOUS.has(v.impact ?? ''))
  expect
    .soft(
      serious.map((v) => `${v.id} (${v.nodes.length})`),
      report(label, serious),
    )
    .toEqual([])
}

/**
 * Page prête : chargée et hydratée (Effects retire la classe « no-js »). Sans choix de cookies enregistré (première
 * visite), le bandeau s'affiche au bout de 1,4 s : on l'attend, il fait partie de l'audit.
 */
async function ready(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForFunction(() => !document.documentElement.classList.contains('no-js'))
  const choice = await page.evaluate(() => window.localStorage.getItem('swatter-consent'))
  if (!choice) await expect(page.getByRole('dialog', { name: 'Vos choix cookies' })).toBeVisible({ timeout: 15_000 })
}

/** Vidéo de la médiathèque (clip du jeu d'essai), utilisée comme aperçu animé ; null sans vidéo. */
async function clipId(admin: AdminApi): Promise<number | null> {
  const res = await admin.send('GET', '/api/media?limit=1&depth=0&where[filename][like]=direct-mont-blanc&where[mimeType][contains]=video%2F')
  return ((await res.json()) as { docs: { id: number }[] }).docs[0]?.id ?? null
}

/** Bouton pause / relance de l'aperçu d'une fiche. */
const PREVIEW_TOGGLE = /^(Mettre l’aperçu en pause|Relancer l’aperçu)$/

/** Refus des cookies (bouton du bandeau) : le bandeau ne cache plus le bas de la page. */
async function refuseCookies(page: Page) {
  const banner = page.getByRole('dialog', { name: 'Vos choix cookies' })
  await banner.getByRole('button', { name: 'Refuser' }).click()
  await expect(banner).toBeHidden()
}

/** `clock` : heure de Paris du navigateur (« HH:MM ») des pages qui changent avec l'antenne (18 h – 0 h 30). */
type Target = { name: string; path: string | ((request: APIRequestContext) => Promise<string | null>); status?: number; clock?: string }

type Slugged = { slug?: string | null; department?: string | null }

/** Adresse de la page de détail du premier document publié d'une collection (null sans contenu). */
const detail = (collection: string, url: (d: Slugged) => string) => async (request: APIRequestContext) => {
  const doc = await firstDoc(request, collection)
  return doc?.slug ? url(doc) : null
}

const PAGES: Target[] = [
  { name: 'accueil (à l’antenne, 21 h)', path: '/', clock: '21:00' },
  { name: 'accueil (hors antenne, 10 h)', path: '/', clock: '10:00' },
  { name: 'direct (à l’antenne, 21 h)', path: '/direct', clock: '21:00' },
  { name: 'direct (hors antenne, 10 h)', path: '/direct', clock: '10:00' },
  { name: 'vidéos', path: '/videos' },
  { name: 'info', path: '/info' },
  { name: 'info d’un département', path: '/info/haute-savoie' },
  { name: 'un article', path: detail('articles', (d) => `/info/${d.department}/${d.slug}`) },
  { name: 'météo', path: '/meteo' },
  { name: 'météo d’un département', path: '/meteo/isere' },
  { name: 'programme TV', path: '/programme-tv' },
  { name: 'agenda', path: '/agenda' },
  { name: 'un événement', path: detail('events', (d) => `/agenda/${d.slug}`) },
  { name: 'webcams', path: '/webcams' },
  { name: 'webcams d’un département', path: '/webcams/savoie' },
  { name: 'replay', path: '/replay' },
  { name: 'un replay', path: detail('replays', (d) => `/replay/${d.slug}`) },
  { name: 'recherche', path: '/recherche?q=annecy' },
  { name: 'contact', path: '/contact' },
  { name: 'connexion', path: '/connexion' },
  { name: 'inscription', path: '/inscription' },
  { name: 'mot de passe oublié', path: '/mot-de-passe-oublie' },
  { name: 'page éditoriale', path: '/mentions-legales' },
  { name: 'page introuvable (404)', path: '/cette-page-n-existe-pas-42', status: 404 },
]

test.describe('accessibilité des pages principales', () => {
  for (const { name, path, status = 200, clock } of PAGES) {
    test(`${name} : aucune violation grave (WCAG 2.1 A et AA)`, async ({ page, request }) => {
      const url = typeof path === 'string' ? path : await path(request)
      test.skip(!url, `aucun contenu pour « ${name} » (lancez npm run seed)`)
      if (clock) await atParisTime(page, clock)
      const response = await page.goto(url!)
      expect(response?.status(), `statut de ${url}`).toBe(status)
      await ready(page)
      await expectAccessible(page, `${name} (${url})`)
    })
  }
})

test.describe('accessibilité des états ouverts', () => {
  test('bandeau cookies : panneau « Personnaliser » déplié', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const banner = page.getByRole('dialog', { name: 'Vos choix cookies' })
    await banner.getByRole('button', { name: 'Personnaliser' }).click()
    await expect(banner.getByRole('switch', { name: 'Contenus externes' })).toBeVisible()
    await expectAccessible(page, 'bandeau cookies déplié (/)')
  })

  test('recherche instantanée ouverte : accès rapide puis résultats', async ({ page, isMobile }) => {
    await page.goto('/')
    await ready(page)
    await refuseCookies(page)
    const dialog = page.getByRole('dialog', { name: 'Recherche' })
    // ouverture : bouton de l'en-tête sur mobile, touche « / » sur ordinateur (active après l'hydratation)
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        if (isMobile) await page.locator('[data-open-search]').filter({ visible: true }).first().click()
        else await page.keyboard.press('/')
      }
      await expect(dialog).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    await expect(dialog.getByRole('option').first()).toBeVisible()
    await expectAccessible(page, 'recherche ouverte, accès rapide (/)')
    await dialog.getByRole('combobox', { name: /rechercher/i }).fill('annecy')
    await expect(dialog.getByRole('option', { name: /voir tous les résultats/i })).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('ArrowDown')
    await expect(dialog.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    await expectAccessible(page, 'recherche ouverte, résultats pour « annecy » (/)')
  })

  test('menu mobile ouvert', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'menu des écrans étroits')
    await page.goto('/')
    await ready(page)
    await refuseCookies(page)
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await expect(async () => {
      if (!(await drawer.isVisible())) await page.getByRole('button', { name: 'Ouvrir le menu' }).filter({ visible: true }).first().click()
      await expect(drawer).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    await expectAccessible(page, 'menu mobile ouvert (/)')
  })

  test('programme TV : fiche d’une émission ouverte', async ({ page }) => {
    await page.goto('/programme-tv')
    await ready(page)
    await refuseCookies(page)
    const block = page.locator('.tvgrid__list .blk[tabindex="0"]')
    test.skip((await block.count()) === 0, 'aucun programme publié (lancez npm run seed)')
    await block.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('dialog.tvd[open]')).toBeVisible()
    await expectAccessible(page, 'fiche d’une émission (/programme-tv)')
  })

  test('formulaires envoyés vides : erreurs affichées', async ({ page }) => {
    await page.goto('/contact')
    await ready(page)
    // bandeau refusé d'abord : il couvrirait le bouton d'envoi en bas de l'écran (choix gardé pour les pages suivantes)
    await refuseCookies(page)
    await page.getByRole('button', { name: 'Envoyer à la rédaction' }).click()
    await expect(page.locator('.contact-err').first()).toBeVisible()
    await expectAccessible(page, 'formulaire « Proposer une info » en erreur (/contact)')

    await page.goto('/inscription')
    await ready(page)
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByLabel('Prénom')).toHaveAttribute('aria-invalid', 'true')
    await expectAccessible(page, 'formulaire d’inscription en erreur (/inscription)')

    await page.goto('/connexion')
    await ready(page)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('textbox', { name: 'E-mail', exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expectAccessible(page, 'formulaire de connexion en erreur (/connexion)')
  })

  test('« Mon espace » d’un membre connecté', async ({ page }) => {
    const { password } = await signupMember(page.request, 'Dominique')
    try {
      for (const path of ['/compte', '/compte/ma-liste', '/compte/historique', '/compte/profil']) {
        const response = await page.goto(path)
        expect(response?.status(), `statut de ${path}`).toBe(200)
        await expect(page).toHaveURL(new RegExp(`${path}$`))
        await ready(page)
        await expectAccessible(page, `« Mon espace » (${path})`)
      }
    } finally {
      await deleteMember(page.request, password)
    }
  })
})

test.describe('accessibilité de la page d’une vidéo (vidéo YouTube créée pour le test)', () => {
  // connexion administrateur : un seul projet ; l'affichage mobile est audité dans un second contexte
  test.skip(({ isMobile }) => isMobile, 'audit mobile fait par le test du projet « bureau » (une seule connexion administrateur)')
  test.describe.configure({ mode: 'serial' })

  let admin: AdminApi | null = null
  test.beforeAll(async () => {
    admin = await AdminApi.open()
    test.skip(!admin, 'identifiants administrateur indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
  })
  test.afterAll(async () => {
    await admin?.dispose()
  })

  test('une vidéo : aucune violation grave, en bureau et sur mobile', async ({ page, browser }) => {
    const video = await admin!.createYoutubeVideo(`Test e2e accessibilité ${unique('video')}`)
    const path = `/videos/${video.slug}`
    try {
      // aperçu animé derrière le bouton de lecture (clip du jeu d'essai), s'il y a une vidéo dans la médiathèque
      const clip = await clipId(admin!)
      if (clip) expect((await admin!.send('PATCH', `/api/videos/${video.id}?depth=0`, { _status: 'published', preview: clip })).ok(), 'aperçu de la vidéo').toBe(true)
      /** « Réduire les animations » : l'aperçu ne démarre pas (rien de demandé) et n'a donc pas de bouton pause. */
      const expectStill = async (p: Page) => {
        if (!clip) return
        const preview = p.locator('.vp video.vprev')
        await expect(preview).toHaveCount(1)
        await p.waitForTimeout(1_000)
        expect(await preview.getAttribute('src'), 'aperçu non lancé').toBeNull()
        await expect(p.getByRole('button', { name: PREVIEW_TOGGLE })).toHaveCount(0)
      }

      expect((await page.goto(path))?.status()).toBe(200)
      await ready(page)
      await expect(page.getByRole('button', { name: /lire la vidéo/i })).toBeVisible()
      await expectStill(page)
      await expectAccessible(page, `une vidéo, bureau (${path})`)

      const mobile = await mobileContext(browser, { reducedMotion: 'reduce' })
      try {
        const phone = await mobile.newPage()
        expect((await phone.goto(path))?.status()).toBe(200)
        await ready(phone)
        await expect(phone.getByRole('button', { name: /lire la vidéo/i })).toBeVisible()
        await expectStill(phone)
        await expectAccessible(phone, `une vidéo, mobile (${path})`)
      } finally {
        await mobile.close()
      }
    } finally {
      await admin!.remove('videos', video.id)
    }
  })
})
