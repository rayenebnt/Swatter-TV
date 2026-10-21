// Droits d’accès aux contenus du site par l’API REST (visiteur anonyme, éditeur, administrateur) : lecture des seuls
// contenus publiés (jamais un brouillon, même avec ?draft=true ; ni un contenu programmé plus tard, ni une publicité hors
// période), historique des versions, création, modification et suppression, relations vers un brouillon, médiathèque et
// redirections.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import config from '@payload-config'
import { handleEndpoints, type CollectionSlug, type Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SITE, adminToken, api, apiJson, editorToken, testPayload, unique } from './helpers'

type Doc = { id: number } & Record<string, unknown>
type Page = { docs: Doc[]; totalDocs: number }

/** Collections du site à brouillons (src/lib/publication.ts). */
const CONTENUS = ['videos', 'articles', 'events', 'replays', 'schedule', 'programs', 'webcams', 'ads', 'pages'] as const
type Contenu = (typeof CONTENUS)[number]

const NOMS: Record<Contenu, string> = {
  videos: 'vidéos',
  articles: 'articles',
  events: 'agenda',
  replays: 'replays',
  schedule: 'grille des programmes',
  programs: 'émissions',
  webcams: 'webcams',
  ads: 'publicités',
  pages: 'pages',
}

/** Champ qui porte le titre affiché (celui qu’un brouillon modifie dans ces tests). */
const TITRE: Record<Contenu, string> = {
  videos: 'title',
  articles: 'title',
  events: 'title',
  replays: 'title',
  schedule: 'titleOverride',
  programs: 'title',
  webcams: 'name',
  ads: 'name',
  pages: 'title',
}

const PASSE = '2025-06-01T08:00:00.000Z'
const FUTUR = '2035-06-01T08:00:00.000Z'

let payload: Payload
let editor: string
let admin: string
let image: number
let program: number
const created: { collection: CollectionSlug; id: number }[] = []

const track = <T extends { id: number }>(collection: CollectionSlug, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

/** Données valides (publiables) d’un contenu, avec son titre. */
function valid(collection: Contenu, title: string): Record<string, unknown> {
  const video = { source: { provider: 'url', url: 'https://exemple.fr/video.mp4' }, thumbnail: image }
  switch (collection) {
    case 'videos':
      return { title, ...video, category: 'info', publishedAt: PASSE }
    case 'articles':
      return { title, department: 'isere', publishedAt: PASSE }
    case 'events':
      return { title, startDate: '2031-06-01T10:00:00.000Z', city: 'Annecy', department: 'haute-savoie' }
    case 'replays':
      return { title, ...video, broadcastAt: PASSE }
    case 'schedule':
      return { startsAt: '2031-06-01T18:00:00.000Z', durationMinutes: 30, program, titleOverride: title }
    case 'programs':
      return { title, genre: 'magazine' }
    case 'webcams':
      return { name: title, department: 'savoie', provider: 'iframe', embedUrl: 'https://exemple.fr/webcam' }
    case 'ads':
      return { name: title, placement: 'home-leaderboard', image, active: true }
    case 'pages':
      return { title }
  }
}

/** Contenu publié (API locale). */
async function published(collection: Contenu, extra: Record<string, unknown> = {}): Promise<Doc> {
  const data = { ...valid(collection, unique('Publié')), ...extra, _status: 'published' }
  return track(collection, (await payload.create({ collection, data: data as never })) as unknown as Doc)
}

/** Brouillon jamais publié (API locale, comme l’enregistrement automatique). */
const draftOnly = async (collection: Contenu) =>
  track(collection, (await payload.create({ collection, data: valid(collection, unique('Brouillon')) as never, draft: true })) as unknown as Doc)

type GraphqlResult = { data?: Record<string, { docs?: Doc[] } | null> | null; errors?: { message: string }[] }

/** Requête GraphQL (/api/graphql), comme un client de l’API. */
async function graphql(query: string, token?: string): Promise<GraphqlResult> {
  const { GRAPHQL_POST } = await import('@payloadcms/next/routes')
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) headers.set('authorization', `JWT ${token}`)
  const res = await GRAPHQL_POST(config)(new Request(`${SITE}/api/graphql`, { method: 'POST', headers, body: JSON.stringify({ query }) }))
  return res.json()
}

const where = (ids: number[]) => ids.map((id, i) => `where[id][in][${i}]=${id}`).join('&')
const idsOf = (page: Page) => page.docs.map((d) => d.id).sort((a, b) => a - b)

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  admin = await adminToken()
  const filePath = path.resolve('public/og/hero-matin.jpg')
  image = track('media', await payload.create({ collection: 'media', data: { alt: 'Image des tests de droits' }, filePath })).id
  const show = { title: unique('Émission publiée'), genre: 'info' as const, _status: 'published' as const }
  program = track('programs', await payload.create({ collection: 'programs', data: show })).id
})

afterAll(async () => {
  for (const { collection, id } of created.reverse()) await payload.delete({ collection, id, context: { disableRevalidate: true } }).catch(() => undefined)
})

describe('lecture par le public : seuls les contenus publiés', () => {
  for (const collection of CONTENUS) {
    it(`${NOMS[collection]} : publié visible, brouillon jamais (liste, fiche, ?draft=true, comptage)`, async () => {
      const pub = await published(collection)
      const draft = await draftOnly(collection)
      // contenu en ligne dont une nouvelle version est en cours d’écriture (brouillon enregistré automatiquement)
      const changed = await published(collection)
      const draftTitle = unique('Titre pas encore publié')
      await payload.update({ collection, id: changed.id, data: { [TITRE[collection]]: draftTitle } as never, draft: true, autosave: true })
      const all = [pub.id, draft.id, changed.id]

      const list = await apiJson<Page>(`/${collection}?${where(all)}&limit=50`)
      expect(list.status).toBe(200)
      expect(idsOf(list.body)).toEqual([pub.id, changed.id].sort((a, b) => a - b))
      expect(list.body.docs.find((d) => d.id === changed.id)?.[TITRE[collection]]).toBe(changed[TITRE[collection]])
      expect(JSON.stringify(list.body)).not.toContain(draftTitle)

      const asDraft = await apiJson<Page>(`/${collection}?${where(all)}&limit=50&draft=true`)
      expect(asDraft.status).toBe(200)
      expect(asDraft.body.docs.map((d) => d.id)).not.toContain(draft.id)
      expect(JSON.stringify(asDraft.body)).not.toContain(draftTitle)

      expect((await api(`/${collection}/${pub.id}`)).status).toBe(200)
      expect((await api(`/${collection}/${draft.id}`)).status).toBe(404)
      expect((await api(`/${collection}/${draft.id}?draft=true`)).status).toBe(404)
      const changedAsDraft = await api(`/${collection}/${changed.id}?draft=true`)
      expect(await changedAsDraft.text()).not.toContain(draftTitle)

      const count = await apiJson<{ totalDocs: number }>(`/${collection}/count?${where(all)}`)
      expect(count.body.totalDocs).toBe(2)
      const hidden = await apiJson<Page>(`/${collection}?${where(all)}&where[_status][equals]=draft`)
      expect(hidden.body.docs).toEqual([])
    })
  }

  for (const collection of CONTENUS) {
    it(`${NOMS[collection]} : l’équipe voit les brouillons et, avec ?draft=true, la dernière version`, async () => {
      const draft = await draftOnly(collection)
      const changed = await published(collection)
      const draftTitle = unique('Nouvelle version')
      await payload.update({ collection, id: changed.id, data: { [TITRE[collection]]: draftTitle } as never, draft: true, autosave: true })
      for (const token of [editor, admin]) {
        const list = await apiJson<Page>(`/${collection}?${where([draft.id, changed.id])}`, { token })
        expect(idsOf(list.body)).toEqual([draft.id, changed.id].sort((a, b) => a - b))
        // sans ?draft=true : la version en ligne ; avec : la dernière version
        expect(list.body.docs.find((d) => d.id === changed.id)?.[TITRE[collection]]).toBe(changed[TITRE[collection]])
        const latest = await apiJson<Doc>(`/${collection}/${changed.id}?draft=true`, { token })
        expect(latest.body[TITRE[collection]]).toBe(draftTitle)
        expect((await api(`/${collection}/${draft.id}`, { token })).status).toBe(200)
      }
    })
  }

  for (const collection of CONTENUS) {
    it(`${NOMS[collection]} : l’historique des versions est réservé à l’équipe`, async () => {
      const doc = await published(collection)
      const versions = await payload.findVersions({ collection, where: { parent: { equals: doc.id } } })
      expect(versions.docs.length).toBeGreaterThan(0)
      const version = versions.docs[0].id
      expect((await api(`/${collection}/versions?where[parent][equals]=${doc.id}`)).status).toBe(403)
      expect((await api(`/${collection}/versions/${version}`)).status).toBe(403)
      expect((await api(`/${collection}/versions/${version}`, { method: 'POST' })).status).toBe(403)
      const team = await apiJson<Page>(`/${collection}/versions?where[parent][equals]=${doc.id}`, { token: editor })
      expect(team.status).toBe(200)
      expect(team.body.totalDocs).toBe(versions.totalDocs)
    })
  }
})

describe('contenus programmés plus tard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  for (const [collection, field] of [
    ['articles', 'publishedAt'],
    ['videos', 'publishedAt'],
    ['replays', 'broadcastAt'],
  ] as const) {
    it(`${NOMS[collection]} : invisibles du public jusqu’à leur date (${field}), visibles de l’équipe`, async () => {
      const later = await published(collection, { [field]: FUTUR })
      const now = await published(collection)
      const both = where([later.id, now.id])
      expect(idsOf((await apiJson<Page>(`/${collection}?${both}`)).body)).toEqual([now.id])
      expect(idsOf((await apiJson<Page>(`/${collection}?${both}&draft=true`)).body)).toEqual([now.id])
      expect((await api(`/${collection}/${later.id}`)).status).toBe(404)
      expect((await api(`/${collection}/${later.id}?draft=true`)).status).toBe(404)
      expect((await apiJson<{ totalDocs: number }>(`/${collection}/count?${both}`)).body.totalDocs).toBe(1)
      for (const token of [editor, admin]) {
        expect(idsOf((await apiJson<Page>(`/${collection}?${both}`, { token })).body)).toEqual([later.id, now.id].sort((a, b) => a - b))
      }
    })

    it(`${NOMS[collection]} : un contenu programmé apparaît tout seul à sa date`, async () => {
      const at = '2031-05-14T06:00:00.000Z'
      const doc = await published(collection, { [field]: at })
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(Date.parse(at) - 60_000))
      expect((await api(`/${collection}/${doc.id}`)).status).toBe(404)
      vi.setSystemTime(new Date(at))
      expect((await api(`/${collection}/${doc.id}`)).status).toBe(200)
    })
  }

  it('publicités : ni inactives, ni à venir, ni terminées pour le public ; toutes pour l’équipe', async () => {
    const running = await published('ads')
    const inactive = await published('ads', { active: false })
    const upcoming = await published('ads', { startsAt: '2035-01-10T12:00:00.000Z' })
    const ended = await published('ads', { endsAt: '2025-01-10T12:00:00.000Z' })
    const all = [running.id, inactive.id, upcoming.id, ended.id]
    expect(idsOf((await apiJson<Page>(`/ads?${where(all)}`)).body)).toEqual([running.id])
    expect(idsOf((await apiJson<Page>(`/ads?${where(all)}&draft=true`)).body)).toEqual([running.id])
    for (const id of [inactive.id, upcoming.id, ended.id]) expect((await api(`/ads/${id}`)).status).toBe(404)
    for (const token of [editor, admin]) expect(idsOf((await apiJson<Page>(`/ads?${where(all)}`, { token })).body)).toEqual(all.sort((a, b) => a - b))
  })

  it('publicités : la campagne court du premier jour à 0 h jusqu’à la fin du dernier jour, heure de Paris', async () => {
    // jours saisis dans l’administration : enregistrés à midi UTC
    const ad = await published('ads', { startsAt: '2031-01-10T12:00:00.000Z', endsAt: '2031-01-12T12:00:00.000Z' })
    const visible = async (iso: string) => {
      vi.setSystemTime(new Date(iso))
      return (await api(`/ads/${ad.id}`)).status === 200
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    // hiver : Paris = UTC+1
    expect(await visible('2031-01-09T22:59:59.999Z')).toBe(false)
    expect(await visible('2031-01-09T23:00:00.000Z')).toBe(true)
    expect(await visible('2031-01-11T12:00:00.000Z')).toBe(true)
    expect(await visible('2031-01-12T22:59:59.999Z')).toBe(true)
    expect(await visible('2031-01-12T23:00:00.000Z')).toBe(false)
  })

  it('publicités : jours de changement d’heure (passage à l’heure d’été le 30 mars 2031)', async () => {
    const ad = await published('ads', { startsAt: '2031-03-30T12:00:00.000Z', endsAt: '2031-03-30T12:00:00.000Z' })
    const visible = async (iso: string) => {
      vi.setSystemTime(new Date(iso))
      return (await api(`/ads/${ad.id}`)).status === 200
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    // le 30 mars commence à 0 h UTC+1 et finit à minuit UTC+2
    expect(await visible('2031-03-29T22:59:59.999Z')).toBe(false)
    expect(await visible('2031-03-29T23:00:00.000Z')).toBe(true)
    expect(await visible('2031-03-30T21:59:59.999Z')).toBe(true)
    expect(await visible('2031-03-30T22:00:00.000Z')).toBe(false)
  })
})

describe('GraphQL : mêmes règles que l’API REST', () => {
  it('le public ne lit ni brouillon, ni contenu programmé, ni modification en attente, ni historique', async () => {
    const pub = await published('articles')
    const draft = await draftOnly('articles')
    const later = await published('articles', { publishedAt: FUTUR })
    const changed = await published('articles')
    const pending = unique('Titre en attente')
    await payload.update({ collection: 'articles', id: changed.id, data: { title: pending }, draft: true, autosave: true })
    const ids = [pub.id, draft.id, later.id, changed.id].map((id) => `{ id: { equals: ${id} } }`).join(', ')
    const list = (draftArg: boolean) => `{ Articles(draft: ${draftArg}, where: { OR: [${ids}] }, limit: 50) { docs { id title } } }`
    const spy = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)
    try {
      const online = await graphql(list(false))
      expect(online.errors).toBeUndefined()
      const visible = (online.data?.Articles?.docs ?? []).map((d) => Number(d.id))
      expect(visible.sort((a, b) => a - b)).toEqual([pub.id, changed.id].sort((a, b) => a - b))
      const asDraft = await graphql(list(true))
      expect(asDraft.errors).toBeUndefined()
      const seen = (asDraft.data?.Articles?.docs ?? []).map((d) => Number(d.id))
      expect(seen).not.toContain(draft.id)
      expect(seen).not.toContain(later.id)
      for (const result of [online, asDraft]) expect(JSON.stringify(result)).not.toContain(pending)
      const one = await graphql(`{ Article(id: ${draft.id}, draft: true) { title } }`)
      expect(one.data?.Article ?? null).toBeNull()
      const versions = await graphql(`{ versionsArticles(where: { parent: { equals: ${changed.id} } }) { docs { id } } }`)
      expect(versions.data?.versionsArticles ?? null).toBeNull()
      expect(versions.errors?.length).toBeGreaterThan(0)
      // l’équipe, elle, lit la dernière version
      const team = await graphql(list(true), editor)
      expect((team.data?.Articles?.docs ?? []).map((d) => Number(d.id))).toContain(draft.id)
      expect(JSON.stringify(team.data)).toContain(pending)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('écritures du visiteur anonyme : toujours refusées', () => {
  for (const collection of CONTENUS) {
    it(`${NOMS[collection]} : ni création, ni modification, ni suppression, ni duplication, ni restauration`, async () => {
      const doc = await published(collection)
      const title = unique('Pirate')
      const field = TITRE[collection]
      const create = await apiJson(`/${collection}`, { method: 'POST', body: { ...valid(collection, title), _status: 'published' } })
      expect(create.status).toBe(403)
      expect((await api(`/${collection}?draft=true`, { method: 'POST', body: valid(collection, title) })).status).toBe(403)
      expect((await api(`/${collection}/${doc.id}`, { method: 'PATCH', body: { [field]: title } })).status).toBe(403)
      expect((await api(`/${collection}?where[id][equals]=${doc.id}`, { method: 'PATCH', body: { [field]: title } })).status).toBe(403)
      expect((await api(`/${collection}/${doc.id}?draft=true`, { method: 'PATCH', body: { [field]: title } })).status).toBe(403)
      expect((await api(`/${collection}/${doc.id}`, { method: 'DELETE' })).status).toBe(403)
      expect((await api(`/${collection}?where[id][equals]=${doc.id}`, { method: 'DELETE' })).status).toBe(403)
      expect((await api(`/${collection}/${doc.id}/duplicate`, { method: 'POST' })).status).toBe(403)
      const [version] = (await payload.findVersions({ collection, where: { parent: { equals: doc.id } }, limit: 1 })).docs
      expect((await api(`/${collection}/versions/${version.id}`, { method: 'POST' })).status).toBe(403)

      const after = (await payload.findByID({ collection, id: doc.id, draft: true })) as unknown as Doc
      expect(after[field]).toBe(doc[field])
      const found = await payload.find({ collection, where: { [field]: { equals: title } }, draft: true })
      expect(found.totalDocs).toBe(0)
    })
  }
})

describe('écritures de l’équipe : éditeur et administrateur', () => {
  for (const collection of CONTENUS) {
    for (const role of ['éditeur', 'administrateur'] as const) {
      it(`${NOMS[collection]} : un ${role} crée, publie, modifie et supprime`, async () => {
        const token = role === 'éditeur' ? editor : admin
        const field = TITRE[collection]
        const body = { ...valid(collection, unique('Équipe')), _status: 'published' }
        const create = await apiJson<{ doc: Doc }>(`/${collection}`, { method: 'POST', token, body })
        expect(create.status).toBe(201)
        const id = track(collection, create.body.doc).id
        expect(create.body.doc._status).toBe('published')
        expect((await api(`/${collection}/${id}`)).status).toBe(200)

        const title = unique('Modifié')
        const update = await apiJson<{ doc: Doc }>(`/${collection}/${id}`, { method: 'PATCH', token, body: { [field]: title } })
        expect(update.status).toBe(200)
        expect(update.body.doc[field]).toBe(title)

        const draft = await apiJson<{ doc: Doc }>(`/${collection}?draft=true`, { method: 'POST', token, body: valid(collection, unique('Brouillon équipe')) })
        expect(draft.status).toBe(201)
        expect(track(collection, draft.body.doc)._status).toBe('draft')

        expect((await api(`/${collection}/${id}`, { method: 'DELETE', token })).status).toBe(200)
        expect((await api(`/${collection}/${id}`, { token })).status).toBe(404)
      })
    }
  }

  it('sans statut ni ?draft=true, une création reste un brouillon invisible du public', async () => {
    const res = await apiJson<{ doc: Doc }>('/pages', { method: 'POST', token: editor, body: valid('pages', unique('Sans statut')) })
    expect(res.status).toBe(201)
    const doc = track('pages', res.body.doc)
    expect(doc._status).toBe('draft')
    expect((await api(`/pages/${doc.id}`)).status).toBe(404)
  })
})

describe('relations vers un contenu non publié', () => {
  it('un replay en ligne ne révèle pas son émission en brouillon (seulement son numéro)', async () => {
    const hidden = await draftOnly('programs')
    const replay = await published('replays', { program: hidden.id })
    const res = await apiJson<Doc>(`/replays/${replay.id}?depth=2`)
    expect(res.status).toBe(200)
    expect(res.body.program).toBe(hidden.id)
    const team = await apiJson<Doc>(`/replays/${replay.id}?depth=1`, { token: editor })
    expect((team.body.program as Doc).id).toBe(hidden.id)
  })

  it('un créneau en ligne ne révèle pas son émission en brouillon', async () => {
    const hidden = await draftOnly('programs')
    const slot = await published('schedule', { program: hidden.id })
    const res = await apiJson<Doc>(`/schedule/${slot.id}?depth=1`)
    expect(res.status).toBe(200)
    expect(res.body.program).toBe(hidden.id)
  })

  it('une redirection vers une page en brouillon n’en révèle que le numéro', async () => {
    const hidden = await draftOnly('pages')
    const to = { type: 'reference' as const, reference: { relationTo: 'pages' as const, value: hidden.id } }
    const redirect = track('redirects', await payload.create({ collection: 'redirects', data: { from: `/${unique('ancienne-adresse')}`, to } }))
    const res = await apiJson<{ to: { reference: { relationTo: string; value: unknown } } }>(`/redirects/${redirect.id}?depth=2`)
    expect(res.status).toBe(200)
    expect(res.body.to.reference.value).toBe(hidden.id)
  })
})

/** Envoi d’un fichier par l’API REST (multipart), comme le formulaire de la médiathèque. */
async function upload(file: { data: Buffer | string; name: string; type: string }, data: Record<string, unknown>, token?: string): Promise<Response> {
  const form = new FormData()
  form.append('file', new Blob([file.data], { type: file.type }), file.name)
  form.append('_payload', JSON.stringify(data))
  const headers = new Headers({ origin: SITE })
  if (token) headers.set('authorization', `JWT ${token}`)
  return handleEndpoints({ config, request: new Request(`${SITE}/api/media`, { method: 'POST', body: form, headers }) })
}

describe('médiathèque', () => {
  const jpeg = () => ({ data: readFileSync(path.resolve('public/og/hero-matin.jpg')), name: `${unique('envoi')}.jpg`, type: 'image/jpeg' })

  it('lecture publique des médias et de leurs fichiers', async () => {
    const list = await apiJson<Page>(`/media?where[id][equals]=${image}`)
    expect(list.status).toBe(200)
    expect(list.body.totalDocs).toBe(1)
    const media = list.body.docs[0] as Doc & { url: string }
    const file = await api(new URL(media.url).pathname.replace(/^\/api/, ''))
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toMatch(/^image\//)
  })

  it('fichiers : rien hors de la médiathèque (chemins piégés)', async () => {
    const spy = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)
    for (const trap of ['..%2F..%2F.env', '%2e%2e%2f%2e%2e%2f.env', '..%5C..%5C.env', '%2Fetc%2Fpasswd', '..%2F..%2Fpackage.json']) {
      const res = await api(`/media/file/${trap}`)
      const text = await res.text()
      expect(res.status, trap).not.toBe(200)
      for (const secret of ['PAYLOAD_SECRET', 'DATABASE_URI', 'root:', '"dependencies"']) expect(text, trap).not.toContain(secret)
    }
    spy.mockRestore()
  })

  it('visiteur anonyme : ni envoi, ni modification, ni suppression', async () => {
    expect((await upload(jpeg(), { alt: 'Pirate' })).status).toBe(403)
    expect((await api(`/media/${image}`, { method: 'PATCH', body: { alt: 'Pirate' } })).status).toBe(403)
    expect((await api(`/media/${image}`, { method: 'DELETE' })).status).toBe(403)
    expect((await api(`/media?where[id][equals]=${image}`, { method: 'DELETE' })).status).toBe(403)
    expect((await payload.findByID({ collection: 'media', id: image })).alt).toBe('Image des tests de droits')
  })

  for (const role of ['éditeur', 'administrateur'] as const) {
    it(`un ${role} envoie, modifie et supprime un média`, async () => {
      const token = role === 'éditeur' ? editor : admin
      const res = await upload(jpeg(), { alt: 'Le lac au matin' }, token)
      expect(res.status).toBe(201)
      const { doc } = (await res.json()) as { doc: Doc }
      track('media', doc)
      expect((await apiJson<{ doc: Doc }>(`/media/${doc.id}`, { method: 'PATCH', token, body: { alt: 'Le lac au soir' } })).body.doc.alt).toBe('Le lac au soir')
      expect((await api(`/media/${doc.id}`, { method: 'DELETE', token })).status).toBe(200)
    })
  }

  it('pas de SVG (qui peut contenir du script), même pour un administrateur', async () => {
    const svg = { data: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', name: `${unique('logo')}.svg`, type: 'image/svg+xml' }
    const spy = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)
    const res = await upload(svg, { alt: 'Logo' }, admin)
    spy.mockRestore()
    expect(res.status).toBe(400)
    expect((await payload.find({ collection: 'media', where: { filename: { like: svg.name.replace(/\.svg$/, '') } } })).totalDocs).toBe(0)
  })

  it('description vide : reprise du nom du fichier', async () => {
    const name = `${unique('lac_annecy-matin')}.jpg`
    const res = await upload({ ...jpeg(), name }, {}, editor)
    expect(res.status).toBe(201)
    const { doc } = (await res.json()) as { doc: Doc }
    track('media', doc)
    const expected = name.replace(/\.jpg$/, '').replace(/[-_.]+/g, ' ')
    expect(doc.alt).toBe(expected.charAt(0).toUpperCase() + expected.slice(1))
  })
})

describe('redirections', () => {
  const body = () => ({ from: `/${unique('ancien-lien')}`, to: { type: 'custom' as const, url: '/programme-tv' } })

  it('lecture publique (anciennes adresses), écritures refusées au visiteur', async () => {
    const doc = track('redirects', await payload.create({ collection: 'redirects', data: body() }))
    expect((await api(`/redirects/${doc.id}`)).status).toBe(200)
    expect((await api('/redirects', { method: 'POST', body: body() })).status).toBe(403)
    expect((await api(`/redirects/${doc.id}`, { method: 'PATCH', body: { from: '/pirate' } })).status).toBe(403)
    expect((await api(`/redirects/${doc.id}`, { method: 'DELETE' })).status).toBe(403)
  })

  it('un administrateur crée, modifie et supprime une redirection', async () => {
    const res = await apiJson<{ doc: Doc }>('/redirects', { method: 'POST', token: admin, body: body() })
    expect(res.status).toBe(201)
    const id = track('redirects', res.body.doc).id
    const from = `/${unique('autre-lien')}`
    expect((await apiJson<{ doc: Doc }>(`/redirects/${id}`, { method: 'PATCH', token: admin, body: { from } })).body.doc.from).toBe(from)
    expect((await api(`/redirects/${id}`, { method: 'DELETE', token: admin })).status).toBe(200)
  })

  it('un éditeur ne gère pas les redirections (réservées aux administrateurs)', async () => {
    const doc = track('redirects', await payload.create({ collection: 'redirects', data: body() }))
    const create = await apiJson<{ doc?: Doc }>('/redirects', { method: 'POST', token: editor, body: body() })
    if (create.body?.doc) track('redirects', create.body.doc)
    expect(create.status).toBe(403)
    expect((await api(`/redirects/${doc.id}`, { method: 'PATCH', token: editor, body: { from: `/${unique('pirate')}` } })).status).toBe(403)
    expect((await api(`/redirects/${doc.id}`, { method: 'DELETE', token: editor })).status).toBe(403)
    expect((await payload.findByID({ collection: 'redirects', id: doc.id })).from).toBe(doc.from)
  })
})
