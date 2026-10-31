import { expect, test, type Page } from '@playwright/test'
import { atParisTime, expectNoHorizontalOverflow, settle, watchErrors } from './helpers'
import { AdminApi, mobileContext, presetConsent, unique } from './outils-contenus'

/**
 * Images adaptées au téléphone (390 px) : photo insérée dans le texte d'un article affichée à ses vraies proportions
 * (ni étirée ni découpée en vignette 16:9), carrousel de l'accueil dont les photos en largeur (visuels des contenus de
 * départ) s'affichent entières sous l'en-tête, sur un fond flou tiré du même fichier (une seule image téléchargée par
 * diapositive), sans débordement horizontal ; les diapositives qui couvrent le cadre (visuel de repli du direct, image en
 * hauteur) gardent leurs textes juste au-dessus des barres de navigation, sous l'en-tête.
 */

/** Proportions affichées et naturelles d'une image, une fois chargée. */
async function ratios(page: Page, selector: string) {
  const img = page.locator(selector).first()
  await img.scrollIntoViewIfNeeded()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `image chargée : ${selector}` }).toBe(true)
  return img.evaluate((el: HTMLImageElement) => {
    const r = el.getBoundingClientRect()
    return { width: r.width, shown: r.width / r.height, natural: el.naturalWidth / el.naturalHeight, src: el.currentSrc, viewport: window.innerWidth }
  })
}

test.describe('carrousel de l’accueil sur téléphone', () => {
  test.skip(({ isMobile }) => !isMobile, 'cadre portrait du carrousel : projet mobile')

  // La diapositive du direct change avec l'antenne (18 h – 0 h 30) : programme en cours et barre de progression à 21 h,
  // une ligne « Ce soir à 18:00 » à 10 h. Cadrage vérifié dans les deux états (horloge du navigateur, indépendante de
  // l'heure du test)
  for (const [state, clock] of [
    ['à l’antenne, 21 h', '21:00'],
    ['hors antenne, 10 h', '10:00'],
  ] as const) {
    test(`photo en largeur entière sous l’en-tête, sur un fond flou du même fichier (une image par diapositive), première diapositive prioritaire (${state})`, async ({ page }) => {
      const errors = watchErrors(page)
      const requests: string[] = []
      page.on('request', (r) => {
        if (r.resourceType() === 'image') requests.push(r.url())
      })
      await presetConsent(page.context())
      await atParisTime(page, clock)
      await page.goto('/')
      await settle(page)

      const slides = page.locator('.hero .slide')
      const count = await slides.count()
      // contenus de départ : visuels en largeur, donc photo entière sur téléphone
      await expect(slides.first()).toHaveAttribute('data-whole', /\bphone\b/)
      // seule la première diapositive est prioritaire (les autres en différé)
      await expect(slides.first().locator('.slide__photo')).toHaveAttribute('fetchpriority', 'high')
      await expect(page.locator('.hero .slide__photo[fetchpriority="high"]')).toHaveCount(1)

      let checked = 0
      for (let i = 0; i < count; i++) {
        const slide = slides.nth(i)
        if (!((await slide.getAttribute('data-whole')) ?? '').split(' ').includes('phone')) continue
        if (i > 0) await page.locator('.hnav [role="tab"]').nth(i).click()
        // haut de page : en-tête affiché, mesures dans la position de départ
        await page.evaluate(() => window.scrollTo(0, 0))
        const photo = slide.locator('.slide__photo')
        const backdrop = slide.locator('.slide__backdrop')
        // fond : mêmes sources que la photo
        for (const attr of ['srcset', 'sizes', 'src']) expect(await backdrop.getAttribute(attr), attr).toBe(await photo.getAttribute(attr))
        await expect.poll(() => photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `photo de la diapositive ${i + 1} chargée` }).toBe(true)
        await expect.poll(() => backdrop.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `fond de la diapositive ${i + 1} chargé` }).toBe(true)

        const g = await photo.evaluate((el: HTMLImageElement) => {
          const r = el.getBoundingClientRect()
          const hero = el.closest('.hero')!.getBoundingClientRect()
          const header = document.querySelector('.hdr__in')!.getBoundingClientRect()
          // position dans le carrousel (l'en-tête fixe le recouvre sur sa hauteur)
          const bg = el.closest('.slide')!.querySelector<HTMLImageElement>('.slide__backdrop')!
          const content = el.closest('.slide')!.querySelector('.slide__content')!.getBoundingClientRect()
          const style = getComputedStyle(el)
          return {
            left: r.left,
            right: r.right,
            topInHero: r.top - hero.top,
            bottom: r.bottom,
            gapToText: content.top - r.bottom,
            width: r.width,
            shown: r.width / r.height,
            natural: el.naturalWidth / el.naturalHeight,
            heroBottom: hero.bottom,
            headerHeight: header.height,
            viewport: window.innerWidth,
            transform: style.transform,
            src: el.currentSrc,
            bgSrc: bg.currentSrc,
            bgDisplay: getComputedStyle(bg).display,
          }
        })
        const label = `diapositive ${i + 1}`
        // photo entière : proportions affichées = proportions du fichier, sans zoom, entièrement dans le carrousel et l'écran
        expect(Math.abs(g.shown - g.natural) / g.natural, `${label} : proportions affichées ${g.shown.toFixed(3)}, naturelles ${g.natural.toFixed(3)}`).toBeLessThan(0.02)
        expect(g.transform, `${label} : sans zoom`).toBe('none')
        expect(g.left, label).toBeGreaterThanOrEqual(-0.5)
        expect(g.right, label).toBeLessThanOrEqual(g.viewport + 0.5)
        expect(g.bottom, label).toBeLessThanOrEqual(g.heroBottom + 0.5)
        // sous l'en-tête (logo et boutons ne la masquent pas), jamais sous les textes
        expect(g.topInHero, `${label} : sous l'en-tête`).toBeGreaterThanOrEqual(g.headerHeight - 0.5)
        expect(g.gapToText, `${label} : au-dessus des textes`).toBeGreaterThanOrEqual(-0.5)
        // photo en largeur (16:9 des contenus de départ) : pleine largeur, sauf si les textes ont besoin de la place (la
        // diapositive du direct affiche le programme en cours à l'antenne) : elle rétrécit alors jusqu'à les toucher
        if (g.natural >= 1.6 && g.width < g.viewport - 1) {
          expect(g.gapToText, `${label} : photo rétrécie (${g.width.toFixed(0)} px) sans que les textes en aient besoin`).toBeLessThanOrEqual(15)
          expect(g.width, `${label} : photo rétrécie, mais lisible`).toBeGreaterThanOrEqual(g.viewport * 0.6)
        }
        // fond flou affiché, tiré du même fichier, téléchargé une seule fois
        expect(g.bgDisplay).not.toBe('none')
        expect(g.bgSrc, `${label} : fond et photo, même fichier`).toBe(g.src)
        expect(requests.filter((u) => u === g.src), `${label} : une seule requête pour ${g.src}`).toHaveLength(1)
        checked++
      }
      expect(checked, 'diapositives en photo entière').toBeGreaterThan(0)
      await expectNoHorizontalOverflow(page)
      expect(errors, errors.join('\n')).toEqual([])
    })

    test(`petit téléphone (375 × 667) : la photo entière reste sous l’en-tête et assez grande, le cadre s’allonge pour les textes (${state})`, async ({ page }) => {
      const errors = watchErrors(page)
      await page.setViewportSize({ width: 375, height: 667 })
      await presetConsent(page.context())
      await atParisTime(page, clock)
      await page.goto('/')
      await settle(page)
      const slides = page.locator('.hero .slide')
      const count = await slides.count()
      let checked = 0
      for (let i = 0; i < count; i++) {
        const slide = slides.nth(i)
        if (!((await slide.getAttribute('data-whole')) ?? '').split(' ').includes('phone')) continue
        // la diapositive du direct, la plus chargée à l'antenne (programme en cours et progression), est la première
        const g = await slide.evaluate((el) => {
          const photo = el.querySelector('.slide__photo')!.getBoundingClientRect()
          const content = el.querySelector('.slide__content')!.getBoundingClientRect()
          const hero = el.closest('.hero')!.getBoundingClientRect()
          return { photoTop: photo.top - hero.top, photoHeight: photo.height, photoRight: photo.right, contentTop: content.top, contentBottom: content.bottom, photoBottom: photo.bottom, heroBottom: hero.bottom }
        })
        const header = await page.locator('.hdr__in').evaluate((el) => el.getBoundingClientRect().height)
        const label = `diapositive ${i + 1}`
        expect(g.photoTop, `${label} : photo sous l'en-tête`).toBeGreaterThanOrEqual(header - 0.5)
        expect(g.photoHeight, `${label} : photo d'au moins 40 % de la largeur de l'écran en hauteur`).toBeGreaterThanOrEqual(375 * 0.4 - 1)
        expect(g.photoRight, label).toBeLessThanOrEqual(375.5)
        expect(g.contentTop, `${label} : textes sous la photo`).toBeGreaterThanOrEqual(g.photoBottom - 0.5)
        expect(g.contentBottom, `${label} : textes entièrement dans le carrousel`).toBeLessThanOrEqual(g.heroBottom + 0.5)
        checked++
      }
      expect(checked, 'diapositives en photo entière').toBeGreaterThan(0)
      await expectNoHorizontalOverflow(page)
      expect(errors, errors.join('\n')).toEqual([])
    })
  }

  test('diapositive qui couvre le cadre (sans photo entière) : textes juste au-dessus des barres de navigation, jamais sous l’en-tête', async ({ page }) => {
    // Visuel de repli du direct, image en hauteur : la diapositive n'a pas de data-whole et son image couvre le cadre.
    // Simulé sur le carrousel des contenus de départ en retirant data-whole (les règles de hero.css n'en dépendent que
    // par cet attribut) : rien n'est modifié dans les réglages, que les autres tests lisent en même temps.
    const errors = watchErrors(page)
    await presetConsent(page.context())
    for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await settle(page)
      const header = await page.locator('.hdr__in').evaluate((el) => el.getBoundingClientRect().height)
      const slides = await page.locator('.hero').evaluate((hero) => {
        for (const slide of hero.querySelectorAll('.slide')) slide.removeAttribute('data-whole')
        const box = hero.getBoundingClientRect()
        const nav = hero.querySelector('.hnav')?.getBoundingClientRect()
        return [...hero.querySelectorAll('.slide')].map((slide) => {
          // diapositives masquées (opacity 0) : mises en page comme la diapositive affichée
          const content = slide.querySelector('.slide__content')!.getBoundingClientRect()
          return { top: content.top - box.top, bottom: content.bottom - box.top, height: box.height, navTop: nav ? nav.top - box.top : null }
        })
      })
      expect(slides.length, `${viewport.width} × ${viewport.height} : diapositives`).toBeGreaterThan(0)
      slides.forEach((g, i) => {
        const label = `${viewport.width} × ${viewport.height}, diapositive ${i + 1}`
        expect(g.top, `${label} : textes sous l'en-tête`).toBeGreaterThanOrEqual(header - 0.5)
        if (g.navTop !== null) expect(g.bottom, `${label} : textes au-dessus des barres de navigation`).toBeLessThanOrEqual(g.navTop + 0.5)
        // posés en bas du cadre (96 px), pas à la hauteur prévue pour l'ordinateur (170 px et plus)
        expect(g.height - g.bottom, `${label} : marge sous les textes`).toBeGreaterThanOrEqual(50)
        expect(g.height - g.bottom, `${label} : marge sous les textes`).toBeLessThanOrEqual(120)
      })
    }
    await expectNoHorizontalOverflow(page)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('photo insérée dans le texte d’un article (article créé pour le test)', () => {
  // connexion administrateur : un seul projet ; l'affichage mobile est vérifié dans un second contexte
  test.skip(({ isMobile }) => isMobile, 'connexion administrateur : projet « bureau » seulement (affichage mobile vérifié dans un second contexte)')
  test.describe.configure({ mode: 'serial' })

  let admin: AdminApi | null = null
  test.beforeAll(async () => {
    admin = await AdminApi.open()
    test.skip(!admin, 'identifiants administrateur indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
  })
  test.afterAll(async () => {
    await admin?.dispose()
  })

  test('à 390 px, la photo garde ses proportions, tient dans la colonne et n’est pas une vignette 16:9 découpée', async ({ browser }) => {
    const image = await admin!.imageId()
    const paragraph = (text: string) => ({
      type: 'paragraph',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      textFormat: 0,
      children: [{ type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 }],
    })
    const article = await admin!.create('articles', {
      title: `Test e2e images ${unique('photo')}`,
      excerpt: 'Article créé par un test automatique, supprimé à la fin du test.',
      department: 'cantal',
      city: 'Aurillac',
      publishedAt: new Date(Date.UTC(2001, 0, 1, 8)).toISOString(),
      content: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: 'ltr',
          children: [
            paragraph('Une photo insérée dans le texte :'),
            { type: 'upload', version: 3, format: '', id: '6720a1b2c3d4e5f6a7b8c9d0', fields: null, relationTo: 'media', value: image },
            paragraph('Fin du texte.'),
          ],
        },
      },
    })
    const path = `/info/cantal/${article.slug}`

    const mobile = await mobileContext(browser)
    try {
      await presetConsent(mobile)
      const page = await mobile.newPage()
      const errors = watchErrors(page)
      expect((await page.goto(path))?.status()).toBe(200)
      await settle(page)
      const photo = await ratios(page, '.art__body img')
      // affichée aux proportions du fichier (le convertisseur par défaut écrivait les dimensions d'origine : photo étirée)
      expect(Math.abs(photo.shown - photo.natural) / photo.natural, `proportions affichées ${photo.shown.toFixed(3)}, naturelles ${photo.natural.toFixed(3)}`).toBeLessThan(0.02)
      expect(photo.width, 'largeur de la colonne de texte').toBeLessThanOrEqual(photo.viewport - 32 + 1)
      // fichier d'origine (ou déclinaison « hero »), jamais la vignette 480 × 270 découpée en 16:9
      expect(decodeURIComponent(photo.src)).not.toContain('-480x270')
      await expectNoHorizontalOverflow(page)
      expect(errors, errors.join('\n')).toEqual([])
    } finally {
      await mobile.close()
    }
  })
})
