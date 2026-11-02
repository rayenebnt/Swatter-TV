import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { settle, watchErrors } from './helpers'
import { AdminApi, mobileContext, presetConsent, SITE } from './outils-contenus'

/**
 * Vidéo de fond d'une diapositive du carrousel de l'accueil (réglages, « Vidéo de fond ») : une courte boucle muette posée
 * exactement sur la photo (ordinateur, et photo entière du téléphone), qui n'est demandée qu'à l'affichage de sa
 * diapositive, apparaît en fondu en tournant et s'arrête sur une autre diapositive. « Arrêter les aperçus animés » (pied
 * de page) et « réduire les animations » : la photo reste, rien n'est demandé. Le Chromium des tests ne lit pas le H.264 :
 * c'est le fichier d'origine (WebM VP9, léger) que le carrousel lui sert, après la version légère MP4 qu'il refuse.
 * La vidéo est posée sur la dernière diapositive des contenus de départ, puis les réglages sont remis comme avant.
 */

type Slide = { id?: string; video?: number | null } & Record<string, unknown>

/** Mire animée de 4 s en WebM VP9 (lisible par ce navigateur), fabriquée par ffmpeg ; null sans lui. */
function webmClip(): Buffer | null {
  const out = test.info().outputPath('fond-vp9.webm')
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=15:duration=4']
  args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '45', '-deadline', 'realtime', '-cpu-used', '8', '-an', out)
  const run = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', args)
  return run.status === 0 ? readFileSync(out) : null
}

/** Rectangles de la vidéo et de la photo de la diapositive : identiques (au pixel près). */
async function expectOnPhoto(slide: Locator) {
  const [video, photo] = await Promise.all([slide.locator('video.slide__video').boundingBox(), slide.locator('img.slide__photo').boundingBox()])
  expect(video && photo, 'vidéo et photo affichées').toBeTruthy()
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(video![key] - photo![key]), key).toBeLessThanOrEqual(1)
}

test.describe('carrousel de l’accueil : vidéo de fond d’une diapositive', () => {
  test.skip(({ isMobile }) => isMobile, 'réglages partagés : projet « bureau » seulement (le téléphone est vérifié dans un second contexte)')
  test.describe.configure({ mode: 'serial' })
  let admin: AdminApi | null = null
  let before: Slide[] = []
  let video: { id: number; filename: string } | null = null
  let index = -1

  test.beforeAll(async () => {
    admin = await AdminApi.open()
    test.skip(!admin, 'identifiants administrateur indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
    const body = webmClip()
    test.skip(!body, 'ffmpeg absent : pas de vidéo de test')
    const settings = (await (await admin!.send('GET', '/api/globals/settings?depth=0')).json()) as { heroSlides?: Slide[] | null }
    before = settings.heroSlides ?? []
    test.skip(before.length < 2, 'carrousel des contenus de départ absent (npm run seed)')
    video = await admin!.uploadMedia('fond-e2e.webm', 'video/webm', body!, 'Vidéo de fond des tests')
    index = before.length - 1
    const heroSlides = before.map((s, i) => (i === index ? { ...s, video: video!.id } : s))
    const res = await admin!.send('POST', '/api/globals/settings?depth=0', { heroSlides, _status: 'published' })
    expect(res.ok(), `réglages : ${res.status()} ${await res.text()}`).toBe(true)
  })

  test.afterAll(async () => {
    if (!admin) return
    if (before.length) await admin.send('POST', '/api/globals/settings?depth=0', { heroSlides: before, _status: 'published' })
    // version légère et image tirées de la vidéo (préparées par le site), puis la vidéo elle-même (cleanup)
    if (video) {
      for (const prefix of [`fond-m${video.id}`, `video-m${video.id}`]) {
        const res = await admin.send('GET', `/api/media?depth=0&limit=10&where[filename][like]=${prefix}`)
        for (const doc of ((await res.json()) as { docs: { id: number }[] }).docs) await admin.send('DELETE', `/api/media/${doc.id}`)
      }
    }
    await admin.dispose()
  })

  /** Ouvre l'accueil, relève les demandes du fichier vidéo, affiche la diapositive essayée. */
  async function showSlide(page: Page, requests: string[]) {
    page.on('request', (req) => {
      if (video && new URL(req.url()).pathname.endsWith(`/${video.filename}`)) requests.push(req.url())
    })
    await page.goto('/')
    await settle(page)
    const slide = page.locator('.hero .slide').nth(index)
    return slide
  }

  test('ordinateur : demandée seulement à l’affichage de sa diapositive, muette et en boucle, posée sur la photo, en pause ensuite', async ({ page }) => {
    const errors = watchErrors(page)
    await presetConsent(page.context())
    const requests: string[] = []
    const slide = await showSlide(page, requests)
    const player = slide.locator('video.slide__video')
    await expect(player).toHaveAttribute('preload', 'none')
    await expect(player).toHaveAttribute('aria-hidden', 'true')
    // autre diapositive affichée : rien n'est demandé
    expect(requests).toEqual([])
    await page.locator('.hnav button').nth(index).click()
    await expect(slide).toHaveClass(/is-active/)
    await expect(player).toHaveClass(/is-on/, { timeout: 20_000 })
    const state = await player.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop, paused: v.paused, controls: v.controls, src: v.currentSrc }))
    expect(state).toMatchObject({ muted: true, loop: true, paused: false, controls: false })
    expect(state.src).toContain(video!.filename)
    expect(requests.length).toBeGreaterThan(0)
    await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.3)
    await expectOnPhoto(slide)
    // autre diapositive : la vidéo s'arrête
    await page.locator('.hnav button').nth(0).click()
    await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('téléphone : la vidéo tourne aussi, posée sur la photo entière sous l’en-tête', async ({ browser }) => {
    const context = await mobileContext(browser)
    await presetConsent(context)
    const page = await context.newPage()
    const errors = watchErrors(page)
    await page.goto(`${SITE}/`)
    await settle(page)
    const slide = page.locator('.hero .slide').nth(index)
    await page.locator('.hnav button').nth(index).click()
    await expect(slide).toHaveClass(/is-active/)
    const player = slide.locator('video.slide__video')
    await expect(player).toHaveClass(/is-on/, { timeout: 20_000 })
    await expectOnPhoto(slide)
    expect(errors, errors.join('\n')).toEqual([])
    await context.close()
  })

  test('« Arrêter les aperçus animés » puis « réduire les animations » : la photo reste, rien n’est demandé', async ({ page, browser }) => {
    await presetConsent(page.context())
    const requests: string[] = []
    const slide = await showSlide(page, requests)
    const player = slide.locator('video.slide__video')
    await page.locator('.hnav button').nth(index).click()
    await expect(player).toHaveClass(/is-on/, { timeout: 20_000 })
    await page.getByRole('button', { name: 'Arrêter les aperçus animés' }).click()
    await expect(player).not.toHaveClass(/is-on/)
    await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    // choix gardé au rechargement : plus rien n'est demandé
    requests.length = 0
    await page.reload()
    await settle(page)
    await page.locator('.hnav button').nth(index).click()
    await page.waitForTimeout(1500)
    expect(requests).toEqual([])
    await expect(page.locator('.hero .slide').nth(index).locator('video.slide__video')).not.toHaveClass(/is-on/)

    const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
    await presetConsent(reduced)
    const calm = await reduced.newPage()
    const asked: string[] = []
    calm.on('request', (req) => {
      if (video && new URL(req.url()).pathname.endsWith(`/${video.filename}`)) asked.push(req.url())
    })
    await calm.goto(`${SITE}/`)
    await settle(calm)
    await calm.locator('.hnav button').nth(index).click()
    await calm.waitForTimeout(1500)
    expect(asked).toEqual([])
    await expect(calm.locator('.hero .slide').nth(index).locator('video.slide__video')).toBeHidden()
    await reduced.close()
  })
})
