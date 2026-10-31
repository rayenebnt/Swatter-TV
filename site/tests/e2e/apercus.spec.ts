import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { settle, watchErrors } from './helpers'
import { AdminApi, mobileContext, presetConsent, recordThirdParty, SITE, unique } from './outils-contenus'

/**
 * Aperçus animés des vidéos : court extrait muet servi par le site, superposé à l'image des cartes et placé derrière
 * le bouton « Lire la vidéo » des fiches. Vérifié : chaque carte visible lance son aperçu seule, en boucle et sans le
 * son, sans survol ni toucher, sur ordinateur comme sur téléphone ; une carte hors de l'écran ne demande rien
 * (preload="none", pas de src) jusqu'à son arrivée à l'écran ; plusieurs aperçus tournent ensemble, dans la limite du
 * plafond (3 sur téléphone) ; pause hors de l'écran et onglet masqué ; jamais en « réduire les animations » ; aucune
 * requête vers un autre site ; le lien de la carte reste cliquable ; sur la fiche, bouton pause, façade et consentement
 * du lecteur YouTube inchangés.
 *
 * Les vidéos de test (YouTube, identifiants fictifs) reçoivent pour aperçu le clip de démonstration de la médiathèque
 * (npm run seed). C'est un MP4 H.264 que le Chromium de Playwright ne décode pas : la lecture échoue en silence. Les
 * tests de demande vérifient donc la demande du fichier (src posée, requête vers le site) ; ceux de lecture réelle
 * remplacent sa réponse par une courte mire WebM VP9 fabriquée par ffmpeg (sautés sans ffmpeg).
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
type Video = { id: number; slug: string; title: string }

/** Bouton pause / relance de l'aperçu d'une fiche (noms exacts : le titre de la vidéo peut contenir « aperçu »). */
const PREVIEW_TOGGLE = /^(Mettre l’aperçu en pause|Relancer l’aperçu)$/

/** Clip de démonstration du jeu d'essai (pas un aperçu automatique apercu-…), utilisé comme aperçu ; null sans lui. */
async function clipMedia(admin: AdminApi): Promise<Media | null> {
  const res = await admin.send('GET', '/api/media?limit=1&depth=0&where[filename][like]=direct-mont-blanc&where[mimeType][contains]=video%2F')
  const { docs } = (await res.json()) as { docs: Media[] }
  return docs[0] ?? null
}

/** Vidéo publiée avec un aperçu animé (le champ, caché dans l'administration, est rempli ici par l'API). */
async function videoWithPreview(admin: AdminApi, clip: Media, tag: string, minutesAgo = 1) {
  const video = await admin.create<Video>('videos', {
    title: `Test e2e aperçu ${tag}`,
    source: { provider: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=e2eSwatTV03' },
    thumbnail: await admin.imageId(),
    preview: clip.id,
    category: 'nature',
    description: 'Vidéo créée par un test automatique, supprimée à la fin du test.',
    // les plus récentes : en tête de la liste des vidéos
    publishedAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
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

let webm: Buffer | null | undefined

/** Mire animée de 2 s en WebM VP9 (lisible par le Chromium de Playwright), fabriquée une fois par ffmpeg ; null sans lui. */
function webmClip(): Buffer | null {
  if (webm !== undefined) return webm
  const out = test.info().outputPath('apercu-vp9.webm')
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15:duration=2']
  args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '50', '-deadline', 'realtime', '-cpu-used', '8', '-an', out)
  const run = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', args)
  webm = run.status === 0 ? readFileSync(out) : null
  return webm
}

/** Le fichier d'aperçu (MP4 H.264) est servi sous forme d'extrait WebM, que ce navigateur sait lire. */
async function serveWebm(context: BrowserContext, clip: Media, body: Buffer) {
  await context.route(
    (url) => url.origin === SITE && Boolean(clip.filename) && url.pathname.endsWith(`/${clip.filename}`),
    (route) => route.fulfill({ status: 200, contentType: 'video/webm', body }),
  )
}

/** Carte de la grille /videos qui mène à la fiche. */
const cardOf = (page: Page, slug: string) => page.locator('.vgrid article.vcard').filter({ has: page.locator(`a.stretched[href="/videos/${slug}"]`) })

/** Aperçus qui tournent vraiment (lecture en cours, image animée affichée) parmi ceux désignés. */
const playing = (previews: Locator) =>
  previews.evaluateAll((els) => els.filter((el) => !(el as HTMLVideoElement).paused && el.classList.contains('is-on')).length)

/** Aperçus visibles au moins à moitié parmi ceux désignés. */
const halfVisible = (previews: Locator) =>
  previews.evaluateAll(
    (els) =>
      els.filter((el) => {
        const r = el.getBoundingClientRect()
        const shown = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0))
        return r.width * r.height > 0 && shown / (r.width * r.height) >= 0.5
      }).length,
  )

/** Balise présente, rien de demandé, décorative. */
async function expectIdle(preview: Locator) {
  await expect(preview).toHaveCount(1)
  await expect(preview).toHaveAttribute('preload', 'none')
  await expect(preview).toHaveAttribute('aria-hidden', 'true')
  await expect(preview).toHaveAttribute('tabindex', '-1')
  expect(await preview.getAttribute('src'), 'pas de fichier demandé avant l’arrivée à l’écran').toBeNull()
}

/**
 * Carte de la grille hors de l'écran au chargement (sous le Top 10) : rien de demandé, même après un moment ; amenée à
 * l'écran par programme (ni souris ni doigt), elle lance son aperçu seule, en boucle et sans le son.
 */
async function expectStartsWhenShown(page: Page, card: Locator, requests: string[]) {
  const preview = card.locator('.media > video.vprev')
  await expectIdle(preview)
  await expect(preview, 'carte sous la ligne de flottaison au chargement').not.toBeInViewport()
  await page.waitForTimeout(1_500)
  expect(await preview.getAttribute('src'), 'carte hors de l’écran : rien de demandé').toBeNull()

  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await expect(preview).toHaveAttribute('src', /\/api\/media\/file\//, { timeout: 5_000 })
  expect(await preview.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop }))).toEqual({ muted: true, loop: true })
  await expect.poll(() => requests.length, 'fichier d’aperçu demandé au site').toBeGreaterThan(0)
}

withAdmin('aperçus animés des cartes et des fiches (vidéos créées pour le test)', (admin) => {
  let clip: Media | null = null
  let video: Video | null = null
  /** Autres vidéos à aperçu (lecture de plusieurs aperçus en même temps, plafond) */
  let others: Video[] = []

  // les vidéos créées sont supprimées à la fin du groupe (AdminApi.dispose)
  test.beforeAll(async () => {
    clip = await clipMedia(admin())
    test.skip(!clip, 'aucune vidéo dans la médiathèque (lancez npm run seed)')
    video = await videoWithPreview(admin(), clip!, unique('carte'))
  })

  test('ordinateur : la carte lance son aperçu seule dès qu’elle est à l’écran, sans survol ; hors de l’écran, rien ; le lien reste cliquable', async ({ page }) => {
    const errors = watchErrors(page)
    await presetConsent(page.context())
    const third = await recordThirdParty(page.context())
    const requests = clipRequests(page.context(), clip!)
    await page.goto('/videos')
    await settle(page)
    const card = cardOf(page, video!.slug)
    // la souris ne bouge pas avant la fin des vérifications : aucun survol
    await expectStartsWhenShown(page, card, requests)

    // la vidéo laisse passer les clics : la carte mène toujours à la fiche
    await card.click()
    await page.waitForURL(`**/videos/${video!.slug}`)
    expect(third, 'requêtes vers d’autres sites').toEqual([])
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('téléphone : sans toucher, la carte arrivée à l’écran lance son aperçu en boucle ; hors de l’écran, rien ; aucune requête tierce', async ({ browser }) => {
    const mobile = await mobileContext(browser)
    try {
      await presetConsent(mobile)
      const third = await recordThirdParty(mobile)
      const requests = clipRequests(mobile, clip!)
      const phone = await mobile.newPage()
      const errors = watchErrors(phone)
      await phone.goto('/videos')
      await settle(phone)
      await expectStartsWhenShown(phone, cardOf(phone, video!.slug), requests)
      expect(third, 'requêtes vers d’autres sites').toEqual([])
      expect(errors, errors.join('\n')).toEqual([])
    } finally {
      await mobile.close()
    }
  })

  test('lecture réelle (extrait WebM) : plusieurs aperçus tournent ensemble et en boucle, sans geste, 3 au plus sur téléphone ; pause hors de l’écran et onglet masqué', async ({ browser }) => {
    const body = webmClip()
    test.skip(!body, 'ffmpeg absent : extrait WebM non fabriqué')
    // quatre autres vidéos à aperçu, juste après la première dans la grille
    others = []
    for (let i = 0; i < 4; i++) others.push(await videoWithPreview(admin(), clip!, unique(`grille-${i}`), 2 + i))
    const desk = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 900 } })
    const mobile = await mobileContext(browser)
    try {
      for (const [context, cap] of [
        [desk, 6],
        [mobile, 3],
      ] as const) {
        await presetConsent(context)
        await serveWebm(context, clip!, body!)
        const page = await context.newPage()
        const errors = watchErrors(page)
        await page.goto('/videos')
        await settle(page)
        const ours = [video!, ...others].map((v) => cardOf(page, v.slug).locator('.media > video.vprev'))
        const grid = page.locator('.vgrid video.vprev')
        await cardOf(page, video!.slug).evaluate((el) => el.scrollIntoView({ block: 'start' }))
        const shown = await halfVisible(grid)
        expect(shown, 'plusieurs cartes à aperçu visibles').toBeGreaterThan(cap === 3 ? 3 : 1)

        // sans aucun geste : plusieurs aperçus tournent ensemble, jamais plus que le plafond
        if (cap === 3) await expect.poll(() => playing(page.locator('video.vprev')), 'plafond sur téléphone').toBe(3)
        else await expect.poll(() => playing(grid), 'plusieurs aperçus en même temps').toBeGreaterThanOrEqual(Math.min(shown, cap))
        await page.waitForTimeout(1_000)
        expect(await playing(page.locator('video.vprev')), 'jamais plus que le plafond').toBeLessThanOrEqual(cap)

        // en continu : un extrait de 2 s qui tourne tourne encore 2,5 s plus tard (boucle), et son image avance
        const continuous = await grid.evaluateAll(async (els) => {
          const v = els.find((el) => !(el as HTMLVideoElement).paused && el.classList.contains('is-on')) as HTMLVideoElement | undefined
          if (!v) return null
          const start = v.currentTime
          await new Promise((resolve) => setTimeout(resolve, 2_500))
          return { loop: v.loop, ended: v.ended, paused: v.paused, advanced: v.currentTime !== start }
        })
        expect(continuous).toEqual({ loop: true, ended: false, paused: false, advanced: true })

        // hors de l'écran : pause, retour à l'image
        await page.evaluate(() => window.scrollTo(0, 0))
        await expect.poll(() => playing(grid), 'grille hors de l’écran : en pause').toBe(0)
        for (const preview of ours) expect(await preview.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

        // onglet masqué (simulé) : tout s'arrête ; de retour, les aperçus visibles reprennent
        await cardOf(page, video!.slug).evaluate((el) => el.scrollIntoView({ block: 'start' }))
        await expect.poll(() => playing(grid)).toBeGreaterThan(0)
        const setHidden = (hidden: boolean) =>
          page.evaluate((h) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
            document.dispatchEvent(new Event('visibilitychange'))
          }, hidden)
        await setHidden(true)
        await expect.poll(() => playing(page.locator('video.vprev')), 'onglet masqué : tout est en pause').toBe(0)
        await setHidden(false)
        await expect.poll(() => playing(grid), 'onglet revenu : reprise').toBeGreaterThan(0)
        expect(errors, errors.join('\n')).toEqual([])
      }
    } finally {
      await desk.close()
      await mobile.close()
    }
  })

  test('« réduire les animations » : aucun aperçu lancé, ni à l’écran, ni au survol, ni sur la fiche', async ({ browser }) => {
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
        for (const preview of await page.locator('video.vprev').all()) expect(await preview.getAttribute('src')).toBeNull()
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

  test('fiche : aperçu en boucle derrière « Lire la vidéo », bouton pause ; façade, consentement et lecteur au clic inchangés', async ({ page }) => {
    const errors = watchErrors(page)
    const third = await recordThirdParty(page.context())
    const requests = clipRequests(page.context(), clip!)
    // extrait lisible par ce navigateur si ffmpeg est là : le bouton pause est alors vérifié
    const body = webmClip()
    if (body) await serveWebm(page.context(), clip!, body)
    await page.goto(`/videos/${video!.slug}`)
    await settle(page)
    const player = page.getByRole('region', { name: /^Lecteur vidéo/ })
    const play = player.getByRole('button', { name: /^Lire la vidéo/ })
    await expect(play).toBeVisible()
    await expect(play).toHaveAccessibleDescription('La lecture charge le lecteur YouTube, qui peut déposer des cookies.')
    await expect(player.locator('iframe')).toHaveCount(0)
    const preview = player.locator('video.vprev')
    await expect(preview).toHaveCount(1)
    // lecteur visible : l'aperçu est lancé seul, en boucle (fichier du site, aucune requête vers YouTube)
    await expect(preview).toHaveAttribute('src', /\/api\/media\/file\//)
    expect(await preview.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop }))).toEqual({ muted: true, loop: true })
    await expect.poll(() => requests.length).toBeGreaterThan(0)
    expect(third, 'rien de YouTube avant le clic').toEqual([])

    // extrait lisible par ce navigateur : bouton pause, puis relance (WCAG 2.2.2), le focus reste sur le bouton
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
      const resume = player.getByRole('button', { name: 'Relancer l’aperçu' })
      await expect(resume).toBeVisible()
      await expect(resume).toBeFocused()
      expect(await preview.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
      // en pause, il ne repart pas seul (défilement, nouveau choix)
      await page.mouse.wheel(0, 40)
      await page.waitForTimeout(800)
      expect(await preview.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
      await resume.click()
      await expect(player.getByRole('button', { name: 'Mettre l’aperçu en pause' })).toBeFocused()
      await expect.poll(() => preview.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
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
