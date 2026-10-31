import { expect, test, type Page } from '@playwright/test'
import { atParisTime, expectPlayer, parisToday, settle, watchErrors } from './helpers'

/*
 * L'antenne (tous les soirs de 18 h à 0 h 30, heure de Paris) hors de la page Programme TV : diapositive « direct » de
 * l'accueil, page Direct, point rouge de « Le Direct » dans la navigation.
 * Indépendants de l'heure du test : le serveur rend avec l'heure réelle (pages en cache), le navigateur, dont l'horloge
 * est fixée par page.clock, refait le calcul après l'hydratation. Les états attendus sont donc ceux de l'heure du
 * navigateur, sans erreur d'hydratation (premier rendu = rendu du serveur), quelle que soit l'heure réelle.
 */

type Settings = { liveEnabled?: boolean; live?: { provider?: string | null } | null; heroSlides?: { kind?: string | null }[] | null }

async function liveSettings(page: Page): Promise<Settings> {
  return (await (await page.request.get('/api/globals/settings?depth=0')).json()) as Settings
}

/** Le direct est actif avec un flux (sinon « Le direct reprend bientôt » à toute heure). */
const liveOn = (s: Settings) => s.liveEnabled !== false && Boolean(s.live?.provider)

/** Point rouge de « Le Direct » : en-tête (ordinateur) ou barre d'onglets (téléphone), menu mobile. */
const liveDots = (page: Page) => page.locator('a[href="/direct"] .dot-live')

test.describe('page Direct selon l’antenne', () => {
  test('21 h : le lecteur du direct, « En ce moment », point rouge dans la navigation', async ({ page }) => {
    const settings = await liveSettings(page)
    test.skip(!liveOn(settings), 'direct coupé ou sans flux dans les réglages')
    const errors = watchErrors(page)
    await atParisTime(page, '21:00')
    await page.goto('/direct')
    await settle(page)
    await expectPlayer(page)
    await expect(page.locator('.direct-off')).toHaveCount(0)
    await expect(page.locator('.onair')).toHaveAttribute('data-onair', 'antenne')
    await expect(page.locator('.onair')).not.toContainText('Hors antenne')
    await expect(liveDots(page).first()).toBeAttached()
    await expect(page.locator('main')).toContainText('tous les soirs, 18 h – 0 h 30')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('10 h : écran « Le direct reprend ce soir à 18 h », pas de lecteur ni de point rouge', async ({ page }) => {
    const settings = await liveSettings(page)
    test.skip(!liveOn(settings), 'direct coupé ou sans flux dans les réglages')
    const errors = watchErrors(page)
    await atParisTime(page, '10:00')
    await page.goto('/direct')
    await settle(page)
    const off = page.locator('.direct-off')
    await expect(off).toBeVisible()
    await expect(off.getByRole('heading', { level: 2 })).toHaveText('Le direct reprend ce soir à 18 h')
    await expect(page.getByRole('region', { name: /lecteur vidéo/i })).toHaveCount(0)
    const panel = page.locator('.onair')
    await expect(panel).toHaveAttribute('data-onair', 'hors-antenne')
    await expect(panel).toContainText('Hors antenne')
    await expect(panel).toContainText('Reprise ce soir à 18 h')
    await expect(panel.locator('.dot-live')).toHaveCount(0)
    await expect(liveDots(page)).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('onglet resté ouvert : le lecteur apparaît à 18 h et laisse place à l’écran hors antenne à 0 h 30', async ({ page }) => {
    const settings = await liveSettings(page)
    test.skip(!liveOn(settings), 'direct coupé ou sans flux dans les réglages')
    const errors = watchErrors(page)
    const player = page.getByRole('region', { name: /lecteur vidéo/i })

    // horloge installée bien avant 18 h, puis figée à 17 h 59 40 une fois la page chargée : le chargement (première
    // compilation d'un serveur de développement, machine chargée) ne peut pas franchir 18 h à l'insu du test
    await page.clock.install({ time: parisToday('17:50:00') })
    await page.goto('/direct')
    await settle(page)
    await page.clock.pauseAt(parisToday('17:59:40'))
    await expect(page.locator('.direct-off')).toBeVisible()
    await expect(player).toHaveCount(0)
    // 18 h passées (l'horloge partagée du site avance par pas de 15 s)
    await page.clock.fastForward('00:40')
    await expect(player.first()).toBeVisible()
    await expect(page.locator('.direct-off')).toHaveCount(0)
    await expect(liveDots(page).first()).toBeAttached()

    // la nuit suivante, 0 h 29 : encore la soirée commencée à 18 h, à l'antenne
    await page.clock.setSystemTime(parisToday('00:29:40', 1))
    await page.clock.fastForward('00:10')
    await expect(player.first()).toBeVisible()
    await page.clock.fastForward('00:30')
    await expect(page.locator('.direct-off')).toBeVisible()
    await expect(page.locator('.direct-off h2')).toHaveText('Le direct reprend ce soir à 18 h')
    await expect(player).toHaveCount(0)
    await expect(liveDots(page)).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('accueil : diapositive « direct » selon l’antenne', () => {
  /** Diapositive « direct » (réglages : kind « live », ou diapositive par défaut). */
  const liveSlide = (page: Page) => page.locator('.hero .slide[data-onair]').first()

  test('21 h : badge « En direct » ; 10 h : « Ce soir dès 18 h », sans badge rouge ni « En direct » en vignette', async ({ page, browser }) => {
    const settings = await liveSettings(page)
    const slides = settings.heroSlides ?? []
    test.skip(!liveOn(settings) || (slides.length > 0 && !slides.some((s) => s.kind === 'live')), 'pas de diapositive du direct')
    const errors = watchErrors(page)
    await atParisTime(page, '21:00')
    await page.goto('/')
    await settle(page)
    await expect(liveSlide(page)).toHaveAttribute('data-onair', 'antenne')
    await expect(liveSlide(page).locator('.badge--live')).toHaveCount(1)
    await expect(liveSlide(page).locator('.badge--live')).toContainText('En direct')
    await expect(liveSlide(page).locator('[data-onair="hors-antenne"]')).toHaveCount(0)
    await expect(liveDots(page).first()).toBeAttached()
    expect(errors, errors.join('\n')).toEqual([])

    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: page.viewportSize() ?? undefined })
    try {
      const day = await context.newPage()
      const dayErrors = watchErrors(day)
      await atParisTime(day, '10:00')
      await day.goto('/')
      await settle(day)
      const slide = liveSlide(day)
      await expect(slide).toHaveAttribute('data-onair', 'hors-antenne')
      await expect(day.locator('.hero .badge--live')).toHaveCount(0)
      await expect(slide.locator('.badges')).toContainText('Ce soir dès 18 h')
      // ligne de la soirée à venir : premier programme de 18 h, ou « Reprise ce soir à 18 h » sans grille
      await expect(slide.locator('.progress[data-onair="hors-antenne"]')).toContainText(/Ce soir à \d{2}:\d{2}|Reprise ce soir à 18 h/)
      await expect(slide.getByRole('progressbar')).toHaveCount(0)
      const navLabels = await day.locator('.hnav__txt small').allTextContents()
      expect(navLabels.map((l) => l.trim().toLowerCase()), 'vignettes').not.toContain('en direct')
      await expect(liveDots(day)).toHaveCount(0)
      expect(dayErrors, dayErrors.join('\n')).toEqual([])
    } finally {
      await context.close()
    }
  })
})

test('navigation : jamais de point rouge au rendu serveur (il n’apparaît qu’après l’hydratation, à l’antenne)', async ({ request }) => {
  for (const path of ['/', '/info']) {
    const html = await (await request.get(path)).text()
    for (const nav of html.match(/<nav class="(?:nav|tabbar)"[\s\S]*?<\/nav>/g) ?? []) {
      expect(nav, `${path} : navigation rendue par le serveur`).not.toContain('dot-live')
    }
    expect(html.match(/<nav class="(?:nav|tabbar)"/g)?.length ?? 0, `${path} : navigations trouvées`).toBeGreaterThan(0)
  }
})
