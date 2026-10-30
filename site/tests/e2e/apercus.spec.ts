import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { settle, watchErrors } from './helpers'
import { AdminApi, mobileContext, presetConsent, recordThirdParty, unique } from './outils-contenus'

/**
 * Aperçus animés des vidéos : court extrait muet servi par le site, superposé à l'image des cartes et placé derrière
 * le bouton « Lire la vidéo » des fiches. Vérifié : la balise <video> des cartes ne demande rien avant d'être lancée
 * (preload="none", pas de src), elle est lancée au survol sur ordinateur et quand la carte est la plus visible après
 * le défilement sur téléphone, jamais en « réduire les animations » ; aucune requête vers un autre site ; le lien de
 * la carte reste cliquable ; sur la fiche, la façade et le consentement du lecteur YouTube ne changent pas.
 *
 * La vidéo de test (YouTube, identifiant fictif) reçoit pour aperçu le clip de démonstration de la médiathèque
 * (npm run seed). C'est un MP4 H.264 que le Chromium de Playwright ne décode pas : la lecture échoue en silence. On
 * vérifie donc la demande du fichier (src posée au lancement, requête vers le site), et le bouton pause du lecteur
 * seulement si le navigateur a pu lire l'extrait.
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

type Media = { id: number; url?: string | null; filename?: string | null; mimeType?: string | null }

/** Bouton pause / relance de l'aperçu d'une fiche (noms exacts : le titre de la vidéo peut contenir « aperçu »). */
const PREVIEW_TOGGLE = /^(Mettre l’aperçu en pause|Relancer l’aperçu)$/

/** Clip de démonstration du jeu d'essai (pas un aperçu automatique apercu-…), utilisé comme aperçu ; null sans lui. */
async function clipMedia(admin: AdminApi): Promise<Media | null> {
  const res = await admin.send('GET', '/api/media?limit=1&depth=0&where[filename][like]=direct-mont-blanc&where[mimeType][contains]=video%2F')
  const { docs } = (await res.json()) as { docs: Media[] }
  return docs[0] ?? null
}

/** Vidéo publiée avec un aperçu animé (le champ, caché dans l'administration, est rempli ici par l'API). */
async function videoWithPreview(admin: AdminApi, clip: Media, tag: string) {
  const video = await admin.create<{ id: number; slug: string; title: string }>('videos', {
    title: `Test e2e aperçu ${tag}`,
    source: { provider: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=e2eSwatTV03' },
    thumbnail: await admin.imageId(),
    preview: clip.id,
    category: 'nature',
    description: 'Vidéo créée par un test automatique, supprimée à la fin du test.',
    // la plus récente : en tête de la liste des vidéos
    publishedAt: new Date(Date.now() - 60 * 1000).toISOString(),
  })
  expect(video.slug, 'adresse de la vidéo').toBeTruthy()
  return video
}

/** Requêtes du navigateur vers le fichier d'aperçu. */
function clipRequests(context: BrowserContext, clip: Media): string[] {
  const urls: string[] = []
  context.on('request', (req) => {
    if (clip.filename && new URL(req.url()).pathname.endsWith(`/${clip.filename}`)) urls.push(req.url())
  })
  return urls
}

/** Carte de la grille /videos qui mène à la fiche. */
const cardOf = (page: Page, slug: string) => page.locator('.vgrid article.vcard').filter({ has: page.locator(`a.stretched[href="/videos/${slug}"]`) })

/** Avant tout lancement : balise présente, rien de demandé, décorative. */
async function expectIdle(preview: Locator) {
  await expect(preview).toHaveCount(1)
  await expect(preview).toHaveAttribute('preload', 'none')
  await expect(preview).toHaveAttribute('aria-hidden', 'true')
  expect(await preview.getAttribute('src'), 'pas de fichier demandé avant le lancement').toBeNull()
}

withAdmin('aperçus animés des cartes et des fiches (vidéo créée pour le test)', (admin) => {
  let clip: Media | null = null
  let video: { id: number; slug: string; title: string } | null = null

  // la vidéo créée est supprimée à la fin du groupe (AdminApi.dispose)
  test.beforeAll(async () => {
    clip = await clipMedia(admin())
    test.skip(!clip, 'aucune vidéo dans la médiathèque (lancez npm run seed)')
    video = await videoWithPreview(admin(), clip!, unique('carte'))
  })

  test('ordinateur : rien n’est demandé avant le survol ; au survol, l’extrait du site est lancé sans le son ; le lien reste cliquable', async ({ page }) => {
    const errors = watchErrors(page)
    await presetConsent(page.context())
    const third = await recordThirdParty(page.context())
    const requests = clipRequests(page.context(), clip!)
    await page.goto('/videos')
    await settle(page)
    const card = cardOf(page, video!.slug)
    const preview = card.locator('.media > video.vprev')
    await expectIdle(preview)
    // une carte ne démarre pas seule à la souris
    await page.waitForTimeout(1_000)
    expect(await preview.getAttribute('src')).toBeNull()
    expect(requests, 'aucune requête vers l’aperçu avant le survol').toEqual([])

    await card.hover()
    await expect(preview).toHaveAttribute('src', /\/api\/media\/file\//)
    expect(await preview.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop }))).toEqual({ muted: true, loop: true })
    await expect.poll(() => requests.length, 'fichier d’aperçu demandé au site').toBeGreaterThan(0)

    // la vidéo laisse passer les clics : la carte mène toujours à la fiche
    await card.click()
    await page.waitForURL(`**/videos/${video!.slug}`)
    expect(third, 'requêtes vers d’autres sites').toEqual([])
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('téléphone : la carte la plus visible lance son aperçu après l’arrêt du défilement, sans requête tierce', async ({ browser }) => {
    const mobile = await mobileContext(browser)
    try {
      await presetConsent(mobile)
      const third = await recordThirdParty(mobile)
      const phone = await mobile.newPage()
      const errors = watchErrors(phone)
      await phone.goto('/videos')
      await settle(phone)
      const card = cardOf(phone, video!.slug)
      const preview = card.locator('.media > video.vprev')
      await expect(preview).toHaveCount(1)
      await expect(preview).toHaveAttribute('preload', 'none')
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await expect(preview).toHaveAttribute('src', /\/api\/media\/file\//, { timeout: 5_000 })
      // une seule fois, sans boucle
      expect(await preview.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop }))).toEqual({ muted: true, loop: false })
      expect(third, 'requêtes vers d’autres sites').toEqual([])
      expect(errors, errors.join('\n')).toEqual([])
    } finally {
      await mobile.close()
    }
  })

  test('« réduire les animations » : aucun aperçu lancé, ni au survol, ni au défilement, ni sur la fiche', async ({ browser }) => {
    const desk = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const mobile = await mobileContext(browser, { reducedMotion: 'reduce' })
    try {
      for (const context of [desk, mobile]) {
        await presetConsent(context)
        const requests = clipRequests(context, clip!)
        const page = await context.newPage()
        await page.goto('/videos')
        await settle(page)
        const card = cardOf(page, video!.slug)
        await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        if (context === desk) await card.hover()
        await page.waitForTimeout(1_500)
        await expectIdle(card.locator('video.vprev'))
        await page.goto(`/videos/${video!.slug}`)
        await settle(page)
        await page.waitForTimeout(1_000)
        const player = page.getByRole('region', { name: /^Lecteur vidéo/ })
        expect(await player.locator('video.vprev').getAttribute('src')).toBeNull()
        await expect(player.getByRole('button', { name: PREVIEW_TOGGLE })).toHaveCount(0)
        expect(requests, 'aucune requête vers l’aperçu').toEqual([])
      }
    } finally {
      await desk.close()
      await mobile.close()
    }
  })

  test('fiche : aperçu derrière « Lire la vidéo » ; façade, consentement et lecteur au clic inchangés', async ({ page }) => {
    const errors = watchErrors(page)
    const third = await recordThirdParty(page.context())
    const requests = clipRequests(page.context(), clip!)
    await page.goto(`/videos/${video!.slug}`)
    await settle(page)
    const player = page.getByRole('region', { name: /^Lecteur vidéo/ })
    const play = player.getByRole('button', { name: /^Lire la vidéo/ })
    await expect(play).toBeVisible()
    await expect(play).toHaveAccessibleDescription('La lecture charge le lecteur YouTube, qui peut déposer des cookies.')
    await expect(player.locator('iframe')).toHaveCount(0)
    const preview = player.locator('video.vprev')
    await expect(preview).toHaveCount(1)
    // lecteur visible : l'aperçu est lancé seul (fichier du site, aucune requête vers YouTube)
    await expect(preview).toHaveAttribute('src', /\/api\/media\/file\//)
    await expect.poll(() => requests.length).toBeGreaterThan(0)
    expect(third, 'rien de YouTube avant le clic').toEqual([])

    // extrait lisible par ce navigateur : bouton pause, puis relance (WCAG 2.2.2)
    const decoded = await preview.evaluate(
      (v: HTMLVideoElement) =>
        new Promise<boolean>((resolve) => {
          if (v.error) return resolve(false)
          if (!v.paused && v.readyState > 2) return resolve(true)
          v.addEventListener('playing', () => resolve(true), { once: true })
          v.addEventListener('error', () => resolve(false), { once: true })
          setTimeout(() => resolve(!v.paused && !v.error), 5_000)
        }),
    )
    if (decoded) {
      await player.getByRole('button', { name: 'Mettre l’aperçu en pause' }).click()
      await expect(player.getByRole('button', { name: 'Relancer l’aperçu' })).toBeVisible()
      expect(await preview.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
      await player.getByRole('button', { name: 'Relancer l’aperçu' }).click()
      await expect(player.getByRole('button', { name: 'Mettre l’aperçu en pause' })).toBeVisible()
    } else {
      test.info().annotations.push({ type: 'info', description: 'aperçu non décodé par ce navigateur (H.264) : bouton pause non vérifié' })
      await expect(player.getByRole('button', { name: PREVIEW_TOGGLE })).toHaveCount(0)
    }

    // clic : lecteur YouTube avec le son, comme avant ; l'aperçu disparaît
    await play.click()
    const frame = player.locator('iframe.vp__frame')
    await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/e2eSwatTV03\?(.*&)?autoplay=1/)
    expect(await frame.getAttribute('src')).not.toMatch(/mute=1/)
    await expect(frame).toBeFocused()
    await expect(player.locator('video.vprev')).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })
})
