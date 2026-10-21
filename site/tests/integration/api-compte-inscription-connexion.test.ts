// Tests d'intégration de l'inscription et de la connexion des membres (POST /api/compte/inscription et /connexion) :
// compte actif et connecté aussitôt, champs vérifiés côté serveur, robots, requêtes d'un autre site, inscriptions
// fermées, blocage après 5 erreurs (rafales simultanées et adresses inconnues comprises), limites par adresse IP.
import { describe, expect, it } from 'vitest'
import { apiJson, CookieJar, testPayload, unique } from './helpers'
import {
  adminUpdateMember,
  asMember,
  findMember,
  fromIp,
  memberLogin,
  minutesFromNow,
  minutesUntil,
  newEmail,
  newIp,
  PASSWORD,
  setCookies,
  signup,
  writeMember,
} from './api-outils'

type Answer = { ok?: boolean; firstName?: string; error?: string; code?: string; errors?: Record<string, string> }

const GENERIC = 'E-mail ou mot de passe incorrect.'
const EXISTS = 'Un compte existe déjà avec cette adresse : connectez-vous (ou choisissez un nouveau mot de passe si vous l’avez oublié).'
const CONTEXT = { disableRevalidate: true }

/** Formulaire d'inscription tel que l'envoie le navigateur (champ piège vide, 5 s après l'affichage). */
const form = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  firstName: 'Camille',
  email: newEmail(),
  password: PASSWORD,
  website: '',
  elapsed: 5000,
  ...extra,
})

const register = (body: unknown, ip = newIp(), options: { origin?: string | null; headers?: Record<string, string> } = {}) =>
  apiJson<Answer>('/compte/inscription', { body, headers: fromIp(ip, options.headers), origin: options.origin })

const login = (email: unknown, password: unknown, ip = newIp()) => apiJson<Answer>('/compte/connexion', { body: { email, password }, headers: fromIp(ip) })

async function countMembers(email: unknown) {
  if (typeof email !== 'string') return 0
  const payload = await testPayload()
  return (await payload.count({ collection: 'members', where: { email: { equals: email.trim().toLowerCase() } }, overrideAccess: true })).totalDocs
}

describe('inscription', () => {
  it('inscription : prénom, e-mail et mot de passe suffisent ; le compte est actif et le membre connecté aussitôt', async () => {
    const email = newEmail()
    const before = Date.now()
    const res = await register({ firstName: '  Camille ', email: `  ${email.toUpperCase()} `, password: PASSWORD, website: '', elapsed: 5000 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, firstName: 'Camille' })
    expect(res.response.headers.get('cache-control')).toBe('no-store')

    // session : cookie signé, httpOnly, 30 jours ; cookie témoin lisible par le navigateur (affichage seulement)
    const cookies = setCookies(res.response)
    const session = cookies.get('sw_membre')
    expect(session?.value).toMatch(/^v1\.[\w-]+\.[\w-]+$/)
    expect(session?.attributes.has('httponly')).toBe(true)
    expect(session?.attributes.get('samesite')).toBe('Lax')
    expect(session?.attributes.get('path')).toBe('/')
    expect(Number(session?.attributes.get('max-age'))).toBeGreaterThan(30 * 86400 - 60)
    expect(Number(session?.attributes.get('max-age'))).toBeLessThanOrEqual(30 * 86400)
    // site en http pendant les tests : pas d'attribut Secure
    expect(session?.attributes.has('secure')).toBe(false)
    expect(cookies.get('sw_connecte')?.value).toBe('1')
    expect(cookies.get('sw_connecte')?.attributes.has('httponly')).toBe(false)

    const jar = new CookieJar().store(res.response)
    const me = await apiJson('/compte/moi', { cookie: jar.header() })
    expect(me.status).toBe(200)
    expect(me.body).toEqual({
      firstName: 'Camille',
      lastName: '',
      email,
      department: null,
      newsletter: false,
      historyPaused: false,
      createdAt: expect.any(String),
    })

    // fiche : adresse en minuscules, empreinte scrypt (jamais le mot de passe), compte actif, conditions acceptées
    const member = await findMember(email)
    expect(member).toMatchObject({ email, firstName: 'Camille', blocked: false, newsletter: false, sessionVersion: 0 })
    expect(member?.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/)
    expect(member?.passwordHash).not.toContain(PASSWORD)
    for (const date of [member?.consentAt, member?.lastLoginAt]) expect(Date.parse(date ?? '')).toBeGreaterThanOrEqual(before - 1000)
  })

  it('inscription : seuls le prénom, l’e-mail et le mot de passe sont pris en compte (accord e-mail, département, suspension… ignorés)', async () => {
    const email = newEmail()
    const res = await register(
      form({
        email,
        lastName: 'Martin',
        department: 'isere',
        newsletter: true,
        historyPaused: true,
        blocked: true,
        note: 'note glissée par le visiteur',
        sessionVersion: 7,
        loginAttempts: 3,
        passwordHash: 'scrypt$16384$8$1$AAAA$BBBB',
        consentAt: '2000-01-01T00:00:00.000Z',
        role: 'admin',
      }),
    )
    expect(res.status).toBe(200)
    const member = await findMember(email)
    expect(member).toMatchObject({ newsletter: false, historyPaused: false, blocked: false, sessionVersion: 0, loginAttempts: 0 })
    expect(member?.lastName ?? null).toBeNull()
    expect(member?.department ?? null).toBeNull()
    expect(member?.note ?? null).toBeNull()
    expect(member?.passwordHash).not.toBe('scrypt$16384$8$1$AAAA$BBBB')
    expect(Date.parse(member?.consentAt ?? '')).toBeGreaterThan(Date.now() - 60_000)
    // le mot de passe choisi fonctionne
    expect((await login(email, PASSWORD)).status).toBe(200)
  })

  it.each<[string, Record<string, unknown>, string, string]>([
    ['prénom absent', { firstName: undefined }, 'firstName', 'Indiquez votre prénom.'],
    ['prénom d’une seule lettre', { firstName: 'A' }, 'firstName', 'Indiquez votre prénom.'],
    ['prénom fait d’espaces et de caractères de contrôle', { firstName: ' \u0000 B\u0007 ' }, 'firstName', 'Indiquez votre prénom.'],
    ['adresse sans @', { email: 'pas-une-adresse' }, 'email', 'Indiquez une adresse e-mail valide.'],
    ['adresse sans domaine complet', { email: 'jean@exemple' }, 'email', 'Indiquez une adresse e-mail valide.'],
    ['adresse avec deux points de suite', { email: 'jean..dupont@example.com' }, 'email', 'Indiquez une adresse e-mail valide.'],
    ['adresse de plus de 254 caractères', { email: `${'a'.repeat(250)}@example.com` }, 'email', 'Indiquez une adresse e-mail valide.'],
    ['mot de passe de 7 caractères', { password: '1234567' }, 'password', 'Le mot de passe doit contenir au moins 8 caractères.'],
    ['mot de passe qui n’est pas du texte', { password: 12345678 }, 'password', 'Le mot de passe doit contenir au moins 8 caractères.'],
    ['mot de passe de plus de 200 caractères', { password: 'x'.repeat(201) }, 'password', 'Ce mot de passe est trop long.'],
    ['mot de passe qui commence par une espace', { password: ' mot-de-passe' }, 'password', 'Le mot de passe ne doit pas commencer ni finir par une espace.'],
    ['mot de passe qui finit par une espace', { password: 'mot-de-passe ' }, 'password', 'Le mot de passe ne doit pas commencer ni finir par une espace.'],
  ])('inscription : %s → refus (400), message en français sous le champ, rien n’est créé', async (_, extra, field, message) => {
    const body = form(extra)
    const res = await register(body)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ errors: { [field]: message } })
    expect(res.response.headers.getSetCookie()).toEqual([])
    expect(await countMembers(body.email)).toBe(0)
  })

  it('inscription : tous les champs manquants sont signalés ensemble', async () => {
    const res = await register({ website: '', elapsed: 5000 })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.errors ?? {}).sort()).toEqual(['email', 'firstName', 'password'])
  })

  it('inscription : un mot de passe de 8 ou de 200 caractères et une adresse de 254 caractères sont acceptés', async () => {
    for (const password of ['12345678', 'm'.repeat(200)]) {
      const body = form({ password })
      expect((await register(body)).status).toBe(200)
      expect((await login(body.email, password)).status).toBe(200)
    }
    const local = `${unique('long')}`.padEnd(254 - '@example.com'.length, 'a')
    const email = `${local}@example.com`
    expect(email).toHaveLength(254)
    const res = await register(form({ email }))
    expect(res.status).toBe(200)
    expect(await countMembers(email)).toBe(1)
  })

  it.each(['pas du json', '[1, 2]', 'null', '"texte"', ''])('inscription : un corps illisible (%j) est refusé (400)', async (raw) => {
    const res = await register(raw)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Requête illisible.' })
  })

  it('inscription : une adresse déjà inscrite est refusée (code exists), même écrite autrement', async () => {
    const m = await signup()
    for (const email of [m.email, `  ${m.email.toUpperCase()}  `]) {
      const res = await register(form({ email, password: 'un-autre-mot-de-passe' }))
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ errors: { email: EXISTS }, code: 'exists' })
      expect(res.response.headers.getSetCookie()).toEqual([])
    }
    expect(await countMembers(m.email)).toBe(1)
    // le compte existant garde son mot de passe
    expect((await login(m.email, m.password)).status).toBe(200)
    expect((await login(m.email, 'un-autre-mot-de-passe')).status).toBe(401)
  })

  it('inscription : trois inscriptions simultanées avec la même adresse ne créent qu’un compte', async () => {
    const email = newEmail()
    const results = await Promise.all([1, 2, 3].map(() => register(form({ email }))))
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400])
    for (const r of results.filter((x) => x.status === 400)) expect(r.body.code).toBe('exists')
    expect(await countMembers(email)).toBe(1)
  })

  it.each<[string, Record<string, unknown>]>([
    ['champ piège rempli', { website: 'https://spam.example' }],
    ['envoi 2,999 s après l’affichage', { elapsed: 2999 }],
    ['durée nulle', { elapsed: 0 }],
    ['durée négative', { elapsed: -5000 }],
    ['sans durée', { elapsed: undefined }],
    ['durée illisible', { elapsed: 'vite' }],
    ['durée vide', { elapsed: null }],
    ['robot aux champs invalides', { website: 'x', email: 'pas-une-adresse', password: '' }],
  ])('inscription : un robot (%s) reçoit une réponse polie et rien n’est créé', async (_, extra) => {
    const body = form(extra)
    const res = await register(body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(res.response.headers.getSetCookie()).toEqual([])
    expect(await countMembers(body.email)).toBe(0)
  })

  it('inscription : envoyée 3 s après l’affichage (durée en nombre ou en texte), elle est acceptée', async () => {
    for (const elapsed of [3000, '5000']) {
      const body = form({ elapsed })
      const res = await register(body)
      expect(res.body).toEqual({ ok: true, firstName: 'Camille' })
      expect(await countMembers(body.email)).toBe(1)
    }
  })

  it.each<[string, { origin?: string | null; headers?: Record<string, string> }]>([
    ['un autre site (en-tête Origin)', { origin: 'https://autre-site.example' }],
    ['un site qui imite l’adresse du site', { origin: 'http://localhost:3000.autre-site.example' }],
    ['une origine opaque (Origin: null)', { origin: 'null' }],
    ['un autre site sans Origin (Sec-Fetch-Site: cross-site)', { origin: null, headers: { 'sec-fetch-site': 'cross-site' } }],
    ['un site voisin sans Origin (Sec-Fetch-Site: same-site)', { origin: null, headers: { 'sec-fetch-site': 'same-site' } }],
  ])('inscription : refusée depuis %s (403), rien n’est créé', async (_, options) => {
    const body = form()
    const res = await register(body, newIp(), options)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Requête refusée.' })
    expect(await countMembers(body.email)).toBe(0)
  })

  it('inscription : acceptée sans Origin quand le navigateur indique une requête du site (Sec-Fetch-Site)', async () => {
    for (const site of ['same-origin', 'none']) {
      const body = form()
      expect((await register(body, newIp(), { origin: null, headers: { 'sec-fetch-site': site } })).status).toBe(200)
      expect(await countMembers(body.email)).toBe(1)
    }
  })

  it('inscription : fermée dans les réglages publiés, elle est refusée (code closed) ; rouverte, elle reprend', async () => {
    const payload = await testPayload()
    const already = await signup()
    try {
      // un brouillon des réglages (enregistrement automatique) ne ferme rien : seule la version publiée compte
      await payload.updateGlobal({ slug: 'settings', draft: true, data: { members: { signupOpen: false } }, context: CONTEXT })
      expect((await register(form())).status).toBe(200)

      await payload.updateGlobal({ slug: 'settings', data: { members: { signupOpen: false }, _status: 'published' }, context: CONTEXT })
      const body = form()
      const res = await register(body)
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Les inscriptions sont momentanément fermées. Revenez bientôt !', code: 'closed' })
      expect(res.response.headers.getSetCookie()).toEqual([])
      expect(await countMembers(body.email)).toBe(0)
      // les membres déjà inscrits se connectent normalement
      expect((await memberLogin(already)).status).toBe(200)
    } finally {
      await payload.updateGlobal({ slug: 'settings', data: { members: { signupOpen: true }, _status: 'published' }, context: CONTEXT })
    }
    expect((await register(form())).status).toBe(200)
  })
})

describe('connexion', () => {
  it('connexion : les bons identifiants ouvrent une session (adresse insensible à la casse et aux espaces)', async () => {
    const m = await signup()
    const signedUp = await findMember(m.email)
    const res = await login(`  ${m.email.toUpperCase()} `, m.password)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, firstName: 'Camille' })
    const cookies = setCookies(res.response)
    expect(cookies.get('sw_membre')?.value).toMatch(/^v1\./)
    expect(cookies.get('sw_membre')?.attributes.has('httponly')).toBe(true)
    expect(cookies.get('sw_connecte')?.value).toBe('1')
    const jar = new CookieJar().store(res.response)
    expect((await apiJson('/compte/moi', { cookie: jar.header() })).body).toMatchObject({ email: m.email, firstName: 'Camille' })
    const after = await findMember(m.email)
    expect(Date.parse(after?.lastLoginAt ?? '')).toBeGreaterThan(Date.parse(signedUp?.lastLoginAt ?? ''))
    expect(after?.loginAttempts).toBe(0)
  })

  it('connexion : mauvais mot de passe et adresse inconnue reçoivent exactement la même réponse (401)', async () => {
    const m = await signup()
    const wrong = await login(m.email, 'pas-le-bon-mot-de-passe')
    const unknown = await login(newEmail('inconnu'), 'pas-le-bon-mot-de-passe')
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: GENERIC })
      expect(res.response.headers.getSetCookie()).toEqual([])
    }
  })

  it('connexion : un mot de passe ou une adresse vides répondent 401 sans compter d’essai', async () => {
    const m = await signup()
    const ip = newIp()
    for (const password of ['', undefined, null, 12345678, ['x']]) {
      const res = await login(m.email, password, ip)
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: GENERIC })
    }
    for (const email of ['', '   ', undefined]) expect((await login(email, m.password, ip)).body).toEqual({ error: GENERIC })
    // aucune de ces tentatives n'a compté : le compte n'est pas bloqué
    expect((await findMember(m.email))?.loginAttempts).toBe(0)
    expect((await login(m.email, m.password, ip)).status).toBe(200)
  })

  it('connexion : un mot de passe accentué est reconnu quelle que soit sa forme Unicode (NFC ou NFD)', async () => {
    const m = await signup({ password: 'Mot de passe : café crème'.normalize('NFC') })
    expect((await login(m.email, m.password.normalize('NFD'))).status).toBe(200)
  })

  it('connexion : 5 mauvais mots de passe bloquent le compte 15 minutes ; même le bon est alors refusé (429 locked)', async () => {
    const m = await signup()
    for (let i = 0; i < 5; i++) expect((await login(m.email, `faux-mot-de-passe-${i}`)).status).toBe(401)
    const res = await login(m.email, m.password)
    expect(res.status).toBe(429)
    expect(res.body).toEqual({
      error: 'Trop d’essais : la connexion à ce compte est bloquée pendant 15 minutes. Vous pouvez aussi choisir un nouveau mot de passe.',
      code: 'locked',
    })
    expect(res.response.headers.getSetCookie()).toEqual([])
    const locked = await findMember(m.email)
    expect(minutesUntil(locked?.lockUntil)).toBeGreaterThan(14)
    expect(minutesUntil(locked?.lockUntil)).toBeLessThanOrEqual(15.1)

    // blocage échu : le bon mot de passe passe et remet tout à zéro
    await writeMember(m.id, { lockUntil: minutesFromNow(-1) })
    expect((await login(m.email, m.password)).status).toBe(200)
    expect(await findMember(m.email)).toMatchObject({ loginAttempts: 0, lockUntil: null })
  })

  it('connexion : au 5e essai, le bon mot de passe passe encore et remet le compteur à zéro', async () => {
    const m = await signup()
    for (let i = 0; i < 4; i++) expect((await login(m.email, 'mauvais-mot-de-passe')).status).toBe(401)
    expect((await login(m.email, m.password)).status).toBe(200)
    // compteur remis à zéro : quatre nouvelles erreurs ne bloquent pas
    for (let i = 0; i < 4; i++) expect((await login(m.email, 'mauvais-mot-de-passe')).status).toBe(401)
    expect((await login(m.email, m.password)).status).toBe(200)
  })

  it('connexion : 10 erreurs envoyées en même temps — 5 sont vérifiées, les 5 autres trouvent le compte déjà bloqué', async () => {
    const m = await signup()
    const ip = newIp()
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => login(m.email, `rafale-mot-de-passe-${i}`, ip)))
    expect(results.filter((r) => r.status === 401)).toHaveLength(5)
    const blocked = results.filter((r) => r.status === 429)
    expect(blocked).toHaveLength(5)
    for (const r of blocked) expect(r.body.code).toBe('locked')
    expect((await login(m.email, m.password)).status).toBe(429)
  })

  it('connexion : une adresse inconnue répond comme un vrai compte (mêmes codes et messages, blocage au bout de 5 erreurs)', async () => {
    const m = await signup()
    const sequence = async (email: string) => {
      const out: { status: number; body: Answer }[] = []
      for (let i = 0; i < 6; i++) {
        const res = await login(email, 'mauvais-mot-de-passe')
        out.push({ status: res.status, body: res.body })
      }
      return out
    }
    const real = await sequence(m.email)
    expect(real.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 429])
    expect(await sequence(newEmail('inconnu'))).toEqual(real)
  })

  it('connexion : une rafale d’erreurs sur une adresse inconnue est bloquée de la même façon', async () => {
    const email = newEmail('inconnu')
    const ip = newIp()
    const results = await Promise.all(Array.from({ length: 10 }, () => login(email, 'mauvais-mot-de-passe', ip)))
    expect(results.filter((r) => r.status === 401)).toHaveLength(5)
    expect(results.filter((r) => r.status === 429 && r.body.code === 'locked')).toHaveLength(5)
  })

  it('connexion : un compte suspendu est refusé (403 blocked) sans le révéler à qui n’a pas le mot de passe', async () => {
    const m = await signup()
    const oldSession = m.jar.header()
    await adminUpdateMember(m.id, { blocked: true })
    // ses sessions en cours sont fermées
    expect((await apiJson('/compte/moi', { cookie: oldSession })).status).toBe(401)

    const res = await login(m.email, m.password)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Ce compte a été suspendu. Écrivez-nous si vous pensez qu’il s’agit d’une erreur.', code: 'blocked' })
    expect(res.response.headers.getSetCookie()).toEqual([])
    // sans le bon mot de passe : la réponse habituelle, rien ne dit que le compte est suspendu
    expect(await login(m.email, 'mauvais-mot-de-passe')).toMatchObject({ status: 401, body: { error: GENERIC } })

    // compte rétabli : il se reconnecte, mais ses anciennes sessions restent fermées
    await adminUpdateMember(m.id, { blocked: false })
    expect((await login(m.email, m.password)).status).toBe(200)
    expect((await apiJson('/compte/moi', { cookie: oldSession })).status).toBe(401)
  })

  it('connexion : refusée depuis un autre site (403) ; un corps illisible est refusé (400)', async () => {
    const m = await signup()
    const other = await apiJson<Answer>('/compte/connexion', {
      body: { email: m.email, password: m.password },
      origin: 'https://autre-site.example',
      headers: fromIp(newIp()),
    })
    expect(other.status).toBe(403)
    expect(other.body).toEqual({ error: 'Requête refusée.' })
    expect(other.response.headers.getSetCookie()).toEqual([])
    for (const raw of ['pas du json', '[]', 'null']) {
      const res = await apiJson<Answer>('/compte/connexion', { body: raw, headers: fromIp(newIp()) })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Requête illisible.' })
    }
  })
})

describe('limites par adresse IP', () => {
  it('limites : l’adresse comptée est le dernier maillon de X-Forwarded-For, que le visiteur ne peut pas changer', async () => {
    const proxy = newIp()
    // « mot de passe oublié » : 5 demandes par quart d'heure et par adresse
    const forgot = (chain: string) => apiJson<Answer>('/compte/mot-de-passe-oublie', { body: { email: '' }, headers: { 'x-forwarded-for': chain } })
    for (let i = 0; i < 5; i++) expect((await forgot(`203.0.113.${i + 1}, ${proxy}`)).status).toBe(200)
    // premier maillon changé (il vient du visiteur) : c'est toujours la même adresse qui est comptée
    const res = await forgot(`198.51.100.77, ${proxy}`)
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Trop de demandes depuis votre connexion : réessayez dans quelques minutes.' })
    expect((await forgot(proxy)).status).toBe(429)
    // une autre adresse (dernier maillon) n'est pas touchée
    expect((await forgot(`${proxy}, ${newIp()}`)).status).toBe(200)
  })

  it('limites : 10 inscriptions par heure et par adresse IP, pas une de plus (les autres adresses ne sont pas touchées)', async () => {
    const ip = newIp()
    for (let i = 0; i < 10; i++) expect((await register(form(), ip)).status).toBe(200)
    const body = form()
    const res = await register(body, ip)
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/depuis votre connexion : réessayez dans quelques minutes\.$/)
    expect(await countMembers(body.email)).toBe(0)
    expect((await register(form(), newIp())).status).toBe(200)
  })

  it('limites : les essais sur une adresse déjà inscrite comptent aussi (on ne sonde pas les adresses sans fin)', async () => {
    const taken = await signup()
    const ip = newIp()
    for (let i = 0; i < 10; i++) expect((await register(form({ email: taken.email }), ip)).body.code).toBe('exists')
    expect((await register(form({ email: taken.email }), ip)).status).toBe(429)
    expect((await register(form(), ip)).status).toBe(429)
  })

  it('limites : le message de la limite d’inscriptions est en bon français (« Trop d’inscriptions »)', async () => {
    const taken = await signup()
    const ip = newIp()
    for (let i = 0; i < 10; i++) await register(form({ email: taken.email }), ip)
    const res = await register(form(), ip)
    expect(res.status).toBe(429)
    expect(res.body.error).toBe('Trop d’inscriptions depuis votre connexion : réessayez dans quelques minutes.')
  })

  it('limites : 30 essais de connexion par quart d’heure et par adresse IP, puis 429 (le compte, lui, n’est pas bloqué)', async () => {
    const m = await signup()
    const ip = newIp()
    // mots de passe vides : aucun essai compté sur le compte, seulement sur l'adresse IP
    const results = await Promise.all(Array.from({ length: 30 }, () => login(m.email, '', ip)))
    expect(results.every((r) => r.status === 401)).toBe(true)
    const res = await login(m.email, m.password, ip)
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Trop de tentatives depuis votre connexion : réessayez dans quelques minutes.' })
    expect((await login(m.email, m.password, newIp())).status).toBe(200)
  })

  it('limites : 20 essais de lien « nouveau mot de passe » par quart d’heure et par adresse IP', async () => {
    const ip = newIp()
    const attempt = () =>
      apiJson<Answer>('/compte/nouveau-mot-de-passe', { body: { token: 'lien-inventé', password: 'nouveau-mot-de-passe' }, headers: fromIp(ip) })
    for (let i = 0; i < 20; i++) expect((await attempt()).body.code).toBe('invalid')
    const res = await attempt()
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Trop de tentatives depuis votre connexion : réessayez dans quelques minutes.' })
  })

  it('limites : 10 changements de mot de passe par quart d’heure et par adresse IP', async () => {
    const m = await signup()
    const ip = { ip: newIp() }
    for (let i = 0; i < 10; i++) {
      const res = await asMember(ip, m.jar, '/compte/mot-de-passe', { body: { current: m.password, password: 'court' } })
      expect(res.status).toBe(400)
    }
    const res = await asMember(ip, m.jar, '/compte/mot-de-passe', { body: { current: m.password, password: 'nouveau-mot-de-passe' } })
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Trop de tentatives depuis votre connexion : réessayez dans quelques minutes.' })
    // le mot de passe n'a pas changé
    expect((await login(m.email, m.password)).status).toBe(200)
  })

  it('limites : 10 demandes de suppression de compte par quart d’heure et par adresse IP', async () => {
    const ip = { ip: newIp() }
    const members = await Promise.all([1, 2, 3, 4, 5].map(() => signup()))
    // deux erreurs par membre (sous la limite de 5 essais par membre) : 10 demandes depuis la même adresse
    for (const m of members) {
      for (let i = 0; i < 2; i++) expect((await asMember(ip, m.jar, '/compte/supprimer', { body: { password: 'mauvais-mot-de-passe' } })).status).toBe(400)
    }
    const res = await asMember(ip, members[0].jar, '/compte/supprimer', { body: { password: members[0].password } })
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Trop de tentatives depuis votre connexion : réessayez dans quelques minutes.' })
    expect(await findMember(members[0].email)).not.toBeNull()
  })
})
