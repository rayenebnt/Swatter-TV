import { expect, test, type Page } from '@playwright/test'
import { expectNoHorizontalOverflow, settle, watchErrors } from './helpers'
import { AdminApi, mobileContext, presetConsent, unique } from './outils-contenus'

/**
 * Images adaptées au téléphone (390 px) : photo insérée dans le texte d'un article affichée à ses vraies proportions
 * (ni étirée ni découpée en vignette 16:9), carrousel de l'accueil servi par une balise <picture> avec une source
 * « téléphone » (image dédiée ou image de fond recadrée, taille adaptée au cadre portrait), sans débordement horizontal.
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
  test.skip(({ isMobile }) => !isMobile, 'source « téléphone » : projet mobile')

  test('balise <picture> avec une source sous 760 px, image retenue parmi ses tailles, prioritaire pour la première diapositive', async ({ page }) => {
    const errors = watchErrors(page)
    await presetConsent(page.context())
    await page.goto('/')
    await settle(page)

    const first = page.locator('.slide__media').first()
    const source = first.locator('picture > source[media="(max-width: 760px)"]')
    await expect(source).toHaveCount(1)
    // largeur réellement affichée (cadre portrait couvert par une image plus large, puis zoomée) : jamais « 100vw »
    await expect(source).not.toHaveAttribute('sizes', '100vw')
    const img = first.locator('picture > img')
    await expect(img).toHaveAttribute('fetchpriority', 'high')
    // image affichée prise dans la source « téléphone »
    await expect
      .poll(() =>
        img.evaluate((el: HTMLImageElement) => {
          const srcset = el.parentElement?.querySelector('source')?.getAttribute('srcset') ?? ''
          const urls = srcset.split(',').map((c) => new URL(c.trim().split(/\s+/)[0], location.href).href)
          return el.complete && urls.includes(el.currentSrc)
        }),
      )
      .toBe(true)

    // les autres diapositives ne sont pas prioritaires (chargement différé)
    const others = page.locator('.slide__media picture > img[fetchpriority="high"]')
    await expect(others).toHaveCount(1)
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
