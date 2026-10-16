import { expect, test } from '@playwright/test'
import { firstDoc, settle, watchErrors } from './helpers'

test.describe('recherche', () => {
  test('s’ouvre avec la touche « / » et se ferme avec Échap', async ({ page, isMobile }) => {
    test.skip(isMobile, 'raccourci clavier : bureau uniquement')
    await page.goto('/')
    await settle(page)
    const dialog = page.getByRole('dialog', { name: /recherche/i })
    // le raccourci n'est actif qu'après l'hydratation : on réessaie quelques instants
    await expect(async () => {
      if (!(await dialog.isVisible())) await page.keyboard.press('/')
      await expect(dialog).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    const input = dialog.getByRole('searchbox')
    await expect(input).toBeFocused()
    await input.fill('annecy')
    await expect(dialog.getByRole('link').or(dialog.getByRole('option')).first()).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('la page de résultats affiche des contenus', async ({ page }) => {
    await page.goto('/recherche?q=annecy')
    await expect(page.locator('main')).toContainText(/annecy/i)
  })
})

test('la bannière cookies mémorise le choix', async ({ page }) => {
  await page.goto('/')
  const banner = page.getByRole('dialog', { name: /cookies/i })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.getByRole('button', { name: /accepter/i }).click()
  await expect(banner).toBeHidden()
  await page.reload()
  await settle(page)
  await page.waitForTimeout(2_000)
  await expect(banner).toBeHidden()
})

test('le menu mobile s’ouvre et se ferme', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'menu mobile uniquement')
  await page.goto('/')
  await settle(page)
  const drawer = page.getByRole('dialog', { name: /menu/i })
  const toggle = page.getByRole('button', { name: /menu/i }).filter({ visible: true }).first()
  await expect(async () => {
    if (!(await drawer.isVisible())) await toggle.click()
    await expect(drawer).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await expect(drawer.getByRole('link', { name: /info/i }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})

test('le lecteur s’affiche sur une page vidéo', async ({ page, request }) => {
  const video = await firstDoc(request, 'videos')
  test.skip(!video?.slug, 'aucune vidéo (lancez npm run seed)')
  const errors = watchErrors(page)
  await page.goto(`/videos/${video!.slug}`)
  await settle(page)
  const player = page.locator('video, iframe[src*="youtube"], iframe[src*="mediadelivery"]')
  if ((await player.count()) === 0) {
    // lecteur « clic pour lire » : affiche une affiche et un bouton de lecture
    await page.getByRole('button', { name: /lire|lecture|regarder|play/i }).first().click()
  }
  await expect(player.first()).toBeVisible({ timeout: 15_000 })
  expect(errors, errors.join('\n')).toEqual([])
})
