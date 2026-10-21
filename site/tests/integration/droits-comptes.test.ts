// Droits d’accès aux comptes et aux données personnelles par l’API REST (et GraphQL pour l’activité des membres) :
// comptes de l’équipe (rôles, premier compte, blocage), membres du site (lecture et modification par les seuls
// administrateurs, règles du hook d’enregistrement, sessions fermées, suppression en cascade), historique et « Ma liste »
// (aucun accès), messages reçus, données internes de Payload (préférences, verrous, clés, migrations).
import config from '@payload-config'
import { createLocalReq, initTransaction, killTransaction, registerFirstUserOperation, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { hashPassword, hashToken, signSession } from '@/lib/members/crypto'
import type { Member } from '@/payload-types'
import { ADMIN, EDITOR } from './accounts'
import { CookieJar, SITE, api, apiJson, adminToken, editorToken, testPayload, unique } from './helpers'

type Doc = { id: number } & Record<string, unknown>
type Page = { docs: Doc[]; totalDocs: number }

let payload: Payload
let editor: string
let admin: string
let adminId: number
let editorId: number
const users: number[] = []
const members: number[] = []
const messages: number[] = []

/** Adresse IP propre à chaque appel (limites anti-abus de l’espace membres comptées par IP). */
let ipCount = 0
const ip = () => `10.42.${Math.floor(++ipCount / 250)}.${ipCount % 250}`

/** Champs techniques d’un membre : jamais renvoyés ni écrits par l’API. */
const TECHNICAL = ['passwordHash', 'sessionVersion', 'loginAttempts', 'lockUntil', 'resetTokenHash', 'resetTokenExpires'] as const

/** Membre inscrit (comme le fait /api/compte/inscription : API locale). */
async function member(extra: Partial<Member> = {}): Promise<Member> {
  const doc = await payload.create({
    collection: 'members',
    data: {
      firstName: 'Camille',
      email: `${unique('membre')}@exemple.fr`,
      passwordHash: 'scrypt$16384$8$1$sel$empreinte',
      consentAt: '2026-01-02T08:00:00.000Z',
      lastLoginAt: '2026-03-04T08:00:00.000Z',
      ...extra,
    },
    overrideAccess: true,
    showHiddenFields: true,
  })
  members.push(doc.id)
  return doc
}

/** Fiche complète d’un membre, champs techniques compris (lecture du serveur). */
const raw = (id: number) => payload.findByID({ collection: 'members', id, overrideAccess: true, showHiddenFields: true })

/** Cookie de session d’un membre (même signature que la connexion). */
const sessionOf = (m: Pick<Member, 'id' | 'sessionVersion'>) => `sw_membre=${signSession(m.id, Number(m.sessionVersion) || 0).value}`

/** Lien « nouveau mot de passe » encore valable (comme l’envoie /api/compte/mot-de-passe-oublie). */
async function resetLink(id: number): Promise<string> {
  const token = unique('jeton-de-test')
  const data = { resetTokenHash: hashToken(token), resetTokenExpires: new Date(Date.now() + 3600_000).toISOString() }
  await payload.db.updateOne({ collection: 'members', id, data })
  return token
}

const useLink = (token: string) =>
  apiJson<{ code?: string }>('/compte/nouveau-mot-de-passe', {
    method: 'POST',
    body: { token, password: 'un-nouveau-mot-de-passe' },
    headers: { 'x-forwarded-for': ip() },
  })

/** Vidéo regardée par un membre (historique), comme l’enregistre l’espace membres (API locale). */
const watched = (member: number, kind: 'video' | 'replay', itemId: number) =>
  payload.create({ collection: 'member-history', data: { member, kind, itemId, watchedAt: new Date().toISOString() }, overrideAccess: true })

/** Contenu gardé dans « Ma liste ». */
const saved = (member: number, kind: 'video' | 'replay' | 'article' | 'event', itemId: number) =>
  payload.create({ collection: 'member-favorites', data: { member, kind, itemId, savedAt: new Date().toISOString() }, overrideAccess: true })

const connected = async (cookie: string) => (await api('/compte/moi', { cookie })).status

/** Erreurs attendues journalisées par Payload (requête refusée) : sans bruit dans la sortie des tests. */
const quiet = () => vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)

type GraphqlResult = { data?: Record<string, unknown> | null; errors?: { message: string; extensions?: { name?: string } }[] }

async function graphql(query: string, token?: string): Promise<GraphqlResult> {
  const { GRAPHQL_POST } = await import('@payloadcms/next/routes')
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) headers.set('authorization', `JWT ${token}`)
  const res = await GRAPHQL_POST(config)(new Request(`${SITE}/api/graphql`, { method: 'POST', headers, body: JSON.stringify({ query }) }))
  return res.json()
}

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  admin = await adminToken()
  adminId = (await apiJson<{ user: { id: number } }>('/users/me', { token: admin })).body.user.id
  editorId = (await apiJson<{ user: { id: number } }>('/users/me', { token: editor })).body.user.id
})

afterAll(async () => {
  vi.restoreAllMocks()
  for (const id of members) await payload.delete({ collection: 'members', id, overrideAccess: true }).catch(() => undefined)
  for (const id of messages) await payload.delete({ collection: 'messages', id }).catch(() => undefined)
  for (const id of users) await payload.delete({ collection: 'users', id }).catch(() => undefined)
  // comptes de l’équipe remis comme au départ (nom modifié par certains tests)
  await payload.update({ collection: 'users', id: editorId, data: { name: EDITOR.name, role: 'editeur' } })
  await payload.update({ collection: 'users', id: adminId, data: { name: ADMIN.name, role: 'admin' } })
})

describe('comptes de l’équipe (users)', () => {
  it('visiteur anonyme : ni lecture ni écriture des comptes', async () => {
    expect((await api('/users')).status).toBe(403)
    expect((await api(`/users/${adminId}`)).status).toBe(403)
    expect((await api('/users/count')).status).toBe(403)
    const pirate = { email: `${unique('pirate')}@exemple.fr`, password: 'mot-de-passe-pirate', role: 'admin' }
    expect((await api('/users', { method: 'POST', body: pirate })).status).toBe(403)
    expect((await api(`/users/${adminId}`, { method: 'PATCH', body: { role: 'editeur' } })).status).toBe(403)
    expect((await api(`/users/${adminId}`, { method: 'DELETE' })).status).toBe(403)
    expect((await apiJson<{ user: unknown }>('/users/me')).body.user).toBeNull()
    expect((await payload.count({ collection: 'users', where: { email: { like: 'pirate-' } } })).totalDocs).toBe(0)
  })

  it('éditeur : voit les membres de l’équipe, sans aucun secret (mot de passe, jetons, sessions d’un autre)', async () => {
    const list = await apiJson<Page>('/users?limit=100', { token: editor })
    expect(list.status).toBe(200)
    const other = list.body.docs.find((d) => d.id === adminId)
    expect(other?.email).toBe(ADMIN.email)
    const byId = await apiJson<Doc>(`/users/${adminId}`, { token: editor })
    // même en demandant explicitement les champs secrets
    const secrets = ['hash', 'salt', 'resetPasswordToken', 'sessions'].map((key) => `select[${key}]=true`).join('&')
    const selected = await apiJson<Doc>(`/users/${adminId}?${secrets}`, { token: editor })
    for (const doc of [other, byId.body, selected.body]) {
      for (const key of ['hash', 'salt', 'password', 'resetPasswordToken', 'resetPasswordExpiration', 'loginAttempts', 'lockUntil']) {
        expect(doc).not.toHaveProperty(key)
      }
      // l’administrateur est connecté (jeton des tests) : ses sessions ne sont montrées qu’à lui
      expect(doc?.sessions ?? []).toEqual([])
    }
    const mine = await apiJson<Doc>(`/users/${editorId}`, { token: editor })
    expect((mine.body.sessions as unknown[]).length).toBeGreaterThan(0)
  })

  it('éditeur : aucune recherche sur les secrets des comptes (pas d’oracle)', async () => {
    const spy = quiet()
    for (const query of ['where[hash][exists]=true', 'where[salt][like]=a', 'where[resetPasswordToken][exists]=true', 'sort=hash']) {
      const res = await apiJson<Page>(`/users?${query}`, { token: editor })
      expect(res.status, query).toBe(400)
      expect(res.body.docs).toBeUndefined()
    }
    spy.mockRestore()
  })

  it('éditeur : modifie son propre compte, jamais son rôle', async () => {
    const name = unique('Éditeur renommé')
    const res = await apiJson<{ doc: Doc }>(`/users/${editorId}`, { method: 'PATCH', token: editor, body: { name, role: 'admin' } })
    expect(res.status).toBe(200)
    expect(res.body.doc.name).toBe(name)
    expect(res.body.doc.role).toBe('editeur')
    const bulk = await api(`/users?where[id][equals]=${editorId}`, { method: 'PATCH', token: editor, body: { role: 'admin' } })
    expect(bulk.status).toBe(200)
    expect((await payload.findByID({ collection: 'users', id: editorId })).role).toBe('editeur')
    expect((await apiJson<{ user: { role: string } }>('/users/me', { token: editor })).body.user.role).toBe('editeur')
  })

  it('éditeur : ne modifie ni ne supprime le compte d’un autre, ne crée aucun compte', async () => {
    expect((await api(`/users/${adminId}`, { method: 'PATCH', token: editor, body: { name: 'Pirate', email: 'pirate@exemple.fr' } })).status).toBe(403)
    // modification groupée : seul son propre compte est concerné
    const bulk = await apiJson<{ docs: Doc[] }>('/users?where[id][exists]=true', { method: 'PATCH', token: editor, body: { name: unique('Groupé') } })
    expect(bulk.body.docs.map((d) => d.id)).toEqual([editorId])
    const target = await payload.findByID({ collection: 'users', id: adminId })
    expect(target.name).toBe(ADMIN.name)
    expect(target.email).toBe(ADMIN.email)
    expect((await api(`/users/${adminId}`, { method: 'DELETE', token: editor })).status).toBe(403)
    expect((await api(`/users/${editorId}`, { method: 'DELETE', token: editor })).status).toBe(403)
    expect((await api('/users?where[id][exists]=true', { method: 'DELETE', token: editor })).status).toBe(403)
    const email = `${unique('nouvel-editeur')}@exemple.fr`
    expect((await api('/users', { method: 'POST', token: editor, body: { email, password: 'mot-de-passe-nouveau', role: 'editeur' } })).status).toBe(403)
    expect((await payload.count({ collection: 'users', where: { email: { equals: email } } })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'users' })).totalDocs).toBeGreaterThanOrEqual(2)
  })

  it('administrateur : voit tous les comptes, crée un éditeur (son rôle est gardé), change les rôles, supprime un compte', async () => {
    const all = await apiJson<Page>('/users?limit=100', { token: admin })
    expect(all.body.docs.map((d) => d.id)).toEqual(expect.arrayContaining([adminId, editorId]))
    const email = `${unique('equipe')}@exemple.fr`
    const body = { email, password: 'mot-de-passe-equipe', name: 'Dominique', role: 'editeur' }
    const res = await apiJson<{ doc: Doc }>('/users', { method: 'POST', token: admin, body })
    expect(res.status).toBe(201)
    const id = res.body.doc.id
    users.push(id)
    expect(res.body.doc.role).toBe('editeur')
    expect((await apiJson<{ doc: Doc }>(`/users/${id}`, { method: 'PATCH', token: admin, body: { role: 'admin' } })).body.doc.role).toBe('admin')
    expect((await api(`/users/${id}`, { method: 'DELETE', token: admin })).status).toBe(200)
    expect((await payload.count({ collection: 'users', where: { id: { equals: id } } })).totalDocs).toBe(0)
  })

  it('le tout premier compte (base vide) devient administrateur, même si « éditeur » est demandé ; les suivants gardent leur rôle', async () => {
    // base vide simulée dans une transaction annulée à la fin : les comptes des tests ne sont pas touchés
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      await payload.delete({ collection: 'users', where: { id: { exists: true } }, req })
      expect((await payload.count({ collection: 'users', req })).totalDocs).toBe(0)
      // même opération que le formulaire « Créer le premier compte » de /admin (POST /api/users/first-register)
      const first = await registerFirstUserOperation({
        collection: payload.collections.users,
        data: { email: 'premier-compte@exemple.fr', password: 'mot-de-passe-premier', role: 'editeur', name: 'Première' } as never,
        req,
      })
      expect((first.user as { role?: string }).role).toBe('admin')
      const data = { email: 'deuxieme-compte@exemple.fr', password: 'mot-de-passe-deuxieme', role: 'editeur' as const }
      const second = await payload.create({ collection: 'users', data, req })
      expect(second.role).toBe('editeur')
    } finally {
      await killTransaction(req)
    }
    expect((await payload.find({ collection: 'users', where: { email: { in: [ADMIN.email, EDITOR.email] } } })).totalDocs).toBe(2)
  })

  it('création du premier compte refusée dès qu’un compte existe (pas d’administrateur en plus)', async () => {
    const email = `${unique('premier-pirate')}@exemple.fr`
    const res = await api('/users/first-register', { method: 'POST', body: { email, password: 'mot-de-passe-pirate', role: 'admin' } })
    expect(res.status).toBe(403)
    expect((await payload.count({ collection: 'users', where: { email: { equals: email } } })).totalDocs).toBe(0)
  })

  it('compte bloqué après 5 mots de passe erronés ; un éditeur ne débloque pas le compte d’un autre, un administrateur oui', async () => {
    const account = { email: `${unique('verrou')}@exemple.fr`, password: 'mot-de-passe-verrou' }
    const user = await payload.create({ collection: 'users', data: { ...account, role: 'editeur' } })
    users.push(user.id)
    const spy = quiet()
    for (let i = 0; i < 5; i++) expect((await api('/users/login', { body: { email: account.email, password: 'mauvais' } })).status).toBe(401)
    // bloqué : même le bon mot de passe est refusé
    expect((await api('/users/login', { body: account })).status).toBe(401)
    spy.mockRestore()
    const locked = async () => {
      const doc = await payload.findByID({ collection: 'users', id: user.id, showHiddenFields: true })
      return Boolean(doc.lockUntil && Date.parse(doc.lockUntil) > Date.now())
    }
    expect(await locked()).toBe(true)

    const byEditor = await api('/users/unlock', { method: 'POST', token: editor, body: { email: account.email } })
    expect(byEditor.status).toBe(403)
    expect(await locked()).toBe(true)

    expect((await api('/users/unlock', { method: 'POST', token: admin, body: { email: account.email } })).status).toBe(200)
    expect(await locked()).toBe(false)
    expect((await api('/users/login', { body: account })).status).toBe(200)
  })

  it('mot de passe oublié : même réponse que l’adresse ait un compte ou non', async () => {
    const known = await apiJson('/users/forgot-password', { method: 'POST', body: { email: EDITOR.email } })
    const unknown = await apiJson('/users/forgot-password', { method: 'POST', body: { email: `${unique('inconnu')}@exemple.fr` } })
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
  })
})

describe('authentification de l’API de Payload', () => {
  it('cookie de connexion de l’équipe : accepté depuis le site, ignoré depuis un autre site (protection CSRF)', async () => {
    const account = { email: `${unique('cookie')}@exemple.fr`, password: 'mot-de-passe-cookie' }
    users.push((await payload.create({ collection: 'users', data: { ...account, role: 'editeur' } })).id)
    const jar = new CookieJar()
    const login = await api('/users/login', { body: account })
    expect(login.status).toBe(200)
    jar.store(login)
    expect(jar.get('payload-token')).toBeTruthy()
    const cookie = jar.header()
    const me = (headers: Record<string, string>, origin?: string) => apiJson<{ user: { email: string } | null }>('/users/me', { cookie, headers, origin })
    expect((await me({}, SITE)).body.user?.email).toBe(account.email)
    expect((await me({ 'sec-fetch-site': 'same-origin' })).body.user?.email).toBe(account.email)
    expect((await me({}, 'https://site-pirate.exemple')).body.user).toBeNull()
    expect((await me({ 'sec-fetch-site': 'cross-site' })).body.user).toBeNull()

    const body = { title: unique('Article par cookie'), department: 'allier', _status: 'published' }
    expect((await api('/articles', { method: 'POST', cookie, body, origin: 'https://site-pirate.exemple' })).status).toBe(403)
    expect((await api('/articles', { method: 'POST', cookie, body, origin: null, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await payload.count({ collection: 'articles', where: { title: { equals: body.title } } })).totalDocs).toBe(0)
    const ok = await apiJson<{ doc: Doc }>('/articles', { method: 'POST', cookie, body })
    expect(ok.status).toBe(201)
    await payload.delete({ collection: 'articles', id: ok.body.doc.id, context: { disableRevalidate: true } })
  })

  it('un membre connecté (cookie de l’espace membres) n’a aucun droit dans l’API de Payload', async () => {
    const m = await member()
    const cookie = sessionOf(m)
    expect(await connected(cookie)).toBe(200)
    expect((await apiJson<{ user: unknown }>('/users/me', { cookie, origin: SITE })).body.user).toBeNull()
    for (const path of ['/users', '/members', `/members/${m.id}`, '/member-history', '/member-favorites', '/messages', '/globals/youtube']) {
      expect((await api(path, { cookie, origin: SITE })).status, path).toBe(403)
    }
    const body = { title: unique('Article d’un membre'), department: 'allier', _status: 'published' }
    expect((await api('/articles', { method: 'POST', cookie, body })).status).toBe(403)
    expect((await api(`/members/${m.id}`, { method: 'PATCH', cookie, body: { newsletter: true, historyPaused: true } })).status).toBe(403)
    expect((await raw(m.id)).newsletter).toBe(false)
  })
})

describe('membres du site (members) par l’API REST', () => {
  it('visiteur anonyme et éditeur : ni lecture, ni création, ni modification, ni suppression', async () => {
    const m = await member()
    for (const token of [undefined, editor]) {
      expect((await api('/members', { token })).status).toBe(403)
      expect((await api(`/members/${m.id}`, { token })).status).toBe(403)
      expect((await api('/members/count', { token })).status).toBe(403)
      expect((await api('/members', { method: 'POST', token, body: { firstName: 'Pirate', email: `${unique('pirate')}@exemple.fr` } })).status).toBe(403)
      expect((await api(`/members/${m.id}`, { method: 'PATCH', token, body: { blocked: true, note: 'pirate' } })).status).toBe(403)
      expect((await api(`/members?where[id][equals]=${m.id}`, { method: 'PATCH', token, body: { blocked: true } })).status).toBe(403)
      expect((await api(`/members/${m.id}`, { method: 'DELETE', token })).status).toBe(403)
      expect((await api(`/members?where[id][equals]=${m.id}`, { method: 'DELETE', token })).status).toBe(403)
    }
    const after = await raw(m.id)
    expect(after.blocked).toBe(false)
    expect(after.note ?? null).toBeNull()
  })

  it('administrateur : lit les membres et leurs compteurs, jamais leurs champs techniques', async () => {
    const m = await member()
    await watched(m.id, 'video', 101)
    await watched(m.id, 'replay', 102)
    await saved(m.id, 'article', 103)
    for (const path of [`/members/${m.id}`, `/members/${m.id}?select[passwordHash]=true&select[resetTokenHash]=true&select[email]=true`]) {
      const res = await apiJson<Doc>(path, { token: admin })
      expect(res.status).toBe(200)
      expect(res.body.email).toBe(m.email)
      for (const key of TECHNICAL) expect(res.body, key).not.toHaveProperty(key)
    }
    const doc = (await apiJson<Doc>(`/members/${m.id}`, { token: admin })).body
    expect(doc.historyCount).toBe(2)
    expect(doc.favoritesCount).toBe(1)
    const list = await apiJson<Page>(`/members?where[id][equals]=${m.id}`, { token: admin })
    for (const key of TECHNICAL) expect(list.body.docs[0], key).not.toHaveProperty(key)
  })

  it('administrateur : aucune recherche ni aucun tri sur les champs techniques (pas d’oracle)', async () => {
    const m = await member()
    await resetLink(m.id)
    const spy = quiet()
    for (const query of ['where[passwordHash][like]=scrypt', 'where[resetTokenHash][exists]=true', 'where[sessionVersion][equals]=0', 'sort=resetTokenHash']) {
      const res = await apiJson<Page>(`/members?${query}`, { token: admin })
      expect(res.status, query).toBe(400)
      expect(res.body.docs).toBeUndefined()
    }
    spy.mockRestore()
  })

  it('création impossible par l’API, même pour un administrateur', async () => {
    const email = `${unique('cree-par-api')}@exemple.fr`
    const res = await api('/members', { method: 'POST', token: admin, body: { firstName: 'Créé', email, passwordHash: 'x' } })
    expect(res.status).toBe(403)
    expect((await payload.count({ collection: 'members', where: { email: { equals: email } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('e-mail enregistré en minuscules et sans espaces (inscription comme fiche de l’administration)', async () => {
    const local = unique('Zoe.Martin')
    const m = await member({ email: `  ${local.toUpperCase()}@Exemple.FR ` })
    expect(m.email).toBe(`${local.toLowerCase()}@exemple.fr`)
    const changed = unique('Nouvelle.Adresse')
    const res = await apiJson<{ doc: Doc }>(`/members/${m.id}`, { method: 'PATCH', token: admin, body: { email: ` ${changed.toUpperCase()}@EXEMPLE.fr` } })
    expect(res.status).toBe(200)
    expect((await raw(m.id)).email).toBe(`${changed.toLowerCase()}@exemple.fr`)
  })

  it('deux membres ne peuvent pas avoir la même adresse, même écrite en majuscules', async () => {
    const a = await member()
    const b = await member()
    const spy = quiet()
    const res = await api(`/members/${b.id}`, { method: 'PATCH', token: admin, body: { email: a.email.toUpperCase() } })
    spy.mockRestore()
    expect(res.status).toBe(400)
    expect((await raw(b.id)).email).toBe(b.email)
  })

  it('fiche enregistrée par un administrateur : historique en pause, dernière connexion et date d’accord jamais modifiés', async () => {
    const m = await member({ historyPaused: true })
    // l’administration renvoie tous les champs tels qu’ils étaient à l’ouverture de la fiche
    const res = await apiJson(`/members/${m.id}`, {
      method: 'PATCH',
      token: admin,
      body: {
        firstName: 'Camille',
        historyPaused: false,
        lastLoginAt: '2020-01-01T00:00:00.000Z',
        consentAt: '2020-01-01T00:00:00.000Z',
        note: 'Demande reçue par e-mail',
      },
    })
    expect(res.status).toBe(200)
    const after = await raw(m.id)
    expect(after.note).toBe('Demande reçue par e-mail')
    expect(after.historyPaused).toBe(true)
    expect(after.lastLoginAt).toBe(m.lastLoginAt)
    expect(after.consentAt).toBe(m.consentAt)
    // et dans l’autre sens : l’équipe ne met pas l’historique en pause à la place du membre
    const other = await member()
    await api(`/members/${other.id}`, { method: 'PATCH', token: admin, body: { historyPaused: true, lastLoginAt: null, consentAt: null } })
    const otherAfter = await raw(other.id)
    expect(otherAfter.historyPaused).toBe(false)
    expect(otherAfter.lastLoginAt).toBe(other.lastLoginAt)
    expect(otherAfter.consentAt).toBe(other.consentAt)
  })

  it('accord pour les e-mails : un administrateur peut le retirer, jamais le donner', async () => {
    const refused = await member({ newsletter: false })
    expect((await api(`/members/${refused.id}`, { method: 'PATCH', token: admin, body: { newsletter: true } })).status).toBe(200)
    expect((await raw(refused.id)).newsletter).toBe(false)
    const bulk = await api(`/members?where[id][equals]=${refused.id}`, { method: 'PATCH', token: admin, body: { newsletter: true } })
    expect(bulk.status).toBe(200)
    expect((await raw(refused.id)).newsletter).toBe(false)

    const accepted = await member({ newsletter: true })
    expect((await api(`/members/${accepted.id}`, { method: 'PATCH', token: admin, body: { newsletter: false } })).status).toBe(200)
    expect((await raw(accepted.id)).newsletter).toBe(false)
  })

  it('écriture du serveur (sans compte de l’équipe) : les choix du membre s’enregistrent', async () => {
    const m = await member()
    await payload.update({ collection: 'members', id: m.id, data: { historyPaused: true, newsletter: true }, overrideAccess: true })
    const after = await raw(m.id)
    expect(after.historyPaused).toBe(true)
    expect(after.newsletter).toBe(true)
  })

  it('suspension : sessions fermées et lien « nouveau mot de passe » effacé, même après réactivation', async () => {
    const m = await member()
    const cookie = sessionOf(m)
    expect(await connected(cookie)).toBe(200)
    const link = await resetLink(m.id)

    expect((await api(`/members/${m.id}`, { method: 'PATCH', token: admin, body: { blocked: true } })).status).toBe(200)
    let after = await raw(m.id)
    expect(after.sessionVersion).toBe(1)
    expect(after.resetTokenHash ?? null).toBeNull()
    expect(after.resetTokenExpires ?? null).toBeNull()
    expect(await connected(cookie)).toBe(401)

    // déjà suspendu : pas de nouvelle version ; réactivé : les anciennes sessions restent fermées
    await api(`/members/${m.id}`, { method: 'PATCH', token: admin, body: { blocked: true, note: 'toujours suspendu' } })
    expect((await raw(m.id)).sessionVersion).toBe(1)
    await api(`/members/${m.id}`, { method: 'PATCH', token: admin, body: { blocked: false } })
    after = await raw(m.id)
    expect(after.blocked).toBe(false)
    expect(after.sessionVersion).toBe(1)
    expect(await connected(cookie)).toBe(401)
    expect(await connected(sessionOf(after))).toBe(200)
    expect((await useLink(link)).body.code).toBe('invalid')
  })

  it('adresse changée par un administrateur : sessions fermées et lien effacé ; même adresse en majuscules : rien ne change', async () => {
    const m = await member()
    const cookie = sessionOf(m)
    const link = await resetLink(m.id)

    expect((await api(`/members/${m.id}`, { method: 'PATCH', token: admin, body: { email: m.email.toUpperCase() } })).status).toBe(200)
    let after = await raw(m.id)
    expect(after.sessionVersion).toBe(0)
    expect(after.resetTokenHash).toBe(hashToken(link))
    expect(await connected(cookie)).toBe(200)

    const email = `${unique('corrigee')}@exemple.fr`
    expect((await api(`/members/${m.id}`, { method: 'PATCH', token: admin, body: { email } })).status).toBe(200)
    after = await raw(m.id)
    expect(after.email).toBe(email)
    expect(after.sessionVersion).toBe(1)
    expect(after.resetTokenHash ?? null).toBeNull()
    expect(await connected(cookie)).toBe(401)
    expect((await useLink(link)).body.code).toBe('invalid')
  })

  it('autre champ modifié (note interne) : sessions et lien gardés', async () => {
    const m = await member()
    const cookie = sessionOf(m)
    const link = await resetLink(m.id)
    expect((await api(`/members/${m.id}`, { method: 'PATCH', token: admin, body: { note: 'Appel du 12/11', lastName: 'Durand' } })).status).toBe(200)
    const after = await raw(m.id)
    expect(after.sessionVersion).toBe(0)
    expect(after.resetTokenHash).toBe(hashToken(link))
    expect(await connected(cookie)).toBe(200)
  })

  it('administrateur : les champs techniques (mot de passe, jetons, sessions) ne s’écrivent pas par l’API', async () => {
    const m = await member()
    const before = await raw(m.id)
    const res = await api(`/members/${m.id}`, {
      method: 'PATCH',
      token: admin,
      body: {
        passwordHash: await hashPassword('mot-de-passe-choisi-par-l-equipe'),
        sessionVersion: 7,
        loginAttempts: 4,
        lockUntil: '2035-01-01T00:00:00.000Z',
        resetTokenHash: hashToken('jeton-fabrique'),
        resetTokenExpires: '2035-01-01T00:00:00.000Z',
      },
    })
    expect(res.status).toBeLessThan(500)
    const after = await raw(m.id)
    for (const key of TECHNICAL) expect(after[key] ?? null, key).toEqual(before[key] ?? null)
  })

  it('l’équipe ne peut pas se connecter à la place d’un membre (lien « nouveau mot de passe » fabriqué)', async () => {
    const m = await member()
    const token = unique('jeton-fabrique')
    await api(`/members/${m.id}`, {
      method: 'PATCH',
      token: admin,
      body: { resetTokenHash: hashToken(token), resetTokenExpires: new Date(Date.now() + 3600_000).toISOString() },
    })
    const res = await useLink(token)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('invalid')
    expect(res.response.headers.getSetCookie().some((c) => c.startsWith('sw_membre=v1.'))).toBe(false)
  })

  it('suppression d’un membre : son historique et sa liste avec lui, pas ceux des autres', async () => {
    const gone = await member()
    const kept = await member()
    for (const id of [gone.id, kept.id]) {
      await watched(id, 'video', 201)
      await saved(id, 'event', 202)
    }
    expect((await api(`/members/${gone.id}`, { method: 'DELETE', token: admin })).status).toBe(200)
    const count = (collection: 'member-history' | 'member-favorites', id: number) =>
      payload.count({ collection, where: { member: { equals: id } }, overrideAccess: true }).then((r) => r.totalDocs)
    expect(await count('member-history', gone.id)).toBe(0)
    expect(await count('member-favorites', gone.id)).toBe(0)
    expect(await count('member-history', kept.id)).toBe(1)
    expect(await count('member-favorites', kept.id)).toBe(1)
    expect((await payload.count({ collection: 'members', where: { id: { equals: gone.id } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('suppression groupée (cases à cocher de la liste) : l’activité de chaque membre supprimé disparaît', async () => {
    const a = await member()
    const b = await member()
    for (const id of [a.id, b.id]) {
      await watched(id, 'replay', 301)
      await saved(id, 'video', 302)
    }
    const both = `where[id][in][0]=${a.id}&where[id][in][1]=${b.id}`
    const res = await apiJson<{ docs: Doc[]; errors: unknown[] }>(`/members?${both}`, { method: 'DELETE', token: admin })
    expect(res.status).toBe(200)
    expect(res.body.errors).toEqual([])
    for (const collection of ['member-history', 'member-favorites'] as const) {
      expect((await payload.count({ collection, where: { member: { in: [a.id, b.id] } }, overrideAccess: true })).totalDocs).toBe(0)
    }
  })
})

describe('historique et « Ma liste » des membres : aucun accès par l’API, même pour un administrateur', () => {
  for (const collection of ['member-history', 'member-favorites'] as const) {
    it(`${collection} : REST refusé au visiteur, à l’éditeur et à l’administrateur`, async () => {
      const m = await member()
      const date = collection === 'member-history' ? { watchedAt: new Date().toISOString() } : { savedAt: new Date().toISOString() }
      const row = await payload.create({ collection, data: { member: m.id, kind: 'video', itemId: 401, ...date }, overrideAccess: true })
      for (const token of [undefined, editor, admin]) {
        expect((await api(`/${collection}`, { token })).status).toBe(403)
        expect((await api(`/${collection}/${row.id}`, { token })).status).toBe(403)
        expect((await api(`/${collection}/count`, { token })).status).toBe(403)
        expect((await api(`/${collection}`, { method: 'POST', token, body: { member: m.id, kind: 'video', itemId: 402, ...date } })).status).toBe(403)
        expect((await api(`/${collection}/${row.id}`, { method: 'PATCH', token, body: { itemId: 403 } })).status).toBe(403)
        expect((await api(`/${collection}?where[member][equals]=${m.id}`, { method: 'PATCH', token, body: { itemId: 403 } })).status).toBe(403)
        expect((await api(`/${collection}/${row.id}`, { method: 'DELETE', token })).status).toBe(403)
        expect((await api(`/${collection}?where[member][equals]=${m.id}`, { method: 'DELETE', token })).status).toBe(403)
      }
      const rows = await payload.find({ collection, where: { member: { equals: m.id } }, overrideAccess: true })
      expect(rows.docs.map((r) => [r.id, r.itemId])).toEqual([[row.id, 401]])
    })
  }

  it('GraphQL : ni lecture ni écriture de l’activité des membres, même pour un administrateur', async () => {
    const m = await member()
    await watched(m.id, 'video', 501)
    const spy = quiet()
    for (const token of [undefined, editor, admin]) {
      const read = await graphql('{ MemberHistories { docs { id itemId } } MemberFavorites { docs { id itemId } } }', token)
      expect(read.data?.MemberHistories ?? null).toBeNull()
      expect(read.data?.MemberFavorites ?? null).toBeNull()
      expect(read.errors?.length).toBeGreaterThan(0)
      const data = `{ member: ${m.id}, kind: video, itemId: 502, watchedAt: "2026-10-01T08:00:00.000Z" }`
      const write = await graphql(`mutation { createMemberHistory(data: ${data}) { id } }`, token)
      expect(write.data?.createMemberHistory ?? null).toBeNull()
      expect(write.errors?.length).toBeGreaterThan(0)
    }
    // membres : administrateurs seulement
    for (const token of [undefined, editor]) {
      const res = await graphql(`{ Members(where: { id: { equals: ${m.id} } }) { docs { id email } } }`, token)
      expect(res.data?.Members ?? null).toBeNull()
    }
    const byAdmin = await graphql(`{ Members(where: { id: { equals: ${m.id} } }) { docs { id email } } }`, admin)
    expect(byAdmin.data?.Members).toEqual({ docs: [{ id: m.id, email: m.email }] })
    spy.mockRestore()
    const rows = await payload.find({ collection: 'member-history', where: { member: { equals: m.id } }, overrideAccess: true })
    expect(rows.docs.map((r) => r.itemId)).toEqual([501])
  })
})

describe('messages reçus (formulaire « Proposer une info »)', () => {
  const message = async () => {
    const data = { subject: 'info' as const, name: 'Alex', email: `${unique('alex')}@exemple.fr`, message: 'Un éboulement sur la route du col.' }
    const doc = await payload.create({ collection: 'messages', data, overrideAccess: true })
    messages.push(doc.id)
    return doc
  }

  it('visiteur anonyme : ni lecture ni écriture', async () => {
    const m = await message()
    expect((await api('/messages')).status).toBe(403)
    expect((await api(`/messages/${m.id}`)).status).toBe(403)
    expect((await api('/messages', { method: 'POST', body: { subject: 'info', name: 'Robot', email: 'robot@exemple.fr', message: 'Spam' } })).status).toBe(403)
    expect((await api(`/messages/${m.id}`, { method: 'PATCH', body: { handled: true } })).status).toBe(403)
    expect((await api(`/messages/${m.id}`, { method: 'DELETE' })).status).toBe(403)
    expect((await payload.findByID({ collection: 'messages', id: m.id })).handled).toBe(false)
  })

  it('éditeur : lit les messages et les marque « Traité », sans en créer ni en supprimer', async () => {
    const m = await message()
    expect((await apiJson<Page>(`/messages?where[id][equals]=${m.id}`, { token: editor })).body.totalDocs).toBe(1)
    expect((await apiJson<{ doc: Doc }>(`/messages/${m.id}`, { method: 'PATCH', token: editor, body: { handled: true } })).body.doc.handled).toBe(true)
    const body = { subject: 'info', name: 'Équipe', email: 'equipe@exemple.fr', message: 'Test' }
    expect((await api('/messages', { method: 'POST', token: editor, body })).status).toBe(403)
    expect((await api(`/messages/${m.id}`, { method: 'DELETE', token: editor })).status).toBe(403)
    expect((await payload.count({ collection: 'messages', where: { id: { equals: m.id } } })).totalDocs).toBe(1)
  })

  it('administrateur : lit et supprime un message, mais n’en crée pas (réservé au formulaire du site)', async () => {
    const m = await message()
    expect((await apiJson<Doc>(`/messages/${m.id}`, { token: admin })).body.email).toBe(m.email)
    const body = { subject: 'autre', name: 'Admin', email: 'admin@exemple.fr', message: 'Test' }
    expect((await api('/messages', { method: 'POST', token: admin, body })).status).toBe(403)
    expect((await api(`/messages/${m.id}`, { method: 'DELETE', token: admin })).status).toBe(200)
    expect((await payload.count({ collection: 'messages', where: { id: { equals: m.id } } })).totalDocs).toBe(0)
  })
})

describe('données internes de Payload : pas de fuite', () => {
  it('préférences d’affichage : chacun ne voit et ne change que les siennes', async () => {
    const key = unique('preferences-tests')
    const saved = await apiJson<{ doc: Doc }>(`/payload-preferences/${key}`, { method: 'POST', token: admin, body: { value: { colonnes: ['secret-admin'] } } })
    expect(saved.status).toBe(200)
    const pref = saved.body.doc.id
    try {
      for (const token of [undefined, editor]) {
        const res = await api(`/payload-preferences/${key}`, { token })
        expect(await res.text()).not.toContain('secret-admin')
      }
      expect(JSON.stringify((await apiJson('/payload-preferences?limit=100', { token: editor })).body)).not.toContain('secret-admin')
      expect((await api('/payload-preferences')).status).toBe(403)
      expect((await api(`/payload-preferences/${pref}`, { method: 'PATCH', token: editor, body: { value: { colonnes: ['pirate'] } } })).status).toBe(403)
      const spy = quiet()
      await api(`/payload-preferences/${key}`, { method: 'DELETE', token: editor })
      spy.mockRestore()
      expect(JSON.stringify((await apiJson(`/payload-preferences/${key}`, { token: admin })).body)).toContain('secret-admin')
    } finally {
      await payload.delete({ collection: 'payload-preferences', id: pref })
    }
  })

  it('fiches en cours de modification (verrous) : rien pour le public, aucune donnée d’un membre pour un éditeur', async () => {
    const m = await member({ firstName: 'Secret' })
    const lock = await payload.create({
      collection: 'payload-locked-documents',
      data: { document: { relationTo: 'members', value: m.id }, user: { relationTo: 'users', value: adminId } },
    })
    try {
      expect((await api('/payload-locked-documents')).status).toBe(403)
      expect((await api(`/payload-locked-documents/${lock.id}`)).status).toBe(403)
      const res = await apiJson<Doc>(`/payload-locked-documents/${lock.id}?depth=2`, { token: editor })
      expect(res.status).toBe(200)
      expect((res.body.document as { value: unknown }).value).toBe(m.id)
      expect(JSON.stringify(res.body)).not.toContain(m.email)
      // ni les sessions de l’administrateur qui a ouvert la fiche
      const { sessions } = await payload.findByID({ collection: 'users', id: adminId, showHiddenFields: true })
      expect(sessions?.length).toBeGreaterThan(0)
      for (const session of sessions ?? []) expect(JSON.stringify(res.body)).not.toContain(session.id)
    } finally {
      await payload.delete({ collection: 'payload-locked-documents', id: lock.id })
    }
  })

  it('clés internes et migrations : aucun accès par l’API', async () => {
    for (const token of [undefined, editor, admin]) {
      expect((await api('/payload-kv', { token })).status).toBe(403)
      expect((await api('/payload-kv', { method: 'POST', token, body: { key: 'pirate', data: {} } })).status).toBe(403)
      const migrations = await api('/payload-migrations', { token })
      expect(migrations.status).not.toBe(200)
    }
  })
})
