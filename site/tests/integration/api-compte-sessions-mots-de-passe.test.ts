// Tests d'intégration des sessions des membres et de leurs mots de passe : cookie signé (refusé s'il est modifié, d'une
// autre version ou périmé), déconnexion (ici ou partout), mot de passe oublié et lien à usage unique (expiré, envoyé deux
// fois en même temps, compte suspendu), changement de mot de passe, profil (écriture partielle), et ce que l'équipe peut
// (ou ne peut pas) faire des fiches des membres par l'API de Payload.
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { signSession } from '@/lib/members/crypto'
import { adminToken, api, apiJson, CookieJar, editorToken, testPayload, type ApiOptions } from './helpers'
import {
  adminUpdateMember,
  asMember,
  clearsSession,
  findMember,
  fromIp,
  memberById,
  memberLogin,
  minutesUntil,
  newEmail,
  newIp,
  setCookies,
  signup,
  writeMember,
  type TestMember,
} from './api-outils'

type Answer = { ok?: boolean; firstName?: string; error?: string; code?: string; errors?: Record<string, string> }
type Mail = { to: string; subject: string; html: string; text: string }

const UNAUTHENTICATED = { error: 'Connectez-vous pour accéder à votre espace.', code: 'unauthenticated' }
const EXPIRED = { error: 'Votre session a expiré : reconnectez-vous.', code: 'unauthenticated' }
const INVALID_LINK = { error: 'Ce lien n’est plus valable (il sert une seule fois, pendant une heure). Faites une nouvelle demande.', code: 'invalid' }
const NEW_PASSWORD = 'nouveau-mot-de-passe-des-tests'

let payload: Payload
let sendEmail: MockInstance

beforeEach(async () => {
  payload = await testPayload()
  // e-mails espionnés (sans SMTP, Payload les écrit seulement dans le journal)
  sendEmail = vi.spyOn(payload, 'sendEmail')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** E-mails envoyés à `email` depuis le début du test. */
const mailsTo = (email: string): Mail[] => sendEmail.mock.calls.map(([mail]) => mail as Mail).filter((mail) => mail.to === email)

const login = (email: string, password: string) => memberLogin({ email, password })

const forgot = (email: unknown, ip = newIp()) => apiJson<Answer>('/compte/mot-de-passe-oublie', { body: { email }, headers: fromIp(ip) })

/** « Mot de passe oublié » pour ce membre : jeton du lien reçu par e-mail. */
async function requestReset(m: Pick<TestMember, 'email'>): Promise<string> {
  const before = mailsTo(m.email).length
  expect((await forgot(m.email)).body).toEqual({ ok: true })
  await vi.waitFor(() => expect(mailsTo(m.email)).toHaveLength(before + 1))
  const token = mailsTo(m.email)
    .at(-1)
    ?.text.match(/\/compte\/nouveau-mot-de-passe\?token=([\w-]+)/)?.[1]
  if (!token) throw new Error('Lien introuvable dans l’e-mail')
  return token
}

const reset = (token: unknown, password: unknown, jar = new CookieJar()) =>
  apiJson<Answer>('/compte/nouveau-mot-de-passe', { body: { token, password }, headers: fromIp(newIp()), cookie: jar.header() }).then((res) => {
    jar.store(res.response)
    return { ...res, jar }
  })

/** Attend la fin de la recherche du compte faite après la réponse de « mot de passe oublié » (espion de payload.find). */
async function settleLookup(find: MockInstance, email: string) {
  const index = find.mock.calls.findIndex(([args]) => (args as { collection?: string }).collection === 'members' && JSON.stringify(args).includes(email))
  expect(index).toBeGreaterThanOrEqual(0)
  await find.mock.results[index]?.value
  // la suite de la tâche (rien, pour une adresse inconnue ou un compte suspendu) se termine aussitôt
  await new Promise((resolve) => setTimeout(resolve, 50))
}

describe('sessions', () => {
  it('sessions : sans cookie, l’espace et ses actions sont fermés (401), sans cookie à effacer', async () => {
    const routes: [string, ApiOptions][] = [
      ['/compte/moi', {}],
      ['/compte/profil', { method: 'PATCH', body: { lastName: 'Martin' } }],
      ['/compte/mot-de-passe', { body: { current: 'x', password: NEW_PASSWORD } }],
      ['/compte/historique', { body: { kind: 'video', id: 1 } }],
      ['/compte/historique', { method: 'DELETE' }],
      ['/compte/favoris?kind=video&id=1', {}],
      ['/compte/favoris', { body: { kind: 'video', id: 1 } }],
      ['/compte/favoris?kind=video&id=1', { method: 'DELETE' }],
      ['/compte/export', {}],
      ['/compte/supprimer', { body: { password: 'x' } }],
    ]
    for (const [path, options] of routes) {
      const res = await apiJson(path, { ...options, headers: fromIp(newIp()) })
      expect(res.status, path).toBe(401)
      expect(res.body, path).toEqual(UNAUTHENTICATED)
      expect(res.response.headers.getSetCookie(), path).toEqual([])
    }
  })

  it('sessions : un cookie modifié, signé pour une autre version de session ou périmé est refusé (401) et effacé', async () => {
    const m = await signup()
    const other = await signup()
    const value = m.jar.get('sw_membre') ?? ''
    const [, body, sig] = value.split('.')
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as { m: number; s: number; e: number }
    const forged = (c: object) => `v1.${Buffer.from(JSON.stringify(c)).toString('base64url')}.${sig}`
    const variants: Record<string, string> = {
      'données changées pour un autre membre': forged({ ...claims, m: other.id }),
      'date de fin repoussée': forged({ ...claims, e: claims.e + 365 * 86400 }),
      'signature modifiée': `v1.${body}.${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`,
      'signature absente': `v1.${body}.`,
      'autre version du format': `v2.${body}.${sig}`,
      'valeur quelconque': 'abc',
      'signée pour une autre version de session': signSession(m.id, claims.s + 1).value,
      'signée mais périmée': signSession(m.id, claims.s, Date.now() - 31 * 86400_000).value,
    }
    for (const [label, cookie] of Object.entries(variants)) {
      const res = await apiJson('/compte/moi', { cookie: `sw_membre=${cookie}; sw_connecte=1` })
      expect(res.status, label).toBe(401)
      expect(res.body, label).toEqual(EXPIRED)
      expect(clearsSession(res.response), label).toBe(true)
    }
    // le vrai cookie reste valable, et ne donne accès qu'à son propre compte (réponse jamais mise en cache)
    const me = await apiJson('/compte/moi', { cookie: m.jar.header() })
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ email: m.email })
    expect(me.response.headers.get('cache-control')).toBe('no-store')
  })

  it('sessions : le cookie témoin seul ne donne aucun accès', async () => {
    const res = await apiJson('/compte/moi', { cookie: 'sw_connecte=1' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual(EXPIRED)
    expect(clearsSession(res.response)).toBe(true)
  })

  it('sessions : la déconnexion efface les deux cookies (les autres appareils restent connectés)', async () => {
    const m = await signup()
    const phone = await login(m.email, m.password)
    const res = await asMember(m, m.jar, '/compte/deconnexion', { body: {} })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(clearsSession(res.response)).toBe(true)
    expect(setCookies(res.response).get('sw_membre')?.attributes.has('httponly')).toBe(true)
    expect(m.jar.header()).toBe('')
    expect((await asMember(m, m.jar, '/compte/moi')).body).toEqual(UNAUTHENTICATED)
    // simple déconnexion : l'autre appareil garde sa session
    expect((await asMember(m, phone.jar, '/compte/moi')).status).toBe(200)
    expect((await findMember(m.email))?.sessionVersion).toBe(0)
  })

  it('sessions : « se déconnecter partout » ferme toutes les sessions du membre, pas celles des autres membres', async () => {
    const m = await signup()
    const phone = await login(m.email, m.password)
    const someoneElse = await signup()
    const res = await asMember(m, phone.jar, '/compte/deconnexion', { body: { partout: true } })
    expect(res.status).toBe(200)
    expect(clearsSession(res.response)).toBe(true)
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(401)
    expect((await asMember(someoneElse, someoneElse.jar, '/compte/moi')).status).toBe(200)
    expect((await findMember(m.email))?.sessionVersion).toBe(1)

    // nouvelle connexion possible ; « ?partout=1 » ferme aussi tout
    const again = await login(m.email, m.password)
    const tablet = await login(m.email, m.password)
    expect((await asMember(m, again.jar, '/compte/deconnexion?partout=1', { body: {} })).status).toBe(200)
    expect((await asMember(m, tablet.jar, '/compte/moi')).status).toBe(401)
    expect((await findMember(m.email))?.sessionVersion).toBe(2)
  })

  it('sessions : une déconnexion demandée depuis un autre site est refusée (403), la session reste ouverte', async () => {
    const m = await signup()
    for (const body of [{}, { partout: true }]) {
      const res = await asMember(m, m.jar, '/compte/deconnexion', { body, origin: 'https://autre-site.example' })
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Requête refusée.' })
      expect(res.response.headers.getSetCookie()).toEqual([])
    }
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(200)
    expect((await findMember(m.email))?.sessionVersion).toBe(0)
  })

  it('sessions : une session de membre ne donne aucun droit dans l’API de Payload', async () => {
    const m = await signup()
    const cookie = m.jar.header()
    expect((await apiJson<{ user: unknown }>('/users/me', { cookie })).body.user).toBeNull()
    for (const path of ['/members', '/member-history', '/member-favorites', '/users', '/messages']) {
      expect((await api(path, { cookie })).status, path).toBe(403)
    }
  })

  it('sessions : les données d’un membre ne sont pas lisibles depuis un autre site (aucun en-tête CORS)', async () => {
    const m = await signup()
    for (const path of ['/compte/moi', '/compte/export', '/compte/favoris?kind=video&id=1']) {
      const res = await api(path, { cookie: m.jar.header(), origin: 'https://autre-site.example' })
      expect(res.headers.get('access-control-allow-origin'), path).toBeNull()
      expect(res.headers.get('access-control-allow-credentials'), path).toBeNull()
    }
  })
})

describe('mot de passe oublié', () => {
  it('mot de passe oublié : la réponse est toujours { ok: true }, que l’adresse soit inscrite ou non', async () => {
    const m = await signup()
    const answers = await Promise.all([forgot(m.email), forgot(newEmail('inconnu')), forgot(''), forgot('pas-une-adresse'), forgot(undefined)])
    for (const res of answers) {
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(res.response.headers.getSetCookie()).toEqual([])
    }
    await vi.waitFor(() => expect(mailsTo(m.email)).toHaveLength(1))
  })

  it('mot de passe oublié : la réponse part avant la recherche du compte (sa durée ne révèle rien)', async () => {
    const m = await signup()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const find = payload.find.bind(payload)
    const spy = vi.spyOn(payload, 'find').mockImplementation((async (args: { collection: string }) => {
      if (args.collection === 'members') await gate
      return find(args as never)
    }) as unknown as typeof payload.find)
    const res = await Promise.race([forgot(m.email), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))])
    // réponse arrivée alors que la recherche du compte attend encore
    expect(res?.body).toEqual({ ok: true })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ collection: 'members' }))
    expect(mailsTo(m.email)).toHaveLength(0)
    release()
    await vi.waitFor(() => expect(mailsTo(m.email)).toHaveLength(1))
  })

  it('mot de passe oublié : un lien valable une heure est envoyé en français ; seule son empreinte est enregistrée', async () => {
    const m = await signup({ firstName: '<b>Zoé</b>' })
    const before = await findMember(m.email)
    const journal = vi.spyOn(payload.logger, 'info')
    // adresse saisie autrement : c'est la même
    expect((await forgot(`  ${m.email.toUpperCase()} `)).body).toEqual({ ok: true })
    await vi.waitFor(() => expect(mailsTo(m.email)).toHaveLength(1))
    const [mail] = mailsTo(m.email)
    expect(mail.subject).toBe('Swatter TV — choisir un nouveau mot de passe')
    const token = mail.text.match(/token=([\w-]+)/)?.[1] ?? ''
    expect(token.length).toBeGreaterThanOrEqual(40)
    const link = `http://localhost:3000/compte/nouveau-mot-de-passe?token=${token}`
    expect(mail.text).toContain(`Choisir un nouveau mot de passe : ${link}`)
    expect(mail.text).toContain('Ce lien est valable une heure.')
    expect(mail.html).toContain(`href="${link}"`)
    // prénom échappé dans le HTML (pas de balise injectée dans l'e-mail)
    expect(mail.html).toContain('Bonjour &lt;b&gt;Zoé&lt;/b&gt;,')
    expect(mail.html).not.toContain('<b>Zoé</b>')
    // sans SMTP, hors production : le lien est rappelé dans le journal du serveur pour pouvoir tester
    expect(journal).toHaveBeenCalledWith(`[swatter] (développement, pas de SMTP) Swatter TV — choisir un nouveau mot de passe — lien : ${link}`)

    const member = await findMember(m.email)
    expect(member?.resetTokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(JSON.stringify(member)).not.toContain(token)
    expect(minutesUntil(member?.resetTokenExpires)).toBeGreaterThan(59)
    expect(minutesUntil(member?.resetTokenExpires)).toBeLessThanOrEqual(60.1)
    // la demande seule ne change ni le mot de passe ni les sessions
    expect(member?.passwordHash).toBe(before?.passwordHash)
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(200)
  })

  it('mot de passe oublié : rien n’est envoyé pour une adresse inconnue ni pour un compte suspendu', async () => {
    const suspended = await signup()
    await adminUpdateMember(suspended.id, { blocked: true })
    const unknown = newEmail('inconnu')
    const find = vi.spyOn(payload, 'find')
    for (const email of [unknown, suspended.email]) {
      expect((await forgot(email)).body).toEqual({ ok: true })
      await settleLookup(find, email)
      expect(mailsTo(email)).toHaveLength(0)
    }
    expect((await findMember(suspended.email))?.resetTokenHash ?? null).toBeNull()
  })

  it('mot de passe oublié : rien n’est enregistré ni envoyé si l’adresse change ou si le compte est suspendu entre-temps', async () => {
    for (const change of [{ email: newEmail('nouvelle-adresse') }, { blocked: true }]) {
      const m = await signup()
      let release = () => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      let looked = false
      const find = payload.find.bind(payload)
      // la recherche du compte lit la fiche, puis attend : l'administration la modifie pendant ce temps
      const spy = vi.spyOn(payload, 'find').mockImplementation((async (args: { collection: string; where?: unknown }) => {
        const result = await find(args as never)
        if (args.collection === 'members' && JSON.stringify(args.where).includes(m.email)) {
          looked = true
          await gate
        }
        return result
      }) as unknown as typeof payload.find)
      const writes = vi.spyOn(payload.db, 'updateOne')
      expect((await forgot(m.email)).body).toEqual({ ok: true })
      await vi.waitFor(() => expect(looked).toBe(true))
      spy.mockRestore()
      await adminUpdateMember(m.id, change)
      release()
      // la tâche essaie d'enregistrer le lien : l'écriture conditionnelle ne trouve plus la fiche telle qu'elle l'a lue
      const tokenWrite = () => writes.mock.calls.findIndex(([args]) => typeof (args.data as { resetTokenHash?: unknown }).resetTokenHash === 'string')
      await vi.waitFor(() => expect(tokenWrite()).toBeGreaterThanOrEqual(0))
      expect(await writes.mock.results[tokenWrite()]?.value).toBeNull()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(mailsTo(m.email)).toHaveLength(0)
      if (typeof change.email === 'string') expect(mailsTo(change.email)).toHaveLength(0)
      expect((await memberById(m.id))?.resetTokenHash ?? null).toBeNull()
      writes.mockRestore()
    }
  })
})

describe('nouveau mot de passe', () => {
  it('nouveau mot de passe : le lien change le mot de passe, connecte et ferme les autres sessions', async () => {
    const m = await signup()
    const token = await requestReset(m)
    const res = await reset(token, NEW_PASSWORD)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, firstName: 'Camille' })
    expect((await asMember(m, res.jar, '/compte/moi')).status).toBe(200)
    // l'ancienne session (autre appareil) est fermée
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(401)
    expect((await login(m.email, m.password)).status).toBe(401)
    expect((await login(m.email, NEW_PASSWORD)).status).toBe(200)
    expect(await findMember(m.email)).toMatchObject({ resetTokenHash: null, resetTokenExpires: null, sessionVersion: 1 })
  })

  it('nouveau mot de passe : le lien ne sert qu’une fois', async () => {
    const m = await signup()
    const token = await requestReset(m)
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200)
    const again = await reset(token, 'encore-un-autre-mot-de-passe')
    expect(again.status).toBe(400)
    expect(again.body).toEqual(INVALID_LINK)
    expect(again.response.headers.getSetCookie()).toEqual([])
    expect((await login(m.email, 'encore-un-autre-mot-de-passe')).status).toBe(401)
    expect((await login(m.email, NEW_PASSWORD)).status).toBe(200)
  })

  it('nouveau mot de passe : trois envois simultanés du même lien, un seul passe', async () => {
    const m = await signup()
    const token = await requestReset(m)
    const passwords = ['mot-de-passe-premier', 'mot-de-passe-deuxieme', 'mot-de-passe-troisieme']
    const results = await Promise.all(passwords.map((p) => reset(token, p)))
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400])
    for (const r of results.filter((x) => x.status === 400)) expect(r.body.code).toBe('invalid')
    const winner = passwords[results.findIndex((r) => r.status === 200)]
    for (const p of passwords) expect((await login(m.email, p)).status, p).toBe(p === winner ? 200 : 401)
  })

  it('nouveau mot de passe : le lien expire au bout d’une heure', async () => {
    const m = await signup()
    const token = await requestReset(m)
    const now = Date.now()
    try {
      vi.setSystemTime(now + 61 * 60_000)
      const late = await reset(token, 'mot-de-passe-trop-tard')
      expect(late.status).toBe(400)
      expect(late.body).toEqual(INVALID_LINK)
      vi.setSystemTime(now + 59 * 60_000)
      expect((await reset(token, 'mot-de-passe-a-temps')).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
    expect((await login(m.email, 'mot-de-passe-trop-tard')).status).toBe(401)
    expect((await login(m.email, 'mot-de-passe-a-temps')).status).toBe(200)
  })

  it('nouveau mot de passe : un mot de passe refusé ne consomme pas le lien', async () => {
    const m = await signup()
    const token = await requestReset(m)
    for (const password of ['court', ' espace-devant', undefined]) {
      const res = await reset(token, password)
      expect(res.status).toBe(400)
      expect(Object.keys(res.body.errors ?? {})).toEqual(['password'])
    }
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200)
  })

  it('nouveau mot de passe : un lien inconnu, vide ou absent est refusé (code invalid)', async () => {
    for (const token of ['lien-inventé', '', undefined, 42]) {
      const res = await reset(token, NEW_PASSWORD)
      expect(res.status).toBe(400)
      expect(res.body).toEqual(INVALID_LINK)
    }
  })

  it('nouveau mot de passe : il débloque un compte bloqué par 5 erreurs de connexion', async () => {
    const m = await signup()
    for (let i = 0; i < 5; i++) await login(m.email, 'mauvais-mot-de-passe')
    expect((await login(m.email, m.password)).status).toBe(429)
    const token = await requestReset(m)
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200)
    expect(await findMember(m.email)).toMatchObject({ loginAttempts: 0, lockUntil: null })
    expect((await login(m.email, NEW_PASSWORD)).status).toBe(200)
  })

  it('nouveau mot de passe : suspendre le compte (ou changer son e-mail) dans l’administration rend le lien caduc', async () => {
    for (const change of [{ blocked: true }, { email: newEmail('corrigee') }]) {
      const m = await signup()
      const token = await requestReset(m)
      const before = await findMember(m.email)
      await adminUpdateMember(m.id, change)
      const res = await reset(token, NEW_PASSWORD)
      expect(res.status).toBe(400)
      expect(res.body).toEqual(INVALID_LINK)
      expect((await memberById(m.id))?.passwordHash).toBe(before?.passwordHash)
      // ses sessions en cours sont fermées aussi
      expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(401)
    }
  })

  it('nouveau mot de passe : un compte suspendu dont le lien est resté valable est refusé (403 blocked), mot de passe inchangé', async () => {
    const m = await signup()
    const token = await requestReset(m)
    const before = await findMember(m.email)
    // suspension écrite sans passer par l'administration (le lien reste en base)
    await writeMember(m.id, { blocked: true })
    const res = await reset(token, NEW_PASSWORD)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Ce compte a été suspendu.', code: 'blocked' })
    expect(res.response.headers.getSetCookie()).toEqual([])
    expect((await memberById(m.id))?.passwordHash).toBe(before?.passwordHash)
    // lien consommé : il ne sert plus, même après la levée de la suspension
    await writeMember(m.id, { blocked: false })
    expect((await reset(token, NEW_PASSWORD)).body).toEqual(INVALID_LINK)
  })

  it('nouveau mot de passe et mot de passe oublié : refusés depuis un autre site (403)', async () => {
    const m = await signup()
    const token = await requestReset(m)
    const other = { origin: 'https://autre-site.example', headers: fromIp(newIp()) }
    expect((await apiJson('/compte/mot-de-passe-oublie', { ...other, body: { email: m.email } })).status).toBe(403)
    const res = await apiJson('/compte/nouveau-mot-de-passe', { ...other, body: { token, password: NEW_PASSWORD } })
    expect(res.status).toBe(403)
    // le lien n'a pas été consommé
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200)
  })
})

describe('changement de mot de passe', () => {
  const change = (m: TestMember, jar: CookieJar, body: unknown, options: ApiOptions = {}) =>
    asMember<Answer>(m, jar, '/compte/mot-de-passe', { ...options, body })

  it('changement de mot de passe : le mot de passe actuel est exigé', async () => {
    const m = await signup()
    for (const current of ['mauvais-mot-de-passe', '', undefined]) {
      const res = await change(m, m.jar, { current, password: NEW_PASSWORD })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ errors: { current: 'Mot de passe actuel incorrect.' } })
    }
    // le nouveau mot de passe est vérifié d'abord
    const weak = await change(m, m.jar, { current: m.password, password: 'court' })
    expect(weak.body).toEqual({ errors: { password: 'Le mot de passe doit contenir au moins 8 caractères.' } })
    expect((await login(m.email, m.password)).status).toBe(200)
    expect((await login(m.email, NEW_PASSWORD)).status).toBe(401)
  })

  it('changement de mot de passe : les autres sessions sont fermées, celle-ci reste ouverte ; un lien en attente ne sert plus', async () => {
    const m = await signup()
    const phone = await login(m.email, m.password)
    const token = await requestReset(m)
    const res = await change(m, m.jar, { current: m.password, password: NEW_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    // nouveaux cookies pour cette session-ci
    expect(setCookies(res.response).get('sw_membre')?.value).toMatch(/^v1\./)
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(200)
    expect((await asMember(m, phone.jar, '/compte/moi')).status).toBe(401)
    expect((await login(m.email, m.password)).status).toBe(401)
    expect((await login(m.email, NEW_PASSWORD)).status).toBe(200)
    expect((await reset(token, 'mot-de-passe-du-lien')).body).toEqual(INVALID_LINK)
    expect((await findMember(m.email))?.sessionVersion).toBe(1)
  })

  it('changement de mot de passe : 5 essais par quart d’heure, compteur propre au membre (pas à l’adresse IP)', async () => {
    const m = await signup()
    for (let i = 0; i < 5; i++) expect((await change(m, m.jar, { current: `faux-mot-de-passe-${i}`, password: NEW_PASSWORD })).status).toBe(400)
    // le 6e essai, même juste et depuis une autre adresse, est refusé
    const blocked = await asMember<Answer>({ ip: newIp() }, m.jar, '/compte/mot-de-passe', { body: { current: m.password, password: NEW_PASSWORD } })
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ error: 'Trop d’essais : réessayez dans 15 minutes.', code: 'locked' })
    // la suppression du compte partage ce compteur
    const del = await asMember<Answer>(m, m.jar, '/compte/supprimer', { body: { password: m.password } })
    expect(del.status).toBe(429)
    expect(del.body.code).toBe('locked')
    expect(await findMember(m.email)).not.toBeNull()
    // la connexion du membre n'est pas bloquée, et un autre membre de la même adresse change le sien
    expect((await login(m.email, m.password)).status).toBe(200)
    const neighbour = await signup({ ip: m.ip })
    expect((await change(neighbour, neighbour.jar, { current: neighbour.password, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('changement de mot de passe : les erreurs de connexion d’un tiers ne l’empêchent pas', async () => {
    const m = await signup()
    for (let i = 0; i < 5; i++) await login(m.email, 'essai-d-un-tiers')
    expect((await login(m.email, m.password)).status).toBe(429)
    const res = await change(m, m.jar, { current: m.password, password: NEW_PASSWORD })
    expect(res.status).toBe(200)
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(200)
  })

  it('changement de mot de passe : refusé depuis un autre site (403)', async () => {
    const m = await signup()
    const res = await change(m, m.jar, { current: m.password, password: NEW_PASSWORD }, { origin: 'https://autre-site.example' })
    expect(res.status).toBe(403)
    expect((await login(m.email, m.password)).status).toBe(200)
  })
})

describe('profil', () => {
  const patch = (m: TestMember, body: unknown, options: ApiOptions = {}) =>
    asMember<Record<string, unknown>>(m, m.jar, '/compte/profil', { ...options, method: 'PATCH', body })

  it('profil : une modification partielle ne change que les champs envoyés', async () => {
    const m = await signup()
    const first = await patch(m, { lastName: 'Martin' })
    expect(first.status).toBe(200)
    expect(first.body).toEqual({
      firstName: 'Camille',
      lastName: 'Martin',
      email: m.email,
      department: null,
      newsletter: false,
      historyPaused: false,
      createdAt: expect.any(String),
    })
    expect((await patch(m, { department: 'isere', newsletter: true })).body).toMatchObject({ lastName: 'Martin', department: 'isere', newsletter: true })
    expect((await patch(m, { historyPaused: 'true' })).body).toMatchObject({ historyPaused: true, department: 'isere', newsletter: true })
    expect((await patch(m, { newsletter: 'on' })).body).toMatchObject({ newsletter: true })
    expect((await patch(m, { newsletter: false, historyPaused: false })).body).toMatchObject({ newsletter: false, historyPaused: false })
    expect((await patch(m, { department: null })).body).toMatchObject({ department: null })
    expect((await patch(m, { department: 'savoie' })).body).toMatchObject({ department: 'savoie' })
    expect((await patch(m, { department: '' })).body).toMatchObject({ department: null })
    expect((await asMember(m, m.jar, '/compte/moi')).body).toMatchObject({ firstName: 'Camille', lastName: 'Martin', department: null })
  })

  it('profil : une valeur invalide est refusée et rien n’est écrit', async () => {
    const m = await signup()
    await patch(m, { lastName: 'Martin' })
    const cases: [Record<string, unknown>, Record<string, string>][] = [
      [{ firstName: 'A', lastName: 'Durand' }, { firstName: 'Indiquez votre prénom.' }],
      [{ department: 'paris', lastName: 'Durand' }, { department: 'Choisissez un département de la liste.' }],
      // « Web Cams + » n'est pas un département
      [{ department: 'plus' }, { department: 'Choisissez un département de la liste.' }],
    ]
    for (const [body, errors] of cases) {
      const res = await patch(m, body)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ errors })
    }
    for (const raw of ['pas du json', '[]']) expect((await patch(m, raw)).body).toEqual({ error: 'Requête illisible.' })
    expect((await asMember(m, m.jar, '/compte/moi')).body).toMatchObject({ firstName: 'Camille', lastName: 'Martin', department: null })
  })

  it('profil : l’e-mail, la suspension et les champs techniques ne se modifient pas par le profil', async () => {
    const m = await signup()
    const before = await findMember(m.email)
    const res = await patch(m, {
      email: newEmail('autre'),
      blocked: true,
      passwordHash: 'scrypt$16384$8$1$AAAA$BBBB',
      sessionVersion: 42,
      loginAttempts: 4,
      lockUntil: '2099-01-01T00:00:00.000Z',
      resetTokenHash: 'abc',
      note: 'note du membre',
      consentAt: '2000-01-01T00:00:00.000Z',
      lastLoginAt: '2000-01-01T00:00:00.000Z',
      createdAt: '2000-01-01T00:00:00.000Z',
    })
    expect(res.status).toBe(200)
    const after = await findMember(m.email)
    for (const key of [
      'email',
      'blocked',
      'passwordHash',
      'sessionVersion',
      'loginAttempts',
      'lockUntil',
      'resetTokenHash',
      'note',
      'consentAt',
      'lastLoginAt',
      'createdAt',
    ] as const) {
      expect(after?.[key], key).toEqual(before?.[key])
    }
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(200)
    expect((await login(m.email, m.password)).status).toBe(200)
  })

  it('profil : les textes sont nettoyés (caractères de contrôle, espaces autour, longueur)', async () => {
    const m = await signup()
    const res = await patch(m, { firstName: '  Zoé\u0000\u0007 ', lastName: `  ${'x'.repeat(100)}  ` })
    expect(res.body).toMatchObject({ firstName: 'Zoé', lastName: 'x'.repeat(80) })
    expect((await patch(m, { firstName: 'y'.repeat(70) })).body).toMatchObject({ firstName: 'y'.repeat(60) })
  })

  it('profil : un PATCH lu avant un changement de mot de passe ne le défait pas (écriture partielle)', async () => {
    const m = await signup()
    const phone = await login(m.email, m.password)
    const staleSession = m.jar.header()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let read = false
    const findByID = payload.findByID.bind(payload)
    // le PATCH lit la fiche du membre (avec son mot de passe) puis attend
    const spy = vi.spyOn(payload, 'findByID').mockImplementation((async (args: { collection: string }) => {
      const doc = await findByID(args as never)
      if (args.collection === 'members' && !read) {
        read = true
        await gate
      }
      return doc
    }) as unknown as typeof payload.findByID)
    const pending = apiJson<Record<string, unknown>>('/compte/profil', {
      method: 'PATCH',
      body: { lastName: 'Lent' },
      cookie: staleSession,
      headers: fromIp(m.ip),
    })
    await vi.waitFor(() => expect(read).toBe(true))
    spy.mockRestore()
    // pendant ce temps, depuis le téléphone : nouveau mot de passe
    expect((await asMember(m, phone.jar, '/compte/mot-de-passe', { body: { current: m.password, password: NEW_PASSWORD } })).status).toBe(200)
    release()
    const res = await pending
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ lastName: 'Lent' })
    // le changement de mot de passe tient : nouveau mot de passe, autres sessions toujours fermées, téléphone connecté
    expect(await findMember(m.email)).toMatchObject({ lastName: 'Lent', sessionVersion: 1 })
    expect((await login(m.email, m.password)).status).toBe(401)
    expect((await login(m.email, NEW_PASSWORD)).status).toBe(200)
    expect((await apiJson('/compte/moi', { cookie: staleSession })).status).toBe(401)
    expect((await asMember(m, phone.jar, '/compte/moi')).status).toBe(200)
  })

  it('profil : un PATCH lu avant une suspension ne la défait pas', async () => {
    const m = await signup()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let read = false
    const findByID = payload.findByID.bind(payload)
    const spy = vi.spyOn(payload, 'findByID').mockImplementation((async (args: { collection: string }) => {
      const doc = await findByID(args as never)
      if (args.collection === 'members' && !read) {
        read = true
        await gate
      }
      return doc
    }) as unknown as typeof payload.findByID)
    const pending = asMember(m, m.jar, '/compte/profil', { method: 'PATCH', body: { newsletter: true } })
    await vi.waitFor(() => expect(read).toBe(true))
    spy.mockRestore()
    await adminUpdateMember(m.id, { blocked: true })
    release()
    await pending
    expect(await findMember(m.email)).toMatchObject({ blocked: true, sessionVersion: 1 })
    expect((await login(m.email, m.password)).body.code).toBe('blocked')
  })

  it('profil : 401 sans session, 403 depuis un autre site', async () => {
    const m = await signup()
    expect((await apiJson('/compte/profil', { method: 'PATCH', body: { lastName: 'X' }, headers: fromIp(newIp()) })).body).toEqual(UNAUTHENTICATED)
    const res = await patch(m, { lastName: 'Pirate' }, { origin: 'https://autre-site.example' })
    expect(res.status).toBe(403)
    expect((await findMember(m.email))?.lastName ?? null).toBeNull()
  })
})

describe('fiches des membres dans l’API de Payload', () => {
  it('administration : même un administrateur ne lit ni l’activité des membres ni leurs champs techniques ; un éditeur ne lit pas les membres', async () => {
    const m = await signup()
    await login(m.email, 'mauvais-mot-de-passe')
    const token = await adminToken()
    const res = await apiJson<Record<string, unknown>>(`/members/${m.id}`, { token })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: m.id, email: m.email, firstName: 'Camille' })
    for (const key of ['passwordHash', 'sessionVersion', 'loginAttempts', 'lockUntil', 'resetTokenHash', 'resetTokenExpires'])
      expect(res.body, key).not.toHaveProperty(key)
    expect(JSON.stringify(res.body)).not.toContain('scrypt$')
    for (const path of ['/member-history', '/member-favorites']) expect((await api(path, { token })).status, path).toBe(403)
    expect((await api(`/members/${m.id}`, { token: await editorToken() })).status).toBe(403)
  })

  it('administration : un compte de membre ne se crée pas par l’API, même par un administrateur', async () => {
    const email = newEmail('intrus')
    const res = await apiJson('/members', { body: { firstName: 'Intrus', email, passwordHash: 'scrypt$16384$8$1$AAAA$BBBB' }, token: await adminToken() })
    expect(res.status).toBe(403)
    expect(await findMember(email)).toBeNull()
  })

  it('administration : l’accord e-mail se retire sans jamais se donner ; pause, dernière connexion et accord des conditions restent au membre', async () => {
    const m = await signup()
    const before = await findMember(m.email)
    await adminUpdateMember(m.id, { newsletter: true, historyPaused: true, lastLoginAt: '2000-01-01T00:00:00.000Z', consentAt: '2000-01-01T00:00:00.000Z' })
    expect(await findMember(m.email)).toMatchObject({ newsletter: false, historyPaused: false, lastLoginAt: before?.lastLoginAt, consentAt: before?.consentAt })

    // choix faits par le membre pendant qu'une fiche était ouverte : l'enregistrement de la fiche ne les écrase pas
    await asMember(m, m.jar, '/compte/profil', { method: 'PATCH', body: { newsletter: true, historyPaused: true } })
    await adminUpdateMember(m.id, { historyPaused: false, note: 'Fiche enregistrée par l’équipe' })
    expect(await findMember(m.email)).toMatchObject({ newsletter: true, historyPaused: true, note: 'Fiche enregistrée par l’équipe' })
    // à la demande du membre, l'équipe retire son accord
    await adminUpdateMember(m.id, { newsletter: false })
    expect((await findMember(m.email))?.newsletter).toBe(false)
  })
})
