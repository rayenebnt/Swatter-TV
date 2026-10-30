import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { firstDoc, linksMatching, settle, watchErrors } from './helpers'
import { AdminApi, deleteMember, mobileContext, presetConsent, recordThirdParty, signupMember, SITE, unique } from './outils-contenus'

/**
 * Parcours de visiteurs que rubriques.spec.ts et interactions.spec.ts ne couvrent pas : météo (département, jour au
 * clavier), fiche d'une émission du programme TV au clavier, recherche au clavier, filtres et pages de l'agenda et de
 * l'info, lecteur vidéo et consentement (rien n'est chargé depuis YouTube avant l'accord ou le clic), plein écran des
 * webcams, « Ma liste » d'un membre, refus des cookies.
 *
 * Les parcours qui ont besoin de contenus précis (vidéo YouTube, webcams en direct, plus de 24 événements ou de 21
 * articles pour avoir une deuxième page) les créent par l'API (compte administrateur, groupe en série, projet « bureau »
 * seulement, avec un second contexte aux réglages mobiles quand l'affichage diffère), puis les suppriment. Leurs titres
 * commencent par « Test e2e » : les autres parcours les écartent de leurs comparaisons.
 */

/** Groupe en série qui se connecte une fois en administrateur et supprime à la fin tout ce qu'il a créé. */
function withAdmin(title: string, body: (admin: () => AdminApi) => void) {
  test.describe(title, () => {
    test.skip(({ isMobile }) => isMobile, 'connexion administrateur : projet « bureau » seulement (l’affichage mobile est vérifié dans un second contexte)')
    test.describe.configure({ mode: 'serial' })
    let admin: AdminApi | null = null
    test.beforeAll(async () => {
      admin = await AdminApi.open()
      test.skip(!admin, 'identifiants administrateur indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
    })
    test.afterAll(async () => {
      await admin?.dispose()
    })
    body(() => admin!)
  })
}

/**
 * Titre de l'onglet de la page affichée après une navigation dans le navigateur (lien de filtre ou de page) : c'est lui
 * que reprennent l'historique et les favoris, et que l'annonce de changement de page lit aux lecteurs d'écran
 * (WCAG 2.4.2). Vérification « souple » : le parcours continue et tous les écarts sont listés.
 */
async function expectTabTitle(page: Page, expected: string | RegExp, step: string) {
  await expect.soft(page, `titre de l’onglet après la navigation : ${step}`).toHaveTitle(expected, { timeout: 3_000 })
}

const isTestContent = (title?: string | null) => Boolean(title?.startsWith('Test e2e'))
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const banner = (page: Page) => page.getByRole('dialog', { name: 'Vos choix cookies' })
/** Choix de cookies enregistré dans le navigateur (null sans choix). */
const storedConsent = async (page: Page) =>
  JSON.parse((await page.evaluate(() => window.localStorage.getItem('swatter-consent'))) ?? 'null') as Record<string, unknown> | null

/* ----- Météo ----- */

test.describe('météo', () => {
  test('choix d’un département dans le filtre : prévisions détaillées de sa ville, puis retour à toute la région', async ({ page }) => {
    const errors = watchErrors(page)
    await presetConsent(page.context())
    await page.goto('/meteo')
    await settle(page)
    const filter = page.getByRole('navigation', { name: 'La météo par département' })
    await expect(filter.getByRole('link', { name: 'Toute la région' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('main .now__city').first()).toHaveText('Annecy')

    await filter.getByRole('link', { name: 'Savoie', exact: true }).click()
    await page.waitForURL(/\/meteo\/savoie$/)
    await expect(page.locator('h1')).toHaveText('La Météo en Savoie')
    await expectTabTitle(page, 'La météo en Savoie — Swatter TV Info', 'département « Savoie »')
    await expect(filter.locator('[aria-current="page"]')).toHaveText('Savoie')
    await expect(page.locator('main .now__city').first()).toHaveText('Chambéry')
    await expect(page.locator('main .city-card a[aria-current="page"]')).toHaveAccessibleName('Météo détaillée à Chambéry')

    await filter.getByRole('link', { name: 'Toute la région' }).click()
    await page.waitForURL(/\/meteo$/)
    await expect(page.locator('main .now__city').first()).toHaveText('Annecy')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('choix d’un jour : clic, puis flèches, Début et Fin ; le panneau suit le jour choisi', async ({ page }) => {
    const errors = watchErrors(page)
    await presetConsent(page.context())
    await page.goto('/meteo/isere')
    await settle(page)
    const tabs = page.getByRole('main').getByRole('tablist', { name: 'Jour' }).getByRole('tab')
    const panel = page.getByRole('main').getByRole('tabpanel')
    const count = await tabs.count()
    test.skip(count < 3, 'prévisions de moins de trois jours')
    const temps = (text: string) => text.match(/-?\d+\s?°/g)?.map((t) => t.replace(/\s/g, '')) ?? []

    /** Le jour n° i est choisi : seul onglet sélectionné et tabulable, panneau relié, mêmes minimales et maximales. */
    const expectDay = async (i: number) => {
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true')
      await expect(tabs.nth(i)).toHaveAttribute('tabindex', '0')
      await expect(page.getByRole('main').getByRole('tab', { selected: true })).toHaveCount(1)
      await expect(panel).toHaveAttribute('aria-labelledby', (await tabs.nth(i).getAttribute('id'))!)
      const expected = temps(await tabs.nth(i).locator('.meteo-day__mm').innerText())
      const shown = async () => temps(await panel.locator('.now__mm').first().innerText())
      await expect.poll(shown, { message: `températures du jour n° ${i + 1}` }).toEqual(expected)
    }

    await expectDay(0)
    await tabs.nth(1).click()
    await expectDay(1)
    // au clavier : le focus suit le jour choisi
    await page.keyboard.press('ArrowRight')
    await expectDay(2)
    await expect(tabs.nth(2)).toBeFocused()
    await page.keyboard.press('End')
    await expectDay(count - 1)
    await expect(tabs.nth(count - 1)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expectDay(0)
    await expect(tabs.nth(0)).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expectDay(count - 1)
    await page.keyboard.press('Home')
    await expectDay(0)
    await expect(tabs.nth(0)).toBeFocused()
    expect(errors, errors.join('\n')).toEqual([])
  })
})

/* ----- Programme TV ----- */

test.describe('programme TV', () => {
  test('fiche d’une émission ouverte et fermée au clavier, focus rendu à l’émission', async ({ page }) => {
    const errors = watchErrors(page)
    await presetConsent(page.context())
    await page.goto('/programme-tv')
    await settle(page)
    const blocks = page.locator('.tvgrid__list .blk')
    test.skip((await blocks.count()) < 3, 'grille du jour presque vide (lancez npm run seed)')

    // un seul arrêt de tabulation dans la frise ; flèches, Début et Fin passent d'une émission à l'autre
    await expect(page.locator('.tvgrid__list .blk[tabindex="0"]')).toHaveCount(1)
    await page.locator('.tvgrid__list .blk[tabindex="0"]').focus()
    await page.keyboard.press('Home')
    await expect(blocks.first()).toBeFocused()
    await page.keyboard.press('End')
    await expect(blocks.last()).toBeFocused()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    const target = blocks.nth(1)
    await expect(target).toBeFocused()
    await expect(page.locator('.tvgrid__list .blk[tabindex="0"]')).toHaveAttribute('data-id', (await target.getAttribute('data-id'))!)
    const title = (await target.locator('strong').innerText()).trim()

    // Entrée : fiche (dialogue modal nommé par le titre), focus sur « Fermer », page verrouillée
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: title, exact: true })
    const close = dialog.getByRole('button', { name: 'Fermer le détail de l’émission' })
    await expect(dialog).toBeVisible()
    await expect(close).toBeFocused()
    await expect(dialog.locator('time').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    // Tab ne ramène jamais le focus sur la page derrière la fiche
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(() => {
        const active = document.activeElement
        return !active || active === document.body || Boolean(active.closest('dialog[open]'))
      })
      expect(inside, 'focus gardé dans la fiche').toBe(true)
    }
    // Échap : fiche fermée, focus rendu à l'émission, défilement rétabli
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(target).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')

    // Espace : rouverte ; Entrée sur « Fermer » : refermée, focus rendu
    await page.keyboard.press(' ')
    await expect(dialog).toBeVisible()
    await expect(close).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(target).toBeFocused()
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('lien vers une émission (#adresse) : sa fiche s’ouvre ; fermée par Échap, l’ancre quitte l’adresse', async ({ page, request }) => {
    const errors = watchErrors(page)
    const now = new Date().toISOString()
    const res = await request.get(`/api/schedule?limit=1&depth=1&sort=startsAt&where[startsAt][greater_than_equal]=${now}`)
    const next = ((await res.json()) as { docs: { program?: { slug?: string | null } | number | null }[] }).docs[0]
    const slug = next && typeof next.program === 'object' ? next.program?.slug : null
    test.skip(!slug, 'aucune émission programmée (lancez npm run seed)')
    await presetConsent(page.context())
    await page.goto(`/programme-tv#${slug}`)
    await settle(page)
    const dialog = page.locator('dialog.tvd[open]')
    await expect(dialog).toBeVisible()
    const title = (await dialog.locator('h2').innerText()).trim()
    await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // l'ancre quitte l'adresse ; une émission d'un autre jour (la prochaine, après minuit…) a ouvert la grille de ce jour
    await expect(page).toHaveURL(/\/programme-tv(\?jour=\d{4}-\d{2}-\d{2})?$/)
    // le focus revient sur l'émission dans la grille
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(new RegExp(`^${escapeRegExp(title)}, `))
    expect(errors, errors.join('\n')).toEqual([])
  })
})

/* ----- Recherche ----- */

test.describe('recherche', () => {
  /** Recherche ouverte : touche « / » sur ordinateur, bouton de l'en-tête sur mobile (actifs après l'hydratation). */
  async function openSearch(page: Page, isMobile: boolean) {
    const dialog = page.getByRole('dialog', { name: 'Recherche' })
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        if (isMobile) await page.locator('[data-open-search]').filter({ visible: true }).first().click()
        else await page.keyboard.press('/')
      }
      await expect(dialog).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    return dialog
  }

  test('flèches dans les résultats (option active annoncée, retour au début), Entrée ouvre la page choisie', async ({ page, request, isMobile }) => {
    const errors = watchErrors(page)
    type Hit = { title: string; href: string }
    const { hits } = (await (await request.get('/api/search?q=annecy')).json()) as { hits: Hit[] }
    test.skip(hits.length < 2, 'moins de deux résultats pour « annecy » (lancez npm run seed)')
    await presetConsent(page.context())
    await page.goto('/')
    await settle(page)

    const dialog = await openSearch(page, isMobile)
    const input = dialog.getByRole('combobox', { name: 'Rechercher sur Swatter TV Info' })
    await expect(input).toBeFocused()
    await input.fill('annecy')
    const options = dialog.getByRole('option')
    // les résultats, puis « Voir tous les résultats »
    await expect(options).toHaveCount(hits.length + 1, { timeout: 15_000 })
    for (const [i, hit] of hits.entries()) await expect(options.nth(i)).toContainText(hit.title)
    await expect(options.last()).toContainText(/Voir tous les résultats pour/)
    await expect(input).toHaveAttribute('aria-expanded', 'true')
    await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/)

    /** L'option n° i est la seule active, annoncée par le champ, qui garde le focus. */
    const expectActive = async (i: number) => {
      await expect(options.nth(i)).toHaveAttribute('aria-selected', 'true')
      await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveCount(1)
      await expect(input).toHaveAttribute('aria-activedescendant', (await options.nth(i).getAttribute('id'))!)
      await expect(input).toBeFocused()
    }
    await page.keyboard.press('ArrowDown')
    await expectActive(0)
    await page.keyboard.press('ArrowDown')
    await expectActive(1)
    await page.keyboard.press('ArrowUp')
    await expectActive(0)
    await page.keyboard.press('ArrowUp')
    await expectActive(hits.length)
    await page.keyboard.press('ArrowDown')
    await expectActive(0)
    await page.keyboard.press('ArrowDown')
    await expectActive(1)

    // Entrée : la page du résultat actif, recherche fermée
    await page.keyboard.press('Enter')
    await page.waitForURL(new URL(hits[1].href, SITE).toString())
    await expect(dialog).toBeHidden()
    await expect(page.locator('h1')).toContainText(hits[1].title)

    // Entrée sans option active : la page de tous les résultats
    const again = await openSearch(page, isMobile)
    const field = again.getByRole('combobox', { name: 'Rechercher sur Swatter TV Info' })
    await field.fill('')
    await field.fill('annecy')
    await expect(again.getByRole('option')).toHaveCount(hits.length + 1, { timeout: 15_000 })
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/recherche\?q=annecy$/)
    await expect(page.locator('h1')).toContainText('annecy')
    expect(errors, errors.join('\n')).toEqual([])
  })
})

/* ----- Agenda ----- */

type ApiEvent = { title: string; slug: string; startDate: string; endDate?: string | null; category?: string | null; department: string }

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Jour civil de Paris (AAAA-MM-JJ). */
const parisDay = (t: number) => PARIS_DAY.format(new Date(t))
/** Instant de minuit, heure de Paris (UTC+1 l'hiver, UTC+2 l'été), du jour AAAA-MM-JJ. */
function parisMidnight(day: string): number {
  const utc = Date.parse(`${day}T00:00:00Z`)
  for (const hours of [2, 1]) {
    const t = utc - hours * 3_600_000
    if (parisDay(t) === day && parisDay(t - 1) !== day) return t
  }
  throw new Error(`minuit introuvable pour ${day}`)
}
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const PERIODS = [
  { value: 'week-end', label: 'Ce week-end' },
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'mois', label: 'Ce mois-ci' },
] as const
type Period = (typeof PERIODS)[number]['value']

/**
 * Bornes d'une période (début inclus, fin exclue), règle de la page Agenda : week-end = samedi et dimanche (celui en
 * cours le week-end) ; semaine = jusqu'au dimanche soir ; mois = jusqu'à la fin du mois.
 */
function periodRange(period: Period, now = Date.now()): { from: number; to: number } {
  const today = parisDay(now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  let first = today
  let end: string
  if (period === 'week-end') {
    first = weekday === 0 ? addDays(today, -1) : addDays(today, 6 - weekday)
    end = addDays(first, 2)
  } else if (period === 'semaine') {
    end = addDays(today, weekday === 0 ? 1 : 8 - weekday)
  } else {
    const [y, m] = today.split('-').map(Number)
    end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  }
  return { from: parisMidnight(first), to: parisMidnight(end) }
}

/** À venir ou en cours : fin pas encore passée, ou (sans fin) début aujourd'hui ou plus tard. */
const isUpcoming = (e: ApiEvent, now = Date.now()) => (e.endDate ? Date.parse(e.endDate) >= now : Date.parse(e.startDate) >= parisMidnight(parisDay(now)))
const inPeriod = (e: ApiEvent, period: Period) => {
  const { from, to } = periodRange(period)
  const start = Date.parse(e.startDate)
  return start < to && (e.endDate ? Date.parse(e.endDate) >= from : start >= from)
}

async function upcomingEvents(request: APIRequestContext): Promise<ApiEvent[]> {
  const { docs } = (await (await request.get('/api/events?limit=500&depth=0&sort=startDate')).json()) as { docs: ApiEvent[] }
  return docs.filter((e) => isUpcoming(e))
}

/** Adresses des événements de la liste (cartes de la grille). */
const listedEvents = async (page: Page) =>
  [...new Set(await page.locator('main .agenda-grid a[href^="/agenda/"]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? '')))].sort()
const eventPaths = (events: ApiEvent[]) => events.map((e) => `/agenda/${e.slug}`).sort()

test.describe('agenda', () => {
  test('filtres par catégorie, par département et par période, combinables et partageables', async ({ page, request }) => {
    const events = (await upcomingEvents(request)).filter((e) => !isTestContent(e.title) && e.category)
    test.skip(!events.length, 'aucun événement à venir (lancez npm run seed)')
    const errors = watchErrors(page)
    const { category, department } = events[0]
    await presetConsent(page.context())
    await page.goto('/agenda')
    await settle(page)
    const byCategory = page.getByRole('navigation', { name: 'Filtrer par catégorie' })
    const byPeriod = page.getByRole('navigation', { name: 'Filtrer par période' })
    const byDepartment = page.getByRole('navigation', { name: 'L’agenda par département' })
    await expect(byCategory.getByRole('link', { name: 'Toutes les catégories' })).toHaveAttribute('aria-current', 'page')
    await expect(byPeriod.getByRole('link', { name: 'Toutes les dates' })).toHaveAttribute('aria-current', 'page')

    // catégorie
    const categoryLink = byCategory.locator(`a[href="/agenda?categorie=${category}"]`)
    const label = (await categoryLink.innerText()).trim()
    await categoryLink.click()
    await page.waitForURL(`**/agenda?categorie=${category}`)
    await expect(categoryLink).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('h1')).toHaveText(new RegExp(`^Agenda «\\s${escapeRegExp(label)}\\s»$`))
    await expect.poll(() => listedEvents(page)).toEqual(eventPaths(events.filter((e) => e.category === category)))
    await expectTabTitle(page, new RegExp(`^Agenda «\\s${escapeRegExp(label)}\\s» en Auvergne-Rhône-Alpes — Swatter TV Info$`), `catégorie « ${label} »`)

    // département : la catégorie choisie est conservée
    const departmentLink = byDepartment.locator(`a[href="/agenda?departement=${department}&categorie=${category}"]`)
    await departmentLink.click()
    await page.waitForURL(`**/agenda?departement=${department}&categorie=${category}`)
    await expect(departmentLink).toHaveAttribute('aria-current', 'page')
    const chosen = events.filter((e) => e.category === category && e.department === department)
    await expect.poll(() => listedEvents(page)).toEqual(eventPaths(chosen))
    const heading = (await page.locator('h1').innerText()).trim()
    await expectTabTitle(page, `${heading} — Swatter TV Info`, `département et catégorie (${heading})`)

    // périodes : catégorie et département conservés
    for (const { value, label: periodLabel } of PERIODS) {
      const periodLink = byPeriod.locator(`a[href="/agenda?departement=${department}&categorie=${category}&quand=${value}"]`)
      await expect(periodLink).toHaveText(periodLabel)
      await periodLink.click()
      await page.waitForURL(`**/agenda?departement=${department}&categorie=${category}&quand=${value}`)
      await expect(periodLink).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('.agenda-period')).toContainText(periodLabel)
      await expect.poll(() => listedEvents(page), { message: `événements « ${periodLabel} »` }).toEqual(eventPaths(chosen.filter((e) => inPeriod(e, value))))
      await expectTabTitle(page, new RegExp(`^Agenda «\\s${escapeRegExp(label)}\\s», ${periodLabel.toLowerCase()} `), `période « ${periodLabel} »`)
    }
    await byPeriod.getByRole('link', { name: 'Toutes les dates' }).click()
    await page.waitForURL(`**/agenda?departement=${department}&categorie=${category}`)

    // retour à toute la région (catégorie gardée), puis à toutes les catégories
    await byDepartment.getByRole('link', { name: 'Toute la région' }).click()
    await page.waitForURL(`**/agenda?categorie=${category}`)
    await byCategory.getByRole('link', { name: 'Toutes les catégories' }).click()
    await page.waitForURL(/\/agenda$/)
    await expect(byCategory.getByRole('link', { name: 'Toutes les catégories' })).toHaveAttribute('aria-current', 'page')

    // adresse partagée (chargement direct) : la canonique garde catégorie et département, pas la période (elle change chaque jour)
    await page.goto(`/agenda?departement=${department}&categorie=${category}&quand=mois`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/agenda?departement=${department}&categorie=${category}`)
    await expect(page).toHaveTitle(new RegExp(`«\\s${escapeRegExp(label)}\\s», ce mois-ci `))
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('valeurs de filtre inconnues ignorées ; page au-delà de la dernière introuvable', async ({ page, request }) => {
    const events = (await upcomingEvents(request)).filter((e) => !isTestContent(e.title) && e.category)
    test.skip(!events.length, 'aucun événement à venir (lancez npm run seed)')
    await presetConsent(page.context())
    const response = await page.goto('/agenda?categorie=inconnue&quand=demain&departement=paris&page=zero')
    expect(response?.status()).toBe(200)
    for (const [nav, all] of [
      ['Filtrer par catégorie', 'Toutes les catégories'],
      ['Filtrer par période', 'Toutes les dates'],
      ['L’agenda par département', 'Toute la région'],
    ]) {
      await expect(page.getByRole('navigation', { name: nav }).getByRole('link', { name: all }), `${nav} : « ${all} »`).toHaveAttribute('aria-current', 'page')
    }
    await expect(page.locator('h1')).toHaveText('Agenda')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/agenda`)
    // une seule page d'événements de cette catégorie : la page 2 n'existe pas
    const { category } = events[0]
    test.skip(events.filter((e) => e.category === category).length > 24, 'plus d’une page d’événements dans cette catégorie')
    expect((await request.get(`/agenda?categorie=${category}&page=2`)).status()).toBe(404)
  })
})

withAdmin('agenda : pages suivantes (événements créés pour le test)', (admin) => {
  test('plus de 24 événements : « Suivant » et « Précédent », filtres conservés, page au-delà introuvable', async ({ page, request }) => {
    test.setTimeout(120_000)
    const errors = watchErrors(page)
    const tag = unique('agenda')
    // 25 événements dans le Cantal, dans deux mois (hors de toutes les périodes), sans date de fin
    const start = Date.now() + 60 * 24 * 3_600_000
    const created = await admin().createMany(
      'events',
      Array.from({ length: 25 }, (_, i) => ({
        title: `Test e2e agenda ${tag} n° ${String(i + 1).padStart(2, '0')}`,
        startDate: new Date(start + i * 3_600_000).toISOString(),
        city: 'Aurillac',
        department: 'cantal',
        place: 'Salle de test',
        category: 'culture',
      })),
    )
    const cantal = (await upcomingEvents(request)).filter((e) => e.department === 'cantal')
    const pages = Math.ceil(cantal.length / 24)
    expect(pages, 'pages de l’agenda du Cantal').toBeGreaterThanOrEqual(2)
    await presetConsent(page.context())

    await page.goto('/agenda?departement=cantal')
    await settle(page)
    const pager = page.getByRole('navigation', { name: 'Pages de l’agenda' })
    await expect(pager).toContainText(`Page 1 sur ${pages}`)
    await expect(pager.getByRole('link', { name: /Précédent/ })).toHaveCount(0)
    const next = pager.getByRole('link', { name: /Suivant/ })
    await expect(next).toHaveAttribute('href', '/agenda?departement=cantal&page=2')
    await expect(next).toHaveAttribute('rel', 'next')
    expect(await listedEvents(page)).toEqual(eventPaths(cantal.slice(0, 24)))
    await expect(page.locator('main')).toContainText(`${cantal.length} événements à venir`)

    await next.click()
    await page.waitForURL(/\/agenda\?departement=cantal&page=2$/)
    await expect(pager).toContainText(`Page 2 sur ${pages}`)
    await expect.poll(() => listedEvents(page)).toEqual(eventPaths(cantal.slice(24, 48)))
    await expectTabTitle(page, 'Agenda des sorties dans le Cantal (page 2) — Swatter TV Info', '« Suivant »')
    const previous = pager.getByRole('link', { name: /Précédent/ })
    await expect(previous).toHaveAttribute('href', '/agenda?departement=cantal')
    await expect(previous).toHaveAttribute('rel', 'prev')
    await previous.click()
    await page.waitForURL(/\/agenda\?departement=cantal$/)
    await expect(pager).toContainText(`Page 1 sur ${pages}`)
    await expectTabTitle(page, 'Agenda des sorties dans le Cantal — Swatter TV Info', '« Précédent »')

    // page 2 ouverte directement : son titre et sa propre adresse canonique
    await page.goto('/agenda?departement=cantal&page=2')
    await expect(page).toHaveTitle('Agenda des sorties dans le Cantal (page 2) — Swatter TV Info')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/agenda?departement=cantal&page=2`)

    // filtre de catégorie conservé d'une page à l'autre
    await page.goto('/agenda?departement=cantal&categorie=culture')
    await expect(pager.getByRole('link', { name: /Suivant/ })).toHaveAttribute('href', '/agenda?departement=cantal&categorie=culture&page=2')
    // période : ces événements, dans deux mois, n'en font pas partie
    await page.goto('/agenda?departement=cantal&quand=mois')
    expect((await listedEvents(page)).filter((href) => created.some((e) => href === `/agenda/${e.slug}`))).toEqual([])
    // au-delà de la dernière page : introuvable
    expect((await request.get(`/agenda?departement=cantal&page=${pages + 1}`)).status()).toBe(404)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

/* ----- Info ----- */

type ApiArticle = { title: string; slug: string; department: string; publishedAt: string }

async function publishedArticles(request: APIRequestContext): Promise<ApiArticle[]> {
  const { docs } = (await (await request.get('/api/articles?limit=500&depth=0&sort=-publishedAt')).json()) as { docs: ApiArticle[] }
  return docs.filter((a) => Date.parse(a.publishedAt) <= Date.now())
}

test.describe('info', () => {
  test('filtre par département : seulement l’info du département choisi, puis retour à toute la région', async ({ page, request }) => {
    const articles = (await publishedArticles(request)).filter((a) => !isTestContent(a.title))
    test.skip(!articles.length, 'aucun article (lancez npm run seed)')
    const errors = watchErrors(page)
    const dept = articles[0].department
    const ofDept = articles.filter((a) => a.department === dept)
    await presetConsent(page.context())
    await page.goto('/info')
    await settle(page)
    const nav = page.getByRole('navigation', { name: 'L’info par département' })
    await expect(nav.getByRole('link', { name: 'Toute la région' })).toHaveAttribute('aria-current', 'page')

    await nav.locator(`a[href="/info/${dept}"]`).click()
    await page.waitForURL(new RegExp(`/info/${dept}$`))
    await expect(nav.locator(`a[href="/info/${dept}"]`)).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(page.locator('h1')).toHaveText(/^L’info (en|dans) /)
    await expectTabTitle(page, /^L’info (en|dans) .+\s: l’actualité en continu — Swatter TV Info$/, `département « ${dept} »`)
    const listed = async () => (await linksMatching(page, /^\/info\/[a-z-]+\/[a-z0-9-]+$/)).sort()
    await expect.poll(listed).toEqual(ofDept.slice(0, 21).map((a) => `/info/${dept}/${a.slug}`).sort())

    await nav.getByRole('link', { name: 'Toute la région' }).click()
    await page.waitForURL(/\/info$/)
    await expect(nav.getByRole('link', { name: 'Toute la région' })).toHaveAttribute('aria-current', 'page')
    if (ofDept.length <= 21) expect((await request.get(`/info/${dept}?page=2`)).status(), 'page 2 d’un département sans page 2').toBe(404)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

withAdmin('info : pages suivantes (articles créés pour le test)', (admin) => {
  test('plus de 21 articles : « Plus anciennes » et « Plus récentes », dans un département et dans toute la région', async ({ page, request }) => {
    test.setTimeout(120_000)
    const errors = watchErrors(page)
    const tag = unique('info')
    // 22 articles du Cantal, datés de 2001 (après tous les autres) : le n° 22 est le plus récent
    const created = await admin().createMany(
      'articles',
      Array.from({ length: 22 }, (_, i) => ({
        title: `Test e2e info ${tag} n° ${String(i + 1).padStart(2, '0')}`,
        excerpt: 'Article créé par un test automatique, supprimé à la fin du test.',
        department: 'cantal',
        city: 'Aurillac',
        publishedAt: new Date(Date.UTC(2001, 0, 1, 8, i)).toISOString(),
      })),
    )
    const path = (n: number) => `/info/cantal/${created[n - 1].slug}`
    const cantal = (await publishedArticles(request)).filter((a) => a.department === 'cantal')
    const pages = Math.ceil((cantal.length - 1) / 20)
    expect(pages, 'pages de l’info du Cantal').toBeGreaterThanOrEqual(2)
    await presetConsent(page.context())

    await page.goto('/info/cantal')
    await settle(page)
    const list = page.locator('#actualites')
    const pager = page.getByRole('navigation', { name: 'Pages de l’actualité' })
    await expect(page.getByRole('heading', { name: 'À la une' })).toBeVisible()
    await expect(pager).toContainText(`Page 1 sur ${pages}`)
    await expect(list).toContainText(`${cantal.length} infos`)
    await expect(pager.getByRole('link', { name: /Plus récentes/ })).toHaveCount(0)
    const older = pager.getByRole('link', { name: /Plus anciennes/ })
    await expect(older).toHaveAttribute('href', '/info/cantal?page=2#actualites')
    await expect(older).toHaveAttribute('rel', 'next')
    await expect(list.locator(`a[href="${path(1)}"]`)).toHaveCount(0)

    await older.click()
    await page.waitForURL(/\/info\/cantal\?page=2#actualites$/)
    await expect(pager).toContainText(`Page 2 sur ${pages}`)
    await expect(list.getByRole('heading', { name: 'Toute l’actualité (page 2)' })).toBeVisible()
    // le plus ancien article est sur la dernière page ; pas d'article à la une après la première page
    if (pages === 2) await expect(list.locator(`a[href="${path(1)}"]`)).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'À la une' })).toHaveCount(0)
    await expectTabTitle(page, 'L’info dans le Cantal\u00a0: l’actualité en continu (page 2) — Swatter TV Info', '« Plus anciennes »')
    const newer = pager.getByRole('link', { name: /Plus récentes/ })
    await expect(newer).toHaveAttribute('href', '/info/cantal#actualites')
    await expect(newer).toHaveAttribute('rel', 'prev')
    await newer.click()
    await page.waitForURL(/\/info\/cantal#actualites$/)
    await expect(pager).toContainText(`Page 1 sur ${pages}`)
    await expectTabTitle(page, 'L’info dans le Cantal\u00a0: l’actualité en continu — Swatter TV Info', '« Plus récentes »')
    expect((await request.get(`/info/cantal?page=${pages + 1}`)).status()).toBe(404)

    // page 2 ouverte directement : son titre et sa propre adresse canonique
    await page.goto('/info/cantal?page=2')
    await expect(page).toHaveTitle('L’info dans le Cantal\u00a0: l’actualité en continu (page 2) — Swatter TV Info')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/info/cantal?page=2`)

    // toute la région : le Cantal est proposé dans le filtre, et les articles de 2001 sont sur la dernière page
    const all = await publishedArticles(request)
    const regionPages = Math.ceil((all.length - 1) / 20)
    await page.goto('/info')
    await expect(page.getByRole('navigation', { name: 'L’info par département' }).locator('a[href="/info/cantal"]')).toHaveText('Cantal')
    await expect(pager).toContainText(`Page 1 sur ${regionPages}`)
    await expect(page.locator(`#actualites a[href="${path(1)}"]`)).toHaveCount(0)
    await page.goto(`/info?page=${regionPages}`)
    await expect(pager).toContainText(`Page ${regionPages} sur ${regionPages}`)
    await expect(page.locator(`#actualites a[href="${path(1)}"]`)).toHaveCount(1)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

/* ----- Lecteur vidéo et consentement ----- */

withAdmin('lecteur vidéo (vidéo YouTube créée pour le test)', (admin) => {
  test('façade : rien n’est chargé depuis YouTube avant le clic ou l’accord, lecteur youtube-nocookie au clic', async ({ page, browser }) => {
    const title = `Test e2e lecteur ${unique('video')}`
    const video = await admin().createYoutubeVideo(title)
    const path = `/videos/${video.slug}`
    try {
      const errors = watchErrors(page)
      const third = await recordThirdParty(page.context())
      await page.goto(path)
      await settle(page)
      const player = page.getByRole('region', { name: /^Lecteur vidéo/ })
      const play = player.getByRole('button', { name: /^Lire la vidéo/ })
      // sans choix de cookies : affiche, bouton « Lire », mention du lecteur YouTube et « Gérer les cookies »
      await expect(play).toBeVisible()
      await expect(play).toHaveAccessibleDescription('La lecture charge le lecteur YouTube, qui peut déposer des cookies.')
      await expect(player.getByRole('button', { name: 'Gérer les cookies' })).toBeVisible()
      await expect(player.locator('iframe')).toHaveCount(0)
      await expect(banner(page)).toBeVisible()
      expect(third, 'requêtes vers d’autres sites avant le clic').toEqual([])

      // clic sans accord : il vaut accord pour cette vidéo seulement, rien n'est enregistré
      await play.click()
      const frame = player.locator('iframe.vp__frame')
      await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/e2eSwatTV01\?(.*&)?autoplay=1/)
      await expect(frame).toHaveAttribute('title', title)
      await expect(frame).toBeFocused()
      await expect.poll(() => third.length).toBeGreaterThan(0)
      expect(third.map((u) => new URL(u).hostname), 'seul le lecteur sans cookie de YouTube est chargé').toEqual(third.map(() => 'www.youtube-nocookie.com'))
      expect(await storedConsent(page)).toBeNull()

      // nouvelle visite : de nouveau la façade, aucune requête vers YouTube
      const before = third.length
      await page.reload()
      await settle(page)
      await expect(play).toBeVisible()
      await expect(player.locator('iframe')).toHaveCount(0)

      // « Gérer les cookies » du lecteur : panneau détaillé, accord aux contenus externes
      await player.getByRole('button', { name: 'Gérer les cookies' }).click()
      const external = banner(page).getByRole('switch', { name: 'Contenus externes' })
      await expect(external).toBeVisible()
      await expect(external).not.toBeChecked()
      await expect(banner(page).getByRole('switch', { name: 'Mesure d’audience' })).toBeFocused()
      await external.check()
      await banner(page).getByRole('button', { name: 'Enregistrer' }).click()
      await expect(banner(page)).toBeHidden()
      expect(await storedConsent(page)).toMatchObject({ v: 1, audience: false, externes: true })
      // accord donné : la mention disparaît, mais le lecteur ne se charge qu'au clic (pas de lecture automatique)
      await expect(player.getByText(/peut déposer des cookies/)).toHaveCount(0)
      await expect(play).not.toHaveAttribute('aria-describedby', /.+/)
      await page.waitForTimeout(1_000)
      expect(third.length, 'aucune requête vers YouTube avant le clic').toBe(before)
      await play.click()
      await expect(frame).toBeVisible()
      await expect.poll(() => third.length).toBeGreaterThan(before)
      expect(errors, errors.join('\n')).toEqual([])

      // mobile : même façade, rien de YouTube avant le toucher
      const mobile = await mobileContext(browser)
      try {
        const mobileThird = await recordThirdParty(mobile)
        const phone = await mobile.newPage()
        await phone.goto(path)
        await settle(phone)
        const mobilePlay = phone.getByRole('region', { name: /^Lecteur vidéo/ }).getByRole('button', { name: /^Lire la vidéo/ })
        await expect(mobilePlay).toBeVisible()
        await expect(banner(phone)).toBeVisible()
        expect(mobileThird).toEqual([])
        await banner(phone).getByRole('button', { name: 'Refuser' }).click()
        await mobilePlay.tap()
        await expect(phone.locator('iframe.vp__frame')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\//)
      } finally {
        await mobile.close()
      }
    } finally {
      await admin().remove('videos', video.id)
    }
  })
})

withAdmin('bannière cookies et contenus tiers (vidéo et webcams créées pour le test)', (admin) => {
  test('refus : aucun contenu tiers (vidéo, webcam YouTube, lecteur intégré, direct) ; accord : seuls le lecteur intégré et le direct se chargent seuls', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const tag = unique('tiers')
    const video = await admin().createYoutubeVideo(`Test e2e cookies ${tag}`)
    const youtubeCam = await admin().create('webcams', {
      name: `Test e2e webcam YouTube ${tag}`,
      department: 'cantal',
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/watch?v=e2eSwatTV02',
      order: 998,
    })
    const frameCam = await admin().create('webcams', {
      name: `Test e2e webcam intégrée ${tag}`,
      department: 'cantal',
      provider: 'iframe',
      embedUrl: 'https://webcam.example/embed/e2e',
      order: 997,
    })
    const pages = ['/', `/videos/${video.slug}`, '/webcams/cantal', '/webcams', '/direct']

    /** Refus au premier bandeau, puis visite des pages : ni bandeau, ni iframe, ni requête vers un autre site. */
    const refuseAndBrowse = async (context: BrowserContext, label: string) => {
      const third = await recordThirdParty(context)
      const p = context.pages()[0] ?? (await context.newPage())
      const errors = watchErrors(p)
      await p.goto('/')
      await expect(banner(p)).toBeVisible({ timeout: 15_000 })
      await banner(p).getByRole('button', { name: 'Refuser' }).click()
      await expect(banner(p)).toBeHidden()
      expect(await storedConsent(p)).toMatchObject({ v: 1, audience: false, externes: false })
      for (const path of pages) {
        await p.goto(path)
        await settle(p)
        // défilement jusqu'en bas : les lecteurs chargés « à l'approche » le seraient ici
        await p.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y)
            await new Promise((resolve) => setTimeout(resolve, 60))
          }
        })
        await p.waitForTimeout(600)
        await expect(banner(p), `${label} ${path} : bandeau non reproposé`).toBeHidden()
        await expect(p.locator('iframe'), `${label} ${path} : aucune iframe`).toHaveCount(0)
      }
      // façades des webcams externes : bouton et mention du service externe
      await p.goto('/webcams/cantal')
      await settle(p)
      for (const name of [youtubeCam.name, frameCam.name]) {
        const show = p.getByRole('button', { name: `Afficher la webcam en direct\u00a0: ${name}` })
        await expect(show).toBeVisible()
        await expect(show).toHaveAccessibleDescription('Ce flux est fourni par un service externe qui peut déposer des cookies.')
      }
      expect(third, `${label} : requêtes vers d’autres sites`).toEqual([])
      expect(errors, errors.join('\n')).toEqual([])
      return { p, third }
    }

    try {
      const { p, third } = await refuseAndBrowse(page.context(), 'bureau')
      const mobile = await mobileContext(browser)
      try {
        await refuseAndBrowse(mobile, 'mobile')
      } finally {
        await mobile.close()
      }

      // accord aux contenus externes (« Gestion des cookies ») : le lecteur intégré se charge à l'approche ;
      // la webcam YouTube et la vidéo attendent toujours un clic
      const manage = p.locator('footer').getByRole('button', { name: 'Gestion des cookies' })
      await manage.focus()
      await p.keyboard.press('Enter')
      await banner(p).getByRole('switch', { name: 'Contenus externes' }).check()
      await banner(p).getByRole('button', { name: 'Enregistrer' }).click()
      await expect(banner(p)).toBeHidden()
      await p.goto('/webcams/cantal')
      await settle(p)
      const embedded = p.locator(`iframe[title^="Webcam en direct\u00a0: ${frameCam.name}"]`)
      await expect(embedded).toHaveAttribute('src', 'https://webcam.example/embed/e2e')
      await expect(p.getByRole('button', { name: `Afficher la webcam en direct\u00a0: ${youtubeCam.name}` })).toBeVisible()
      await expect.poll(() => third.map((u) => new URL(u).hostname)).toContain('webcam.example')
      expect(third.filter((u) => /youtube|ytimg|google/.test(new URL(u).hostname)), 'rien de YouTube sans clic').toEqual([])

      // le direct démarre seul avec cet accord, sans le son : un fichier du site (jeu d'essai) sans rien demander à un
      // autre site ; un lecteur YouTube, Twitch ou Bunny se charge seul en muet (voir aussi admin.spec.ts)
      const settings = (await (await p.request.get('/api/globals/settings?depth=0')).json()) as { liveEnabled?: boolean; live?: { provider?: string | null } }
      const provider = settings.liveEnabled === false ? null : settings.live?.provider
      if (provider) {
        const before = third.length
        await p.goto('/direct')
        await settle(p)
        if (['youtube', 'twitch', 'bunny'].includes(provider)) await expect(p.locator('iframe.vp__frame')).toHaveAttribute('src', /[?&](mute=1|muted=true)(&|$)/)
        else expect(third.slice(before), 'direct (fichier du site) : rien d’un autre site').toEqual([])
      }
    } finally {
      await admin().remove('webcams', frameCam.id)
      await admin().remove('webcams', youtubeCam.id)
      await admin().remove('videos', video.id)
    }
  })
})

test.describe('bannière cookies', () => {
  test('« Refuser » : choix enregistré et respecté, bandeau non reproposé ; « Gestion des cookies » au clavier', async ({ page, request }) => {
    const errors = watchErrors(page)
    const replay = await firstDoc(request, 'replays')
    const third = await recordThirdParty(page.context())
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    // trois choix présentés à égalité (CNIL) : même apparence, même taille
    const buttons = banner(page).getByRole('button')
    await expect(buttons).toHaveText(['Refuser', 'Personnaliser', 'Accepter'])
    const sizes = await buttons.evaluateAll((els) =>
      els.map((el) => `${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`),
    )
    expect(new Set(sizes).size, `tailles des boutons : ${sizes.join(', ')}`).toBe(1)

    await banner(page).getByRole('button', { name: 'Refuser' }).click()
    await expect(banner(page)).toBeHidden()
    const choice = await storedConsent(page)
    expect(choice).toMatchObject({ v: 1, audience: false, externes: false })
    expect(Date.now() - Date.parse(String(choice?.date))).toBeLessThan(60_000)

    for (const path of ['/direct', '/webcams', '/meteo', ...(replay?.slug ? [`/replay/${replay.slug}`] : [])]) {
      await page.goto(path)
      await settle(page)
      await page.waitForTimeout(1_000)
      await expect(banner(page), `${path} : bandeau non reproposé`).toBeHidden()
    }
    expect(third, 'requêtes vers d’autres sites').toEqual([])

    // « Gestion des cookies » (pied de page) au clavier : panneau détaillé, choix actuel, focus sur le premier réglage
    const manage = page.locator('footer').getByRole('button', { name: 'Gestion des cookies' })
    await manage.focus()
    await page.keyboard.press('Enter')
    await expect(banner(page)).toBeVisible()
    const required = banner(page).getByRole('switch', { name: 'Fonctionnement du site' })
    await expect(required).toBeChecked()
    await expect(required).toBeDisabled()
    await expect(banner(page).getByRole('switch', { name: 'Mesure d’audience' })).not.toBeChecked()
    await expect(banner(page).getByRole('switch', { name: 'Mesure d’audience' })).toBeFocused()
    await expect(banner(page).getByRole('switch', { name: 'Contenus externes' })).not.toBeChecked()
    await expect(banner(page).getByRole('button')).toHaveText(['Tout refuser', 'Enregistrer', 'Tout accepter'])
    // Échap : fermé sans rien changer, focus rendu au bouton
    await page.keyboard.press('Escape')
    await expect(banner(page)).toBeHidden()
    await expect(manage).toBeFocused()
    expect(await storedConsent(page)).toEqual(choice)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

/* ----- Webcams ----- */

withAdmin('webcams : plein écran (webcam en direct créée pour le test)', (admin) => {
  /** Plein écran puis Échap (et bouton « Quitter ») : focus, légende, calque de repli si l'API plein écran manque. */
  async function fullscreenRoundTrip(page: Page, name: string, mode: 'native' | 'overlay') {
    const errors = watchErrors(page)
    await page.goto('/webcams/cantal')
    await settle(page)
    const card = page.locator('article.camp').filter({ has: page.getByRole('heading', { name, exact: true }) })
    const open = card.getByRole('button', { name: `Afficher la webcam ${name} en plein écran` })
    const close = card.getByRole('button', { name: 'Quitter le plein écran' })
    const overlay = page.getByRole('dialog', { name: `Webcam ${name} en plein écran` })
    const fullscreen = () => page.evaluate(() => document.fullscreenElement?.className ?? null)
    await expect(open).toBeVisible()
    await expect(close).toHaveCount(0)

    await open.click()
    await expect(close).toBeFocused()
    await expect(card.locator('.camp__caption')).toContainText(name)
    if (mode === 'native') {
      await expect.poll(fullscreen).toContain('camp__screen')
      await expect(overlay).toHaveCount(0)
    } else {
      expect(await fullscreen()).toBeNull()
      await expect(overlay).toBeVisible()
      await expect(overlay).toHaveAttribute('aria-modal', 'true')
      expect(await page.evaluate(() => document.documentElement.style.overflow), 'défilement de la page bloqué').toBe('hidden')
    }
    // le focus reste dans le plein écran
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()

    // Échap : retour à la page, focus sur le bouton plein écran
    await page.keyboard.press('Escape')
    await expect(close).toHaveCount(0)
    await expect.poll(fullscreen).toBeNull()
    await expect(overlay).toHaveCount(0)
    await expect(open).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')

    // au clavier : Entrée ouvre, Entrée sur « Quitter le plein écran » ferme
    await page.keyboard.press('Enter')
    await expect(close).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(close).toHaveCount(0)
    await expect.poll(fullscreen).toBeNull()
    await expect(open).toBeFocused()
    expect(errors, errors.join('\n')).toEqual([])
  }

  test('plein écran puis Échap : bureau, mobile, et calque de repli sans API plein écran (iPhone)', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const name = `Test e2e webcam ${unique('cam')}`
    // image rafraîchie servie par le site lui-même : un flux « en direct » sans service externe
    const cam = await admin().create('webcams', {
      name,
      place: 'Lac de test',
      department: 'cantal',
      provider: 'image',
      embedUrl: '/visuels/t-hiver-a.webp',
      order: 999,
    })
    try {
      await presetConsent(page.context())
      await fullscreenRoundTrip(page, name, 'native')

      const mobile = await mobileContext(browser)
      try {
        await presetConsent(mobile)
        await fullscreenRoundTrip(await mobile.newPage(), name, 'native')
      } finally {
        await mobile.close()
      }

      const iphone = await mobileContext(browser)
      try {
        await presetConsent(iphone)
        await iphone.addInitScript(() => {
          for (const key of ['fullscreenEnabled', 'webkitFullscreenEnabled']) {
            Object.defineProperty(Document.prototype, key, { get: () => false, configurable: true })
          }
        })
        await fullscreenRoundTrip(await iphone.newPage(), name, 'overlay')
      } finally {
        await iphone.close()
      }
    } finally {
      await admin().remove('webcams', cam.id)
    }
  })
})

/* ----- Espace membres ----- */

test.describe('membres', () => {
  test('« Ajouter à ma liste » sur un article et un événement, retrouvés, filtrés puis retirés dans « Ma liste »', async ({ page, request }) => {
    const article = (await publishedArticles(request)).find((a) => !isTestContent(a.title))
    const event = (await upcomingEvents(request)).find((e) => !isTestContent(e.title))
    test.skip(!article || !event, 'il faut un article et un événement à venir (lancez npm run seed)')
    const errors = watchErrors(page)
    const articlePath = `/info/${article!.department}/${article!.slug}`
    const eventPath = `/agenda/${event!.slug}`
    await presetConsent(page.context())

    // sans compte : lien vers la connexion, qui ramènera sur la page
    await page.goto(articlePath)
    await expect(page.getByRole('link', { name: /Ajouter à ma liste/ })).toHaveAttribute('href', `/connexion?retour=${encodeURIComponent(articlePath)}`)

    const { password } = await signupMember(page.request, 'Sacha')
    try {
      for (const path of [articlePath, eventPath]) {
        await page.goto(path)
        const save = page.getByRole('button', { name: /Ajouter à ma liste/ })
        // état lu au chargement : bouton actif, pas encore dans la liste
        await expect(save).toBeEnabled()
        await expect(save).toHaveAttribute('aria-pressed', 'false')
        await save.click()
        await expect(page.getByRole('button', { name: /Dans ma liste/ })).toHaveAttribute('aria-pressed', 'true')
        await expect(page.getByRole('status').filter({ hasText: 'Ajouté à votre liste.' })).toBeVisible()
      }
      // choix gardé : de retour sur l'article, « Dans ma liste »
      await page.goto(articlePath)
      await expect(page.getByRole('button', { name: /Dans ma liste/ })).toHaveAttribute('aria-pressed', 'true')

      // « Ma liste » : les deux contenus, filtres par type
      await page.goto('/compte/ma-liste')
      const main = page.locator('main')
      const articleLink = main.getByRole('link', { name: article!.title, exact: true })
      const eventLink = main.getByRole('link', { name: event!.title, exact: true })
      await expect(main.getByText('2 contenus gardés')).toBeVisible()
      await expect(articleLink).toHaveAttribute('href', articlePath)
      await expect(eventLink).toHaveAttribute('href', eventPath)
      const filters = page.getByRole('group', { name: 'Filtrer ma liste par type' })
      await filters.getByRole('button', { name: /^Infos/ }).click()
      await expect(filters.getByRole('button', { name: /^Infos/ })).toHaveAttribute('aria-pressed', 'true')
      await expect(articleLink).toBeVisible()
      await expect(eventLink).toHaveCount(0)
      await filters.getByRole('button', { name: /^Agenda/ }).click()
      await expect(eventLink).toBeVisible()
      await expect(articleLink).toHaveCount(0)
      await filters.getByRole('button', { name: /^Tout/ }).click()
      await expect(articleLink).toBeVisible()

      // retrait de l'événement depuis sa carte
      await main.getByRole('button', { name: new RegExp(`^Retirer de ma liste\\s:\\s${escapeRegExp(event!.title)}$`) }).click()
      await expect(page.getByRole('status').filter({ hasText: `« ${event!.title} » a été retiré de votre liste.` })).toBeVisible()
      await expect(eventLink).toHaveCount(0)
      await expect(main.getByText('1 contenu gardé')).toBeVisible()

      // retrait de l'article depuis sa page (« Dans ma liste ») : la liste est vide
      await page.goto(articlePath)
      await page.getByRole('button', { name: /Dans ma liste/ }).click()
      await expect(page.getByRole('button', { name: /Ajouter à ma liste/ })).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByRole('status').filter({ hasText: 'Retiré de votre liste.' })).toBeVisible()
      await page.goto('/compte/ma-liste')
      await expect(main.getByText('Votre liste est vide')).toBeVisible()
    } finally {
      await deleteMember(page.request, password)
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
})
