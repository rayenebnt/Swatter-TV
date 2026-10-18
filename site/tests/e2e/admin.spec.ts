import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { watchErrors } from './helpers'

/**
 * Administration pensée pour une équipe non technique : tableau de bord, aide intégrée, outil de la grille
 * et rubriques techniques masquées aux éditeurs. Identifiants : E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * (par défaut ceux du poste de développement, voir README) ; sans compte valide, ces tests sont ignorés.
 */
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin@swatter-tv.fr',
  password: process.env.E2E_ADMIN_PASSWORD || 'swatter-admin-2026',
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/admin/login')
  await page.fill('input[name="email"]', account.email)
  await page.fill('input[name="password"]', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

async function adminHeaders(request: APIRequestContext) {
  const res = await request.post('/api/users/login', { data: ADMIN })
  const { token } = (await res.json()) as { token: string }
  return { Authorization: `JWT ${token}` }
}

test.describe('administration', () => {
  test.skip(({ isMobile }) => isMobile, 'parcours de l’administration : sur ordinateur')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/users/login', { data: ADMIN })
    test.skip(!res.ok(), 'identifiants administrateur de test indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
  })

  test('tableau de bord : actions courantes et état du site', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ADMIN)
    await expect(page.getByRole('heading', { level: 1, name: /^Bon(jour|soir)/ })).toBeVisible()
    for (const action of ['Publier une vidéo', 'Écrire une info', 'Ajouter une sortie', 'Mettre un replay en ligne']) {
      await expect(page.getByRole('link', { name: new RegExp(action) })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Sur le site en ce moment' })).toBeVisible()
    expect(await page.locator('.sw-status__row').count()).toBeGreaterThanOrEqual(8)
    await expect(page.getByRole('heading', { name: 'Derniers contenus modifiés' })).toBeVisible()

    await page.getByRole('link', { name: /Publier une vidéo/ }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/videos\/create/)
    // formulaire en français simple : pas de « Créer un(e) nouveau ou nouvelle », dates au format français
    await expect(page.getByText('Nouvelle fiche : Vidéo')).toBeVisible()
    await expect(page.getByText('Où se trouve la vidéo ?')).toBeVisible()
    await expect(page.locator('.date-time-picker input').first()).toHaveValue(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    expect(errors).toEqual([])
  })

  test('aide : le guide s’affiche et le sommaire mène aux parties', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ADMIN)
    await page.goto('/admin/aide')
    await expect(page.getByRole('heading', { level: 1, name: /Guide de l’administration/ })).toBeVisible()
    await page.locator('.sw-doc ol').first().getByRole('link').nth(3).click()
    await expect(page).toHaveURL(/#4-/)
    await expect(page.locator('.sw-doc h2').nth(4)).toBeInViewport()
    expect(errors).toEqual([])
  })

  test('grille des programmes : semaine en cours et filtre par jour', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ADMIN)
    await page.goto('/admin/collections/schedule')
    await expect(page).toHaveURL(/where/)
    await expect(page.locator('.sw-week__title')).toHaveText(/^Semaine du lundi/)
    await expect(page.locator('.sw-week__count')).toContainText(/créneau/)
    const wednesday = page.locator('.sw-day').nth(3)
    await wednesday.click()
    await expect(wednesday).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.sw-week__count')).toContainText(/mercredi/)
    expect(errors).toEqual([])
  })

  test('recopie de semaine : refus clairs sans compte ou sans créneau à recopier', async ({ request }) => {
    expect((await request.post('/api/schedule/copy-week', { data: { from: '2026-01-05' } })).status()).toBe(401)
    const headers = await adminHeaders(request)
    const invalid = await request.post('/api/schedule/copy-week', { headers, data: { from: 'lundi' } })
    expect(invalid.status()).toBe(400)
    // une semaine lointaine, forcément vide : rien n'est modifié
    const empty = await request.post('/api/schedule/copy-week', { headers, data: { from: '2099-06-01' } })
    expect(empty.status()).toBe(400)
    expect(((await empty.json()) as { error: string }).error).toMatch(/ne contient aucun créneau/)
  })

  test('éditeur : rubriques techniques masquées, compte personnel accessible', async ({ page, request }) => {
    const headers = await adminHeaders(request)
    const account = { email: 'e2e-editeur@swatter-tv.fr', password: 'e2e-editeur-2026!' }
    const previous = (await (await request.get(`/api/users?where[email][equals]=${encodeURIComponent(account.email)}&depth=0`, { headers })).json()) as {
      docs: { id: number }[]
    }
    for (const user of previous.docs) await request.delete(`/api/users/${user.id}`, { headers })
    const created = await request.post('/api/users', { headers, data: { ...account, role: 'editeur', name: 'Dominique Testeur' } })
    expect(created.ok()).toBe(true)
    const { doc } = (await created.json()) as { doc: { id: number } }
    try {
      await login(page, account)
      await expect(page.getByRole('heading', { level: 1, name: /Dominique/ })).toBeVisible()
      const nav = page.locator('.nav__wrap')
      await expect(nav.getByText('Publier', { exact: true })).toHaveCount(1)
      await expect(nav.getByText('Administration', { exact: true })).toHaveCount(0)
      await page.goto('/admin/collections/users')
      await expect(page.getByText('Rien n’a été trouvé')).toBeVisible()
      await page.goto('/admin/account')
      await expect(page.getByText('Changer le mot de passe')).toBeVisible()
    } finally {
      await request.delete(`/api/users/${doc.id}`, { headers })
    }
  })
})
