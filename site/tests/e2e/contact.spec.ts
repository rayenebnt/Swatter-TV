import { expect, test } from '@playwright/test'
import { settle, watchErrors } from './helpers'

// Formulaire « Proposer une info » (/contact) : bouton d'accès et vérification des champs. L'envoi complet, qui
// demande un compte administrateur pour relire « Messages reçus », est testé dans admin.spec.ts (connexions en série :
// deux connexions simultanées au même compte peuvent s'écraser).

test('contact : le bouton « Proposer une info » remplace « Se connecter »', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Ouvrir le menu' }).first().click()
  const cta = (isMobile ? page.getByRole('dialog', { name: 'Menu' }) : page.locator('header')).getByRole('link', { name: 'Proposer une info' })
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('href', '/contact')
  await expect(page.getByRole('link', { name: 'Se connecter' })).toHaveCount(0)
})

test('contact : les champs obligatoires sont vérifiés avant l’envoi', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/contact?sujet=publicite')
  await settle(page)
  await expect(page.locator('h1')).toContainText('Proposer une info')
  await expect(page.getByRole('radio', { name: /publicité/i })).toBeChecked()
  await page.getByRole('button', { name: 'Envoyer à la rédaction' }).click()
  await expect(page.locator('.contact-err')).toHaveCount(4)
  await expect(page.getByLabel(/Nom et prénom/)).toBeFocused()
  await page.getByLabel(/Nom et prénom/).fill('Camille')
  await page.getByLabel(/^E-mail/).fill('pas-une-adresse')
  await page.getByRole('button', { name: 'Envoyer à la rédaction' }).click()
  await expect(page.getByLabel(/^E-mail/)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel(/Nom et prénom/)).not.toHaveAttribute('aria-invalid', 'true')
  expect(errors, errors.join('\n')).toEqual([])
})

test('contact : l’API refuse un message incomplet et ignore les robots', async ({ request }) => {
  const incomplete = await request.post('/api/contact', { data: { subject: 'info', name: 'A', email: 'x', message: 'court', shownAt: Date.now() - 10_000 } })
  expect(incomplete.status()).toBe(400)
  const { errors } = (await incomplete.json()) as { errors: Record<string, string> }
  expect(Object.keys(errors).sort()).toEqual(['consent', 'email', 'message', 'name'])
  // envoi direct, sans passer par le formulaire : réponse polie, rien n'est enregistré
  const robot = await request.post('/api/contact', {
    data: { subject: 'info', name: 'Robot Test', email: 'robot@example.com', message: 'Message automatique de test.', consent: true },
  })
  expect(await robot.json()).toEqual({ ok: true })
  // (rien n'est enregistré : vérifié par admin.spec.ts, qui seul se connecte en administrateur)
})
