import { expect, test, type APIRequestContext } from '@playwright/test'
import { expectNoHorizontalOverflow, settle, watchErrors } from './helpers'

// Espace membres, sans compte confirmé : accès refusés, inscription, mot de passe oublié, affichage mobile. Un compte ne
// s'active que par le lien de l'e-mail ou par l'administration : le parcours complet d'un membre confirmé (connexion,
// « Ma liste », historique, profil, export, suspension, suppression) est dans admin.spec.ts (connexions administrateur en série).

const ORIGIN = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000').origin
const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

/** Inscription par l'API, comme le formulaire (au moins 3 s après l'affichage, champ piège vide). */
function signup(request: APIRequestContext, email: string, extra: Record<string, unknown> = {}, origin = ORIGIN) {
  return request.post('/api/compte/inscription', {
    headers: { origin },
    data: { firstName: 'Test', email, password: 'mot-de-passe-e2e', consent: true, website: '', elapsed: 5000, ...extra },
  })
}

test('membres : l’espace et les données des membres sont fermés sans connexion', async ({ page, request }) => {
  await page.goto('/compte/ma-liste')
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fcompte%2Fma-liste$/)
  await expect(page.locator('h1')).toHaveText('Connexion')

  const me = await request.get('/api/compte/moi')
  expect(me.status()).toBe(401)
  expect(((await me.json()) as { code?: string }).code).toBe('unauthenticated')
  // collections des membres : jamais lisibles par l'API publique, REST ou GraphQL
  for (const collection of ['members', 'member-history', 'member-favorites']) {
    expect((await request.get(`/api/${collection}`)).status(), collection).toBe(403)
  }
  const gql = await request.post('/api/graphql', { data: { query: '{ Members { docs { email } } }' } })
  expect(((await gql.json()) as { data?: { Members: unknown } }).data?.Members ?? null).toBeNull()
  // export des abonnés : réservé aux administrateurs connectés à /admin
  expect((await request.get('/api/membres/lettre-info.csv')).status()).toBe(403)
  // pas d'exploration par les moteurs de recherche
  const robots = await (await request.get('/robots.txt')).text()
  for (const path of ['/compte', '/connexion', '/inscription', '/mot-de-passe-oublie']) expect(robots).toContain(`Disallow: ${path}`)
})

test('membres : l’API refuse les autres sites, les robots et les champs invalides', async ({ request }) => {
  // requête venue d'un autre site (Origin étranger)
  expect((await signup(request, uniqueEmail('origine'), {}, 'https://autre-site.example')).status()).toBe(403)
  // champ piège rempli ou envoi immédiat : réponse polie, rien n'est créé (connexion ensuite : identifiants inconnus)
  const robot = uniqueEmail('robot')
  expect(await (await signup(request, robot, { elapsed: 200 })).json()).toEqual({ ok: true })
  const login = await request.post('/api/compte/connexion', { headers: { origin: ORIGIN }, data: { email: robot, password: 'mot-de-passe-e2e' } })
  expect(login.status()).toBe(401)
  // champs vérifiés côté serveur
  const invalid = await signup(request, 'pas-une-adresse', { firstName: '', password: 'court', consent: false })
  expect(invalid.status()).toBe(400)
  const { errors } = (await invalid.json()) as { errors: Record<string, string> }
  expect(Object.keys(errors).sort()).toEqual(['consent', 'email', 'firstName', 'password'])
  // une adresse déjà inscrite ne se devine pas : même réponse
  const twice = uniqueEmail('double')
  expect(await (await signup(request, twice)).json()).toEqual({ ok: true })
  expect(await (await signup(request, twice)).json()).toEqual({ ok: true })
})

test('membres : le bouton du compte ramène sur la page d’origine après la connexion', async ({ page, isMobile }) => {
  await page.goto('/agenda')
  if (isMobile) {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion?retour=%2Fagenda')
  } else {
    await expect(page.locator('header').getByRole('link', { name: /Se connecter/ })).toHaveAttribute('href', '/connexion?retour=%2Fagenda')
  }
  // « retour » vers un autre site ou vers l'administration : ignoré (lien « Créer un compte » sans retour)
  for (const retour of ['//autre-site.example', '/\\autre-site.example', '/\t/autre-site.example', '/.//autre-site.example', '/a/..//autre-site.example', '/admin', '/./admin', '/apercu/quitter', 'https://autre-site.example']) {
    await page.goto(`/connexion?retour=${encodeURIComponent(retour)}`)
    await expect(page.getByRole('link', { name: 'Créer un compte gratuit' })).toHaveAttribute('href', '/inscription')
  }
})

test('aperçu : la sortie de l’aperçu ne redirige jamais vers un autre site', async ({ request }) => {
  for (const chemin of ['//autre-site.example', '/\t/autre-site.example', '/\\autre-site.example', '/.//autre-site.example', '/a/..//autre-site.example', 'https://autre-site.example']) {
    const res = await request.get(`/apercu/quitter?chemin=${encodeURIComponent(chemin)}`, { maxRedirects: 0 })
    expect(new URL(res.headers().location ?? '', ORIGIN).origin, chemin).toBe(ORIGIN)
  }
})

test('membres : inscription par le formulaire, puis connexion refusée tant que l’adresse n’est pas confirmée', async ({ page }) => {
  const errors = watchErrors(page)
  const email = uniqueEmail('formulaire')
  await page.goto('/inscription')
  await settle(page)
  await expect(page.locator('h1')).toHaveText('Créer un compte')
  // champs obligatoires vérifiés avant l'envoi, focus sur le premier en erreur
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByLabel('Prénom')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Prénom')).toBeFocused()
  await page.getByLabel('Prénom').fill('Camille')
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
  await page.locator('input[name="password"]').fill('mot-de-passe-e2e')
  await page.getByLabel(/Votre département/).selectOption('savoie')
  await page.getByRole('checkbox', { name: /J’accepte la politique de confidentialité/ }).check()
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByRole('heading', { name: /confirmez votre adresse/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status').filter({ hasText: email })).toBeVisible()

  // connexion avant confirmation : message clair et renvoi possible de l'e-mail
  await page.goto('/connexion')
  await settle(page)
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
  await page.locator('input[name="password"]').fill('mot-de-passe-e2e')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert').filter({ hasText: /Confirmez d’abord/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Renvoyer/ })).toBeVisible()
  // mauvais mot de passe : message générique
  await page.locator('input[name="password"]').fill('pas-le-bon-mot-de-passe')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail ou mot de passe incorrect.' })).toBeVisible()
  expect(errors.filter((e) => !/HTTP (401|403) : \/api\/compte\/connexion/.test(e)), errors.join('\n')).toEqual([])
})

test('membres : mot de passe oublié, même réponse que l’adresse ait un compte ou non', async ({ page, request }) => {
  const errors = watchErrors(page)
  await page.goto('/mot-de-passe-oublie')
  await settle(page)
  await page.getByRole('textbox', { name: /e-mail/i }).fill(uniqueEmail('inconnu'))
  await page.getByRole('button', { name: 'Recevoir un lien' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Si un compte existe' })).toBeVisible({ timeout: 15_000 })
  // lien de nouveau mot de passe invalide : refusé
  const reset = await request.post('/api/compte/nouveau-mot-de-passe', { headers: { origin: ORIGIN }, data: { token: 'x'.repeat(43), password: 'nouveau-mot-de-passe' } })
  expect(reset.status()).toBe(400)
  expect(((await reset.json()) as { code?: string }).code).toBe('invalid')
  expect(errors, errors.join('\n')).toEqual([])
})

test('membres : pages de connexion lisibles sur mobile, sans débordement', async ({ page }) => {
  for (const path of ['/connexion', '/inscription', '/mot-de-passe-oublie']) {
    const errors = watchErrors(page)
    await page.goto(path)
    await settle(page)
    await expectNoHorizontalOverflow(page)
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toMatch(/noindex/)
    expect(errors, `${path}\n${errors.join('\n')}`).toEqual([])
  }
})
