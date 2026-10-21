// Tests d'intégration de l'activité des membres : historique (contenus publics seulement, doublons, pause, 200 entrées
// au plus, retrait d'une entrée ou de tout), « Ma liste » (500 contenus au plus), export des données (complet, sans
// aucun secret) et suppression du compte (mot de passe exigé, historique et liste effacés, cookies effacés).
import { beforeAll, describe, expect, it } from 'vitest'
import type { Article, Event, Replay, Video } from '@/payload-types'
import { adminToken, api, apiJson, testPayload, type ApiOptions } from './helpers'
import {
  activityOf,
  addActivity,
  adminUpdateMember,
  asMember,
  clearsSession,
  createArticle,
  createEvent,
  createReplay,
  createVideo,
  findMember,
  fromIp,
  memberById,
  memberLogin,
  minutesFromNow,
  newIp,
  signup,
  unpublish,
  type TestMember,
} from './api-outils'

type Kind = 'video' | 'replay' | 'article' | 'event'
type Answer = { ok?: boolean; paused?: boolean; saved?: boolean; error?: string; code?: string; errors?: Record<string, string> }

const SITE = 'http://localhost:3000'
const UNKNOWN = { error: 'Contenu inconnu.' }
const NOT_FOUND = { error: 'Contenu introuvable.' }

let video: Video
let otherVideo: Video
let replay: Replay
let article: Article
let event: Event
/** Contenus que le public ne voit pas (brouillons, programmés, retirés du site, supprimés). */
let hidden: { label: string; kind: Kind; id: number }[] = []

beforeAll(async () => {
  ;[video, otherVideo, replay, article, event] = await Promise.all([createVideo(), createVideo(), createReplay(), createArticle(), createEvent()])
  const [draftVideo, scheduledVideo, retiredVideo, deletedVideo, futureReplay, draftReplay, draftArticle, scheduledArticle, draftEvent] = await Promise.all([
    createVideo({}, { draft: true }),
    createVideo({ publishedAt: minutesFromNow(24 * 60) }),
    createVideo(),
    createVideo(),
    createReplay({ broadcastAt: minutesFromNow(60) }),
    createReplay({}, { draft: true }),
    createArticle({}, { draft: true }),
    createArticle({ publishedAt: minutesFromNow(60) }),
    createEvent({}, { draft: true }),
  ])
  await unpublish('videos', retiredVideo.id)
  await (await testPayload()).delete({ collection: 'videos', id: deletedVideo.id, context: { disableRevalidate: true } })
  hidden = [
    { label: 'vidéo en brouillon', kind: 'video', id: draftVideo.id },
    { label: 'vidéo programmée (publiée demain)', kind: 'video', id: scheduledVideo.id },
    { label: 'vidéo retirée du site', kind: 'video', id: retiredVideo.id },
    { label: 'vidéo supprimée', kind: 'video', id: deletedVideo.id },
    { label: 'vidéo qui n’a jamais existé', kind: 'video', id: 2_147_483_647 },
    { label: 'replay diffusé dans une heure', kind: 'replay', id: futureReplay.id },
    { label: 'replay en brouillon', kind: 'replay', id: draftReplay.id },
    { label: 'article en brouillon', kind: 'article', id: draftArticle.id },
    { label: 'article programmé', kind: 'article', id: scheduledArticle.id },
    { label: 'événement en brouillon', kind: 'event', id: draftEvent.id },
  ]
})

const history = (m: TestMember, body: unknown, options: ApiOptions = {}) => asMember<Answer>(m, m.jar, '/compte/historique', { ...options, body })
const forget = (m: TestMember, query = '', options: ApiOptions = {}) =>
  asMember<Answer>(m, m.jar, `/compte/historique${query}`, { ...options, method: 'DELETE' })
const save = (m: TestMember, body: unknown, options: ApiOptions = {}) => asMember<Answer>(m, m.jar, '/compte/favoris', { ...options, body })
const isSaved = (m: TestMember, query: string) => asMember<Answer>(m, m.jar, `/compte/favoris${query}`)
const unsave = (m: TestMember, query: string, options: ApiOptions = {}) =>
  asMember<Answer>(m, m.jar, `/compte/favoris${query}`, { ...options, method: 'DELETE' })
const iso = (ms: number) => new Date(ms).toISOString()
const OLD = Date.parse('2026-01-01T00:00:00.000Z')

describe('historique', () => {
  it('historique : une vidéo ou un replay publics s’ajoutent (identifiant en nombre ou en texte)', async () => {
    const m = await signup()
    const first = await history(m, { kind: 'video', id: video.id })
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ ok: true })
    expect((await history(m, { kind: 'replay', id: String(replay.id) })).body).toEqual({ ok: true })
    const rows = await activityOf('member-history', m.id)
    expect(rows.map((r) => [r.kind, r.itemId])).toEqual([
      ['replay', replay.id],
      ['video', video.id],
    ])
    for (const r of rows) expect(Date.parse(r.at)).toBeGreaterThan(Date.now() - 60_000)
  })

  it('historique : brouillon, vidéo programmée, replay à venir, contenu retiré, supprimé ou inexistant sont refusés (404)', async () => {
    const m = await signup()
    for (const h of hidden.filter((x) => x.kind === 'video' || x.kind === 'replay')) {
      const res = await history(m, { kind: h.kind, id: h.id })
      expect(res.status, h.label).toBe(404)
      expect(res.body, h.label).toEqual(NOT_FOUND)
    }
    expect(await activityOf('member-history', m.id)).toEqual([])
  })

  it('historique : type ou identifiant invalides (hors bornes, pas un entier) sont refusés (400)', async () => {
    const m = await signup()
    const bodies: unknown[] = [
      { kind: 'article', id: article.id },
      { kind: 'event', id: event.id },
      { kind: 'VIDEO', id: video.id },
      { kind: 'webcam', id: 1 },
      { kind: '', id: video.id },
      { id: video.id },
      { kind: 'video', id: 0 },
      { kind: 'video', id: -1 },
      { kind: 'video', id: 1.5 },
      { kind: 'video', id: 2_147_483_648 },
      { kind: 'video', id: '99999999999' },
      { kind: 'video', id: 'abc' },
      { kind: 'video', id: '12abc' },
      { kind: 'video', id: '' },
      { kind: 'video', id: '  ' },
      { kind: 'video', id: null },
      { kind: 'video' },
      { kind: 'video', id: true },
      { kind: 'video', id: [video.id] },
      { kind: 'video', id: { id: video.id } },
      'pas du json',
      [],
    ]
    for (const body of bodies) {
      const res = await history(m, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(res.body, JSON.stringify(body)).toEqual(UNKNOWN)
    }
    expect(await activityOf('member-history', m.id)).toEqual([])
  })

  it('historique : un contenu revu n’apparaît qu’une fois, remonté en tête', async () => {
    const m = await signup()
    await history(m, { kind: 'video', id: video.id })
    await history(m, { kind: 'video', id: otherVideo.id })
    const firstSeen = (await activityOf('member-history', m.id)).find((r) => r.itemId === video.id)?.at ?? ''
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect((await history(m, { kind: 'video', id: video.id })).body).toEqual({ ok: true })
    const rows = await activityOf('member-history', m.id)
    expect(rows.map((r) => r.itemId)).toEqual([video.id, otherVideo.id])
    expect(Date.parse(rows[0].at)).toBeGreaterThan(Date.parse(firstSeen))
  })

  it('historique : des lectures simultanées du même contenu ne créent pas de doublon', async () => {
    const m = await signup()
    const results = await Promise.all(Array.from({ length: 6 }, () => history(m, { kind: 'video', id: video.id })))
    for (const r of results) expect(r.body).toEqual({ ok: true })
    expect(await activityOf('member-history', m.id)).toHaveLength(1)
  })

  it('historique : en pause, rien n’est enregistré ({ paused: true }) ; à la reprise, l’enregistrement repart', async () => {
    const m = await signup()
    await history(m, { kind: 'video', id: video.id })
    expect((await asMember(m, m.jar, '/compte/profil', { method: 'PATCH', body: { historyPaused: true } })).status).toBe(200)
    const paused = await history(m, { kind: 'replay', id: replay.id })
    expect(paused.status).toBe(200)
    expect(paused.body).toEqual({ ok: true, paused: true })
    // l'historique déjà là reste en place ; une demande invalide reste refusée
    expect((await activityOf('member-history', m.id)).map((r) => r.itemId)).toEqual([video.id])
    expect((await history(m, { kind: 'article', id: article.id })).status).toBe(400)

    await asMember(m, m.jar, '/compte/profil', { method: 'PATCH', body: { historyPaused: false } })
    expect((await history(m, { kind: 'replay', id: replay.id })).body).toEqual({ ok: true })
    expect((await activityOf('member-history', m.id)).map((r) => r.itemId)).toEqual([replay.id, video.id])
  })

  it('historique : 200 entrées au plus, les plus anciennes sont effacées (celles des autres membres ne bougent pas)', async () => {
    const [full, overfull, neighbour] = await Promise.all([signup(), signup(), signup()])
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'video' as const, itemId: 1_000_000 + i, at: iso(OLD + i * 60_000) }))
    await Promise.all([
      addActivity('member-history', full.id, rows(200)),
      addActivity('member-history', overfull.id, rows(202)),
      addActivity('member-history', neighbour.id, rows(3)),
    ])

    expect((await history(full, { kind: 'video', id: video.id })).body).toEqual({ ok: true })
    const kept = await activityOf('member-history', full.id)
    expect(kept).toHaveLength(200)
    expect(kept[0].itemId).toBe(video.id)
    expect(kept.map((r) => r.itemId)).not.toContain(1_000_000)
    expect(kept.map((r) => r.itemId)).toContain(1_000_001)

    // déjà au-delà de la limite : ramené à 200 d'un coup
    expect((await history(overfull, { kind: 'replay', id: replay.id })).body).toEqual({ ok: true })
    const trimmed = (await activityOf('member-history', overfull.id)).map((r) => r.itemId)
    expect(trimmed).toHaveLength(200)
    for (const id of [1_000_000, 1_000_001, 1_000_002]) expect(trimmed).not.toContain(id)
    expect(trimmed).toContain(1_000_003)

    expect(await activityOf('member-history', neighbour.id)).toHaveLength(3)
  })

  it('historique : DELETE d’une entrée ne retire qu’elle (et retirer une entrée absente ne fait rien)', async () => {
    const m = await signup()
    await history(m, { kind: 'video', id: video.id })
    await history(m, { kind: 'replay', id: replay.id })
    const res = await forget(m, `?kind=video&id=${video.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect((await activityOf('member-history', m.id)).map((r) => r.kind)).toEqual(['replay'])
    expect((await forget(m, `?kind=video&id=${video.id}`)).body).toEqual({ ok: true })
    expect(await activityOf('member-history', m.id)).toHaveLength(1)
  })

  it('historique : DELETE sans paramètre efface tout l’historique du membre, pas celui des autres', async () => {
    const [m, other] = await Promise.all([signup(), signup()])
    await history(m, { kind: 'video', id: video.id })
    await history(m, { kind: 'replay', id: replay.id })
    await history(other, { kind: 'video', id: video.id })
    expect((await forget(m)).body).toEqual({ ok: true })
    expect(await activityOf('member-history', m.id)).toEqual([])
    expect(await activityOf('member-history', other.id)).toHaveLength(1)
  })

  it('historique : DELETE avec un paramètre invalide est refusé (400) et n’efface rien', async () => {
    const m = await signup()
    await history(m, { kind: 'video', id: video.id })
    await history(m, { kind: 'replay', id: replay.id })
    const queries = [
      '?kind=video',
      `?id=${video.id}`,
      `?kind=article&id=${article.id}`,
      `?kind=VIDEO&id=${video.id}`,
      '?kind=video&id=abc',
      '?kind=video&id=0',
      '?kind=video&id=-3',
      '?kind=video&id=2147483648',
      '?kind=&id=',
      '?tout=1',
      '?foo=bar',
    ]
    for (const query of queries) {
      const res = await forget(m, query)
      expect(res.status, query).toBe(400)
      expect(res.body, query).toEqual(UNKNOWN)
    }
    expect(await activityOf('member-history', m.id)).toHaveLength(2)
  })

  it('historique : ajout et retrait refusés depuis un autre site (403)', async () => {
    const m = await signup()
    await history(m, { kind: 'video', id: video.id })
    const other = { origin: 'https://autre-site.example' }
    expect((await history(m, { kind: 'replay', id: replay.id }, other)).status).toBe(403)
    expect((await forget(m, '', other)).status).toBe(403)
    expect((await forget(m, `?kind=video&id=${video.id}`, other)).status).toBe(403)
    expect(await activityOf('member-history', m.id)).toHaveLength(1)
  })
})

describe('Ma liste', () => {
  it('Ma liste : vidéo, replay, article et événement publics s’ajoutent, se consultent et se retirent', async () => {
    const m = await signup()
    const items: [Kind, number][] = [
      ['video', video.id],
      ['replay', replay.id],
      ['article', article.id],
      ['event', event.id],
    ]
    for (const [kind, id] of items) {
      const query = `?kind=${kind}&id=${id}`
      expect((await isSaved(m, query)).body, kind).toEqual({ saved: false })
      const res = await save(m, { kind, id })
      expect(res.status, kind).toBe(200)
      expect(res.body, kind).toEqual({ saved: true })
      expect((await isSaved(m, query)).body, kind).toEqual({ saved: true })
    }
    expect(await activityOf('member-favorites', m.id)).toHaveLength(4)
    for (const [kind, id] of items) {
      const query = `?kind=${kind}&id=${id}`
      expect((await unsave(m, query)).body, kind).toEqual({ saved: false })
      expect((await isSaved(m, query)).body, kind).toEqual({ saved: false })
    }
    expect(await activityOf('member-favorites', m.id)).toEqual([])
  })

  it('Ma liste : un contenu que le public ne voit pas est refusé (404) ; un type ou un identifiant invalides aussi (400)', async () => {
    const m = await signup()
    for (const h of hidden) {
      const res = await save(m, { kind: h.kind, id: h.id })
      expect(res.status, h.label).toBe(404)
      expect(res.body, h.label).toEqual(NOT_FOUND)
    }
    for (const [kind, id] of [
      ['webcam', 1],
      ['program', 1],
      ['page', 1],
      ['Video', video.id],
      ['video', 0],
      ['video', 'abc'],
      ['article', 2_147_483_648],
    ] as const) {
      const query = `?kind=${kind}&id=${id}`
      expect((await save(m, { kind, id })).body, query).toEqual(UNKNOWN)
      expect((await isSaved(m, query)).body, query).toEqual(UNKNOWN)
      expect((await unsave(m, query)).body, query).toEqual(UNKNOWN)
    }
    expect((await isSaved(m, '')).status).toBe(400)
    expect(await activityOf('member-favorites', m.id)).toEqual([])
  })

  it('Ma liste : un contenu ajouté plusieurs fois (ou en même temps) n’y figure qu’une fois', async () => {
    const m = await signup()
    await save(m, { kind: 'article', id: article.id })
    const first = (await activityOf('member-favorites', m.id))[0]?.at ?? ''
    await new Promise((resolve) => setTimeout(resolve, 5))
    const results = await Promise.all(Array.from({ length: 4 }, () => save(m, { kind: 'article', id: String(article.id) })))
    for (const r of results) expect(r.body).toEqual({ saved: true })
    const rows = await activityOf('member-favorites', m.id)
    expect(rows).toHaveLength(1)
    expect(Date.parse(rows[0].at)).toBeGreaterThan(Date.parse(first))
  })

  it('Ma liste : 500 contenus au plus (409 au-delà) ; un contenu déjà présent reste accepté', async () => {
    const m = await signup()
    await addActivity('member-favorites', m.id, [
      { kind: 'article', itemId: article.id, at: iso(OLD) },
      ...Array.from({ length: 499 }, (_, i) => ({ kind: 'video' as const, itemId: 2_000_000 + i, at: iso(OLD + (i + 1) * 60_000) })),
    ])
    const full = await save(m, { kind: 'video', id: video.id })
    expect(full.status).toBe(409)
    expect(full.body).toEqual({ error: 'Votre liste est pleine (500 contenus) : retirez-en quelques-uns.' })
    expect((await isSaved(m, `?kind=video&id=${video.id}`)).body).toEqual({ saved: false })
    // déjà dans la liste : toujours « enregistré »
    expect((await save(m, { kind: 'article', id: article.id })).body).toEqual({ saved: true })
    expect(await activityOf('member-favorites', m.id)).toHaveLength(500)
    // retirer un contenu libère une place
    expect((await unsave(m, '?kind=video&id=2000000')).body).toEqual({ saved: false })
    expect((await save(m, { kind: 'video', id: video.id })).body).toEqual({ saved: true })
    expect(await activityOf('member-favorites', m.id)).toHaveLength(500)
  })

  it('Ma liste : la liste d’un membre est invisible des autres, qui ne peuvent pas non plus la modifier', async () => {
    const [m, other] = await Promise.all([signup(), signup()])
    await save(m, { kind: 'article', id: article.id })
    const query = `?kind=article&id=${article.id}`
    expect((await isSaved(other, query)).body).toEqual({ saved: false })
    expect((await unsave(other, query)).body).toEqual({ saved: false })
    expect((await isSaved(m, query)).body).toEqual({ saved: true })
  })

  it('Ma liste : ajout et retrait refusés depuis un autre site (403)', async () => {
    const m = await signup()
    await save(m, { kind: 'article', id: article.id })
    const other = { origin: 'https://autre-site.example' }
    expect((await save(m, { kind: 'event', id: event.id }, other)).status).toBe(403)
    expect((await unsave(m, `?kind=article&id=${article.id}`, other)).status).toBe(403)
    expect((await activityOf('member-favorites', m.id)).map((r) => r.kind)).toEqual(['article'])
  })
})

describe('export des données', () => {
  it('export : toutes les données du membre (profil, historique, liste), en pièce jointe JSON', async () => {
    const payload = await testPayload()
    const m = await signup()
    await asMember(m, m.jar, '/compte/profil', { method: 'PATCH', body: { lastName: 'Martin', department: 'isere', newsletter: true } })
    for (const [kind, id] of [
      ['video', video.id],
      ['replay', replay.id],
    ] as const) {
      await history(m, { kind, id })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const gone = await createVideo()
    for (const [kind, id] of [
      ['article', article.id],
      ['event', event.id],
      ['video', video.id],
      ['video', gone.id],
    ] as const) {
      await save(m, { kind, id })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    // contenu supprimé depuis : il reste dans l'export, signalé comme retiré
    await payload.delete({ collection: 'videos', id: gone.id, context: { disableRevalidate: true } })

    const res = await api('/compte/export', { cookie: m.jar.header(), headers: fromIp(m.ip) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="mes-donnees-swatter-tv.json"')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const data = (await res.json()) as Record<string, unknown>

    const member = await findMember(m.email)
    const watched = await activityOf('member-history', m.id)
    const saved = await activityOf('member-favorites', m.id)
    expect(Date.parse(String(data.exportéLe))).toBeGreaterThan(Date.now() - 60_000)
    expect(data).toEqual({
      exportéLe: expect.any(String),
      profil: {
        firstName: 'Camille',
        lastName: 'Martin',
        email: m.email,
        department: 'isere',
        newsletter: true,
        historyPaused: false,
        createdAt: member?.createdAt,
        département: 'Isère',
        conditionsAcceptéesLe: member?.consentAt,
        dernièreConnexion: member?.lastLoginAt,
      },
      historique: [
        { type: 'replay', titre: replay.title, adresse: `${SITE}/replay/${replay.slug}`, regardéLe: watched[0].at },
        { type: 'video', titre: video.title, adresse: `${SITE}/videos/${video.slug}`, regardéLe: watched[1].at },
      ],
      maListe: [
        { type: 'video', titre: '(contenu retiré du site)', adresse: null, ajoutéLe: saved[0].at },
        { type: 'video', titre: video.title, adresse: `${SITE}/videos/${video.slug}`, ajoutéLe: saved[1].at },
        { type: 'event', titre: event.title, adresse: `${SITE}/agenda/${event.slug}`, ajoutéLe: saved[2].at },
        { type: 'article', titre: article.title, adresse: `${SITE}/info/haute-savoie/${article.slug}`, ajoutéLe: saved[3].at },
      ],
    })
  })

  it('export : aucun secret (empreinte du mot de passe, session, jetons, compteurs, note interne de l’équipe)', async () => {
    const m = await signup()
    await adminUpdateMember(m.id, { note: 'Note interne : signalé par la rédaction' })
    await memberLogin({ email: m.email, password: 'mauvais-mot-de-passe' })
    await apiJson('/compte/mot-de-passe-oublie', { body: { email: m.email }, headers: fromIp(newIp()) })
    // lien « nouveau mot de passe » enregistré (après la réponse)
    let member = await findMember(m.email)
    for (let i = 0; i < 50 && !member?.resetTokenHash; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      member = await findMember(m.email)
    }
    expect(member?.resetTokenHash).toBeTruthy()
    expect(member?.loginAttempts).toBe(1)

    const res = await api('/compte/export', { cookie: m.jar.header(), headers: fromIp(m.ip) })
    const text = await res.text()
    const secrets = [member?.passwordHash, member?.resetTokenHash, m.password, m.jar.get('sw_membre'), 'scrypt$', 'Note interne']
    for (const secret of secrets) expect(text).not.toContain(secret)
    for (const key of ['passwordHash', 'sessionVersion', 'loginAttempts', 'lockUntil', 'resetTokenHash', 'resetTokenExpires', 'note']) {
      expect(text, key).not.toContain(`"${key}"`)
    }
    const data = JSON.parse(text) as { profil: Record<string, unknown> }
    expect(Object.keys(data.profil).sort()).toEqual(
      [
        'firstName',
        'lastName',
        'email',
        'department',
        'newsletter',
        'historyPaused',
        'createdAt',
        'département',
        'conditionsAcceptéesLe',
        'dernièreConnexion',
      ].sort(),
    )
  })
})

describe('suppression du compte', () => {
  const remove = (m: TestMember, body: unknown, options: ApiOptions = {}) => asMember<Answer>(m, m.jar, '/compte/supprimer', { ...options, body })

  it('suppression : le mot de passe est exigé', async () => {
    const m = await signup()
    for (const password of ['mauvais-mot-de-passe', '', undefined]) {
      const res = await remove(m, { password })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ errors: { current: 'Mot de passe incorrect.' } })
    }
    expect(await findMember(m.email)).not.toBeNull()
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(200)
  })

  it('suppression : le compte, son historique et sa liste sont effacés, les cookies aussi ; les autres sessions ne servent plus', async () => {
    const [m, other] = await Promise.all([signup(), signup()])
    const phone = await memberLogin(m)
    await history(m, { kind: 'video', id: video.id })
    await history(m, { kind: 'replay', id: replay.id })
    await save(m, { kind: 'article', id: article.id })
    await save(m, { kind: 'event', id: event.id })
    await history(other, { kind: 'video', id: video.id })
    await save(other, { kind: 'article', id: article.id })

    const res = await remove(m, { password: m.password })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(clearsSession(res.response)).toBe(true)
    expect(m.jar.header()).toBe('')

    expect(await memberById(m.id)).toBeNull()
    expect(await activityOf('member-history', m.id)).toEqual([])
    expect(await activityOf('member-favorites', m.id)).toEqual([])
    // rien n'est touché chez les autres membres
    expect(await activityOf('member-history', other.id)).toHaveLength(1)
    expect(await activityOf('member-favorites', other.id)).toHaveLength(1)

    const stale = await asMember(m, phone.jar, '/compte/moi')
    expect(stale.status).toBe(401)
    expect(clearsSession(stale.response)).toBe(true)
    expect((await memberLogin(m)).status).toBe(401)
    // l'adresse est libérée : une nouvelle inscription est possible
    expect((await signup({ email: m.email })).email).toBe(m.email)
  })

  it('suppression : demandée pendant que des vidéos s’ajoutent à l’historique, elle aboutit sans laisser de ligne orpheline', async () => {
    const payload = await testPayload()
    const m = await signup()
    await history(m, { kind: 'video', id: video.id })
    const results = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) => history(m, { kind: i % 2 ? 'replay' : 'video', id: i % 2 ? replay.id : otherVideo.id })),
      remove(m, { password: m.password }),
      ...Array.from({ length: 8 }, () => history(m, { kind: 'replay', id: replay.id })),
    ])
    expect(results[8].status).toBe(200)
    // les ajouts arrivés après la fermeture des sessions sont refusés (401), les autres ont abouti avant la suppression
    for (const r of results.filter((_, i) => i !== 8)) expect([200, 401]).toContain(r.status)
    expect(await memberById(m.id)).toBeNull()
    expect(await activityOf('member-history', m.id)).toEqual([])
    expect((await payload.count({ collection: 'member-history', where: { member: { exists: false } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('suppression : 5 essais de mot de passe par quart d’heure, puis refus (429 locked), compte conservé', async () => {
    const m = await signup()
    for (let i = 0; i < 5; i++) expect((await remove(m, { password: `faux-mot-de-passe-${i}` })).status).toBe(400)
    const res = await remove(m, { password: m.password })
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Trop d’essais : réessayez dans 15 minutes.', code: 'locked' })
    expect(await findMember(m.email)).not.toBeNull()
  })

  it('suppression : possible même quand un tiers a bloqué la connexion au compte', async () => {
    const m = await signup()
    for (let i = 0; i < 5; i++) await memberLogin({ email: m.email, password: 'essai-d-un-tiers' })
    expect((await memberLogin(m)).status).toBe(429)
    expect((await remove(m, { password: m.password })).status).toBe(200)
    expect(await memberById(m.id)).toBeNull()
  })

  it('suppression par un administrateur : l’historique et la liste du membre sont effacés avec son compte', async () => {
    const [m, other] = await Promise.all([signup(), signup()])
    await history(m, { kind: 'video', id: video.id })
    await save(m, { kind: 'article', id: article.id })
    await save(other, { kind: 'article', id: article.id })
    const res = await apiJson(`/members/${m.id}`, { method: 'DELETE', token: await adminToken() })
    expect(res.status).toBe(200)
    expect(await memberById(m.id)).toBeNull()
    expect(await activityOf('member-history', m.id)).toEqual([])
    expect(await activityOf('member-favorites', m.id)).toEqual([])
    expect(await activityOf('member-favorites', other.id)).toHaveLength(1)
    expect((await asMember(m, m.jar, '/compte/moi')).status).toBe(401)
  })

  it('suppression : refusée depuis un autre site (403) ou sans session (401), le compte est conservé', async () => {
    const m = await signup()
    const res = await remove(m, { password: m.password }, { origin: 'https://autre-site.example' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Requête refusée.' })
    const anonymous = await apiJson('/compte/supprimer', { body: { password: m.password }, headers: fromIp(newIp()) })
    expect(anonymous.status).toBe(401)
    expect(await findMember(m.email)).not.toBeNull()
  })
})
