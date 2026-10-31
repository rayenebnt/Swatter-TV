// Hooks et règles des contenus : adresses uniques (« titre », « titre-2 »…), Top 10 sans doublon (comme une liste qu’on
// réordonne, y compris par le parcours de l’administration : enregistrement automatique en brouillon puis publication),
// brouillons, publication, retrait du site et historique des versions, webcams (« Web Cams + », lien et image facultatifs)
// et grille des programmes (titre de la fiche, contrôles, recopie de semaine en heure de Paris).
import path from 'node:path'
import type { CollectionSlug, Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { slugify } from '@/lib/slugify'
import { api, apiJson, adminToken, editorToken, testPayload, unique } from './helpers'

type Doc = { id: number } & Record<string, unknown>

const PASSE = '2025-06-01T08:00:00.000Z'

let payload: Payload
let editor: string
let admin: string
let image: number
const created: { collection: CollectionSlug; id: number }[] = []

const track = <T extends { id: number }>(collection: CollectionSlug, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  admin = await adminToken()
  const filePath = path.resolve('public/og/hero-matin.jpg')
  image = track('media', await payload.create({ collection: 'media', data: { alt: 'Image des tests de hooks' }, filePath })).id
})

afterAll(async () => {
  for (const { collection, id } of created.reverse()) {
    await payload.delete({ collection, id, context: { disableRevalidate: true, top10Reorder: true } }).catch(() => undefined)
  }
})

/** Création par l’API REST (comme l’administration), contenu publié. */
async function post(collection: CollectionSlug, body: Record<string, unknown>, token = editor): Promise<Doc> {
  const res = await apiJson<{ doc: Doc }>(`/${collection}`, { method: 'POST', token, body: { _status: 'published', ...body } })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return track(collection, res.body.doc)
}

describe('adresses uniques (slug)', () => {
  for (const collection of ['articles', 'replays'] as const) {
    it(`${collection} : même titre → « titre », « titre-2 », « titre-3 »`, async () => {
      const title = unique('Le journal des Alpes')
      const video = { source: { provider: 'url', url: 'https://exemple.fr/journal.mp4' }, thumbnail: image }
      const extra = collection === 'articles' ? { department: 'savoie' } : video
      const docs = [await post(collection, { title, ...extra }), await post(collection, { title, ...extra }), await post(collection, { title, ...extra })]
      const base = slugify(title)
      expect(docs.map((d) => d.slug)).toEqual([base, `${base}-2`, `${base}-3`])
      // chaque adresse mène au bon contenu
      for (const doc of docs) {
        const found = await apiJson<{ docs: Doc[] }>(`/${collection}?where[slug][equals]=${doc.slug}`)
        expect(found.body.docs.map((d) => d.id)).toEqual([doc.id])
      }
    })
  }

  it('même titre dans deux rubriques : la même adresse dans chacune', async () => {
    const title = unique('Fête du lac')
    const article = await post('articles', { title, department: 'haute-savoie' })
    const event = await post('events', { title, startDate: '2031-07-14T20:00:00.000Z', city: 'Annecy', department: 'haute-savoie' })
    const page = await post('pages', { title })
    expect([article.slug, event.slug, page.slug]).toEqual([slugify(title), slugify(title), slugify(title)])
  })

  it('modifier le titre ne change pas l’adresse d’un contenu existant', async () => {
    const article = await post('articles', { title: unique('Titre de départ'), department: 'ain' })
    const renamed = await apiJson<{ doc: Doc }>(`/articles/${article.id}`, { method: 'PATCH', token: editor, body: { title: unique('Titre corrigé') } })
    expect(renamed.body.doc.slug).toBe(article.slug)
    // parcours de l’administration : brouillon enregistré automatiquement, puis publication (le formulaire renvoie l’adresse)
    const autosave = { title: unique('Titre en cours'), slug: article.slug }
    await api(`/articles/${article.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: autosave })
    const publish = { title: unique('Titre final'), slug: article.slug, _status: 'published' }
    const published = await apiJson<{ doc: Doc }>(`/articles/${article.id}`, { method: 'PATCH', token: editor, body: publish })
    expect(published.body.doc.slug).toBe(article.slug)
  })

  it('une fiche réenregistrée garde son adresse (elle ne se compte pas elle-même)', async () => {
    const page = await post('pages', { title: unique('Mentions légales') })
    const saved = await apiJson<{ doc: Doc }>(`/pages/${page.id}`, { method: 'PATCH', token: editor, body: { title: page.title, slug: page.slug } })
    expect(saved.body.doc.slug).toBe(page.slug)
  })

  it('adresse saisie à la main : nettoyée, puis différenciée si elle est déjà prise', async () => {
    const typed = unique('Mon Adresse Spéciale')
    const first = await post('pages', { title: unique('Page'), slug: `  ${typed} !` })
    expect(first.slug).toBe(slugify(typed))
    const second = await post('pages', { title: unique('Autre page'), slug: typed })
    expect(second.slug).toBe(`${slugify(typed)}-2`)
  })

  it('webcams et émissions : adresse tirée du nom ou du titre', async () => {
    const name = unique('Lac du Bourget')
    const cam = await post('webcams', { name, department: 'savoie', provider: 'iframe' })
    const cam2 = await post('webcams', { name, department: 'savoie', provider: 'iframe' })
    expect([cam.slug, cam2.slug]).toEqual([slugify(name), `${slugify(name)}-2`])
    const title = unique('Le Mag des sorties')
    expect((await post('programs', { title, genre: 'magazine' })).slug).toBe(slugify(title))
  })

  it('titre très long : l’adresse et son suffixe tiennent en 96 caractères', async () => {
    const title = `${unique('Titre')} ${'très long '.repeat(15)}`
    const a = await post('articles', { title, department: 'rhone' })
    const b = await post('articles', { title, department: 'rhone' })
    for (const slug of [a.slug, b.slug] as string[]) {
      expect(slug.length).toBeLessThanOrEqual(96)
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
    expect(b.slug).not.toBe(a.slug)
    expect(b.slug).toMatch(/-2$/)
  })
})

describe('Top 10 (src/hooks/top10.ts)', () => {
  /** Vidéos classées par d’autres tests : sorties du classement le temps d’un test (écriture directe, sans décalage). */
  let foreign: { id: number; rank: number }[] = []
  const mine: number[] = []

  beforeEach(async () => {
    const { docs } = await payload.find({ collection: 'videos', where: { top10Rank: { exists: true } }, pagination: false, depth: 0 })
    foreign = docs.flatMap((d) => (typeof d.top10Rank === 'number' ? [{ id: d.id, rank: d.top10Rank }] : []))
    for (const f of foreign) await payload.db.updateOne({ collection: 'videos', id: f.id, data: { top10Rank: null } })
  })

  afterEach(async () => {
    for (const id of mine.splice(0)) {
      await payload.delete({ collection: 'videos', id, context: { top10Reorder: true, disableRevalidate: true } }).catch(() => undefined)
    }
    for (const f of foreign) await payload.db.updateOne({ collection: 'videos', id: f.id, data: { top10Rank: f.rank } })
  })

  /** Vidéos publiées aux places données (créées dans l’ordre : aucun décalage à la création). */
  async function ranked(...places: (number | null)[]): Promise<Doc[]> {
    const out: Doc[] = []
    for (const top10Rank of places) {
      const doc = await payload.create({
        collection: 'videos',
        data: {
          title: unique('Vidéo classée'),
          source: { provider: 'url', url: 'https://exemple.fr/top.mp4' },
          thumbnail: image,
          category: 'divertissement',
          publishedAt: PASSE,
          top10Rank,
          _status: 'published',
        },
        context: { disableRevalidate: true },
      })
      mine.push(doc.id)
      out.push(doc as unknown as Doc)
    }
    return out
  }

  /** Places en ligne (ligne principale) des vidéos, dans l’ordre donné. */
  async function places(videos: Doc[]): Promise<(number | null)[]> {
    const { docs } = await payload.find({ collection: 'videos', where: { id: { in: videos.map((v) => v.id) } }, depth: 0, pagination: false })
    const byId = new Map(docs.map((d) => [d.id, d.top10Rank ?? null]))
    return videos.map((v) => byId.get(v.id) ?? null)
  }

  const setRank = (video: Doc, top10Rank: number | null) => apiJson(`/videos/${video.id}`, { method: 'PATCH', token: editor, body: { top10Rank } })

  /** Parcours de l’administration : la saisie est enregistrée automatiquement en brouillon, puis publiée. */
  async function setRankAsAdminForm(video: Doc, top10Rank: number | null) {
    expect((await api(`/videos/${video.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { top10Rank } })).status).toBe(200)
    expect((await api(`/videos/${video.id}?depth=0`, { method: 'PATCH', token: editor, body: { top10Rank, _status: 'published' } })).status).toBe(200)
  }

  it('une vidéo publiée à la place 1 décale les suivantes d’un cran', async () => {
    const [a, b, c] = await ranked(1, 2, 3)
    const res = await apiJson<{ doc: Doc }>('/videos', {
      method: 'POST',
      token: editor,
      body: {
        title: unique('Nouvelle n° 1'),
        source: { provider: 'url', url: 'https://exemple.fr/n1.mp4' },
        thumbnail: image,
        category: 'sport',
        top10Rank: 1,
        _status: 'published',
      },
    })
    expect(res.status).toBe(201)
    mine.push(res.body.doc.id)
    expect(await places([res.body.doc, a, b, c])).toEqual([1, 2, 3, 4])
  })

  it('le décalage s’arrête à la première place libre', async () => {
    const [a, b, c, d] = await ranked(1, 2, 4, 5)
    const [e] = await ranked(null)
    expect((await setRank(e, 1)).status).toBe(200)
    expect(await places([e, a, b, c, d])).toEqual([1, 2, 3, 4, 5])
    const [f] = await ranked(null)
    expect((await setRank(f, 3)).status).toBe(200)
    expect(await places([e, a, f, b, c, d])).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('au-delà de la 10e place, la dernière vidéo sort du classement', async () => {
    const top = await ranked(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    const [n] = await ranked(null)
    await setRank(n, 1)
    expect(await places([n, ...top])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null])
  })

  it('une vidéo qui monte (3e → 1re) : celles qu’elle dépasse descendent', async () => {
    const [a, b, c, d] = await ranked(1, 2, 3, 4)
    await setRank(c, 1)
    expect(await places([c, a, b, d])).toEqual([1, 2, 3, 4])
  })

  it('une vidéo qui descend (1re → 3e) : celles qui la suivaient remontent', async () => {
    const [a, b, c, d] = await ranked(1, 2, 3, 4)
    await setRank(a, 3)
    expect(await places([b, c, a, d])).toEqual([1, 2, 3, 4])
  })

  it('une vidéo qui quitte le Top 10 (place vidée) : les suivantes remontent', async () => {
    const [a, b, c, d] = await ranked(1, 2, 3, 5)
    await setRank(b, null)
    expect(await places([a, c, b, d])).toEqual([1, 2, null, 5])
  })

  it('une vidéo classée supprimée : les suivantes remontent', async () => {
    const [a, b, c] = await ranked(1, 2, 3)
    expect((await api(`/videos/${a.id}`, { method: 'DELETE', token: editor })).status).toBe(200)
    expect(await places([b, c])).toEqual([1, 2])
  })

  it('un brouillon ne change pas le classement en ligne ; sa publication, oui', async () => {
    const [a, b] = await ranked(1, 2)
    const [c] = await ranked(null)
    expect((await api(`/videos/${c.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { top10Rank: 1 } })).status).toBe(200)
    expect(await places([a, b, c])).toEqual([1, 2, null])
    expect((await api(`/videos/${c.id}`, { method: 'PATCH', token: editor, body: { _status: 'published' } })).status).toBe(200)
    expect(await places([c, a, b])).toEqual([1, 2, 3])
  })

  it('administration (brouillon puis publication) : une vidéo qui monte', async () => {
    const [a, b, c, d] = await ranked(1, 2, 3, 4)
    await setRankAsAdminForm(c, 1)
    expect(await places([c, a, b, d])).toEqual([1, 2, 3, 4])
  })

  it('administration (brouillon puis publication) : une vidéo qui descend libère sa place en ligne', async () => {
    const [a, b, c, d] = await ranked(1, 2, 3, 4)
    await setRankAsAdminForm(a, 3)
    expect(await places([b, c, a, d])).toEqual([1, 2, 3, 4])
  })

  it('administration (brouillon puis publication) : une vidéo retirée du Top 10 fait remonter les suivantes', async () => {
    const [a, b, c] = await ranked(1, 2, 3)
    await setRankAsAdminForm(a, null)
    expect(await places([a, b, c])).toEqual([null, 1, 2])
  })

  it('une vidéo décalée qui a des modifications non publiées reste en ligne, avec son contenu publié', async () => {
    const [a, b] = await ranked(1, 2)
    const pending = unique('Titre pas encore publié')
    expect((await api(`/videos/${a.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { title: pending } })).status).toBe(200)
    const [n] = await ranked(null)
    await setRank(n, 1)
    expect(await places([n, a, b])).toEqual([1, 2, 3])
    // le public voit toujours la vidéo décalée, avec son titre publié
    const pub = await apiJson<Doc>(`/videos/${a.id}`)
    expect(pub.status).toBe(200)
    expect(pub.body.title).toBe(a.title)
    // et la modification en cours reste un brouillon
    const latest = await apiJson<Doc>(`/videos/${a.id}?draft=true`, { token: editor })
    expect(latest.body.title).toBe(pending)
  })

  it('places uniques : aucune place en double après une série de changements', async () => {
    const videos = await ranked(1, 2, 3, 4, 5, null, null)
    await setRank(videos[5], 2)
    await setRank(videos[6], 4)
    await setRank(videos[0], 6)
    await setRank(videos[3], null)
    const ranks = (await places(videos)).filter((r): r is number => r !== null)
    expect(new Set(ranks).size).toBe(ranks.length)
    expect(ranks.every((r) => r >= 1 && r <= 10)).toBe(true)
  })

  it('la place se limite à 1 à 10', async () => {
    const [v] = await ranked(null)
    for (const top10Rank of [0, 11, -1]) expect((await setRank(v, top10Rank)).status, String(top10Rank)).toBe(400)
    expect(await places([v])).toEqual([null])
  })
})

describe('brouillons, publication et versions', () => {
  it('cycle complet : brouillon invisible, publication, modification en attente, retrait du site', async () => {
    const title = unique('Info en préparation')
    const res = await apiJson<{ doc: Doc }>('/articles?draft=true', { method: 'POST', token: editor, body: { title, department: 'drome' } })
    expect(res.status).toBe(201)
    const doc = track('articles', res.body.doc)
    expect(doc._status).toBe('draft')
    expect((await api(`/articles/${doc.id}`)).status).toBe(404)

    // publication
    const pub = await apiJson<{ doc: Doc }>(`/articles/${doc.id}`, { method: 'PATCH', token: editor, body: { _status: 'published' } })
    expect(pub.body.doc._status).toBe('published')
    expect((await apiJson<Doc>(`/articles/${doc.id}`)).body.title).toBe(title)

    // modification enregistrée en brouillon : le public garde la version en ligne
    const next = unique('Info corrigée')
    expect((await api(`/articles/${doc.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { title: next } })).status).toBe(200)
    expect((await apiJson<Doc>(`/articles/${doc.id}`)).body.title).toBe(title)
    expect((await apiJson<Doc>(`/articles/${doc.id}?draft=true`, { token: editor })).body.title).toBe(next)
    const live = await payload.findByID({ collection: 'articles', id: doc.id })
    expect(live._status).toBe('published')
    expect(live.title).toBe(title)

    // « Publier les modifications »
    await api(`/articles/${doc.id}`, { method: 'PATCH', token: editor, body: { title: next, _status: 'published' } })
    expect((await apiJson<Doc>(`/articles/${doc.id}`)).body.title).toBe(next)

    // « Retirer du site » : redevient un brouillon, invisible, mais garde ses versions publiées
    const unpublished = await apiJson<{ doc: Doc }>(`/articles/${doc.id}`, { method: 'PATCH', token: editor, body: { _status: 'draft' } })
    expect(unpublished.body.doc._status).toBe('draft')
    expect((await api(`/articles/${doc.id}`)).status).toBe(404)
    const versions = await payload.findVersions({ collection: 'articles', where: { parent: { equals: doc.id } }, limit: 100 })
    expect(versions.docs.some((v) => v.version._status === 'published')).toBe(true)
    expect(versions.docs.some((v) => v.version._status === 'draft')).toBe(true)
  })

  it('une modification publiée crée une nouvelle version ; l’historique garde 25 versions au plus par fiche', async () => {
    const doc = track('pages', await payload.create({ collection: 'pages', data: { title: unique('Page versionnée'), _status: 'published' } }))
    const count = async () => (await payload.countVersions({ collection: 'pages', where: { parent: { equals: doc.id } } })).totalDocs
    expect(await count()).toBe(1)
    await api(`/pages/${doc.id}`, { method: 'PATCH', token: editor, body: { intro: 'Première retouche' } })
    expect(await count()).toBe(2)
    for (let i = 0; i < 30; i++) {
      await payload.update({ collection: 'pages', id: doc.id, data: { intro: `Retouche ${i}` }, context: { disableRevalidate: true } })
    }
    expect(await count()).toBe(25)
    const latest = await payload.findVersions({ collection: 'pages', where: { parent: { equals: doc.id } }, sort: '-updatedAt', limit: 1 })
    expect(latest.docs[0].version.intro).toBe('Retouche 29')
  })

  it('validation : un brouillon peut être incomplet, la publication exige les champs obligatoires', async () => {
    const draft = await apiJson<{ doc: Doc }>('/events?draft=true', { method: 'POST', token: editor, body: { title: unique('Sortie à compléter') } })
    expect(draft.status).toBe(201)
    const doc = track('events', draft.body.doc)
    const refused = await apiJson(`/events/${doc.id}`, { method: 'PATCH', token: editor, body: { _status: 'published' } })
    expect(refused.status).toBe(400)
    expect((await payload.findByID({ collection: 'events', id: doc.id }))._status).toBe('draft')
    const ok = await apiJson<{ doc: Doc }>(`/events/${doc.id}`, {
      method: 'PATCH',
      token: editor,
      body: { startDate: '2031-08-01T18:00:00.000Z', city: 'Chambéry', department: 'savoie', _status: 'published' },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.doc._status).toBe('published')
  })

  it('vidéo ou replay Bunny Stream : image obligatoire à la publication (elle n’est pas tirée de la vidéo), pas en brouillon', async () => {
    for (const collection of ['videos', 'replays'] as const) {
      const body = { title: unique('Sans image'), source: { provider: 'bunny', bunnyVideoId: 'abc-123' } }
      const refused = await apiJson(`/${collection}`, { method: 'POST', token: editor, body: { ...body, _status: 'published' } })
      expect(refused.status).toBe(400)
      expect(JSON.stringify(refused.body)).toContain('Ajoutez une image : elle n’est pas tirée automatiquement d’une vidéo Bunny Stream.')
      const draft = await apiJson<{ doc: Doc }>(`/${collection}?draft=true`, { method: 'POST', token: editor, body })
      expect(draft.status).toBe(201)
      track(collection, draft.body.doc)
    }
  })

  it('vidéo ou replay par lien direct ou fichier envoyé : publiable sans image (tirée de la vidéo, ou visuel de remplacement)', async () => {
    const warn = vi.spyOn(payload.logger, 'warn').mockImplementation(() => undefined)
    try {
      for (const collection of ['videos', 'replays'] as const) {
        // lien injoignable (port fermé) : enregistré quand même, sans image
        const body = { title: unique('Sans image'), source: { provider: 'url', url: 'http://127.0.0.1:9/sans-image.mp4' }, _status: 'published' }
        const res = await apiJson<{ doc: Doc }>(`/${collection}`, { method: 'POST', token: editor, body })
        expect(res.status, JSON.stringify(res.body)).toBe(201)
        track(collection, res.body.doc)
        expect(res.body.doc.thumbnail ?? null).toBeNull()
      }
    } finally {
      warn.mockRestore()
    }
  })
})

describe('webcams', () => {
  it('« Web Cams + » (hors région) accepté ; lien du flux et image facultatifs', async () => {
    const cam = await post('webcams', { name: unique('Genève — le jet d’eau'), department: 'plus', provider: 'iframe' })
    const pub = await apiJson<Doc>(`/webcams/${cam.id}`)
    expect(pub.status).toBe(200)
    expect(pub.body.department).toBe('plus')
    expect(pub.body.embedUrl ?? null).toBeNull()
    expect(pub.body.image ?? null).toBeNull()
    // une webcam ordinaire, elle aussi sans lien ni image (« Bientôt en direct »)
    const soon = await post('webcams', { name: unique('Le Puy-en-Velay'), department: 'haute-loire', provider: 'hls' })
    expect(soon.embedUrl ?? null).toBeNull()
    expect(soon.active).toBe(true)
  })

  it('département hors liste refusé ; « plus » réservé aux webcams', async () => {
    const aoste = { name: unique('Aoste'), department: 'aoste', provider: 'iframe', _status: 'published' }
    const cam = await apiJson('/webcams', { method: 'POST', token: editor, body: aoste })
    expect(cam.status).toBe(400)
    const suisse = { title: unique('Info suisse'), department: 'plus', _status: 'published' }
    const article = await apiJson('/articles', { method: 'POST', token: editor, body: suisse })
    expect(article.status).toBe(400)
    const event = await apiJson('/events', {
      method: 'POST',
      token: editor,
      body: { title: unique('Sortie suisse'), startDate: '2031-07-01T10:00:00.000Z', city: 'Genève', department: 'plus', _status: 'published' },
    })
    expect(event.status).toBe(400)
  })
})

describe('grille des programmes', () => {
  let program: Doc
  /** Plages de dates des créneaux de ces tests (nettoyées à la fin). */
  const ranges: [string, string][] = []

  beforeAll(async () => {
    program = await post('programs', { title: unique('Le journal des Alpes'), genre: 'info' })
  })

  afterAll(async () => {
    for (const [from, to] of ranges) {
      const where = { and: [{ startsAt: { greater_than_equal: from } }, { startsAt: { less_than: to } }] }
      await payload.delete({ collection: 'schedule', where, context: { disableRevalidate: true } })
    }
  })

  async function slot(startsAt: string, extra: Record<string, unknown> = {}): Promise<Doc> {
    return post('schedule', { startsAt, durationMinutes: 30, program: program.id, ...extra })
  }

  const slotsBetween = async (from: string, to: string) =>
    (
      await payload.find({
        collection: 'schedule',
        where: { and: [{ startsAt: { greater_than_equal: from } }, { startsAt: { less_than: to } }] },
        sort: 'startsAt',
        pagination: false,
        depth: 0,
      })
    ).docs

  type CopyResult = { copied?: number; replaced?: number; target?: string; error?: string }
  const copy = (body: Record<string, unknown>, token = editor) => apiJson<CopyResult>('/schedule/copy-week', { method: 'POST', token, body })

  it('titre de la fiche : « jour heure — émission » en heure de Paris, ou le titre spécifique ; après minuit, la soirée de la veille', async () => {
    ranges.push(['2031-11-01T00:00:00.000Z', '2031-11-10T00:00:00.000Z'])
    const winter = await slot('2031-11-05T19:30:00.000Z')
    expect(winter.label).toBe(`05/11/2031 20:30 — ${program.title}`)
    const special = await slot('2031-11-06T17:00:00.000Z', { titleOverride: 'Le journal des Alpes — Soir' })
    expect(special.label).toBe('06/11/2031 18:00 — Le journal des Alpes — Soir')
    // déplacé : le titre suit la nouvelle date
    const moved = await apiJson<{ doc: Doc }>(`/schedule/${winter.id}`, { method: 'PATCH', token: editor, body: { startsAt: '2031-11-08T22:15:00.000Z' } })
    expect(moved.body.doc.label).toBe(`08/11/2031 23:15 — ${program.title}`)
    // dimanche 9 à 0 h 15 (heure d'hiver) : fin de la soirée du samedi 8
    const night = await apiJson<{ doc: Doc }>(`/schedule/${winter.id}`, {
      method: 'PATCH',
      token: editor,
      body: { startsAt: '2031-11-08T23:15:00.000Z', durationMinutes: 15 },
    })
    expect(night.status, JSON.stringify(night.body)).toBe(200)
    expect(night.body.doc.label).toBe(`Soirée du 08/11/2031, 00:15 — ${program.title}`)
  })

  it('contrôles : horaires d’antenne (18 h – 0 h 30), durée de 1 à 390 minutes, émission obligatoire à la publication', async () => {
    ranges.push(['2031-12-01T00:00:00.000Z', '2031-12-02T00:00:00.000Z'])
    // lundi 1er décembre 2031, 19 h à Paris : seule la durée est en cause
    for (const durationMinutes of [0, 391]) {
      const body = { startsAt: '2031-12-01T18:00:00.000Z', durationMinutes, program: program.id, _status: 'published' }
      const res = await apiJson('/schedule', { method: 'POST', token: editor, body })
      expect(res.status, String(durationMinutes)).toBe(400)
    }
    // 11 h : hors antenne, refusé avec un message en français (le champ et sa raison)
    const morning = await apiJson<{ errors?: { data?: { errors?: { path: string; message: string }[] } }[] }>('/schedule', {
      method: 'POST',
      token: editor,
      body: { startsAt: '2031-12-01T10:00:00.000Z', durationMinutes: 30, program: program.id, _status: 'published' },
    })
    expect(morning.status).toBe(400)
    expect(morning.body.errors?.[0]?.data?.errors).toEqual([expect.objectContaining({ path: 'startsAt', message: expect.stringMatching(/entre 18:00 et 00:25/) })])
    // 23 h 45 + 60 min : finirait à 0 h 45
    const late = await apiJson('/schedule', {
      method: 'POST',
      token: editor,
      body: { startsAt: '2031-12-01T22:45:00.000Z', durationMinutes: 60, program: program.id, _status: 'published' },
    })
    expect(late.status).toBe(400)
    expect(JSON.stringify(late.body)).toMatch(/après la fin de l'antenne \(0 h 30\)/)
    const orphan = { startsAt: '2031-12-01T18:00:00.000Z', durationMinutes: 30, _status: 'published' }
    const noProgram = await apiJson('/schedule', { method: 'POST', token: editor, body: orphan })
    expect(noProgram.status).toBe(400)
    expect(await slotsBetween('2031-12-01T00:00:00.000Z', '2031-12-02T00:00:00.000Z')).toEqual([])
  })

  it('recopie de semaine : réservée à l’équipe, demande une semaine valide', async () => {
    const anonymous = await apiJson<{ error?: string }>('/schedule/copy-week', { method: 'POST', body: { from: '2032-05-03' } })
    expect(anonymous.status).toBe(401)
    expect(anonymous.body.error).toMatch(/Connectez-vous/)
    for (const body of [{ from: 'lundi' }, { from: '2032-13-45' }, { from: '2032-05-03', days: 3 }, {}]) {
      expect((await copy(body)).status, JSON.stringify(body)).toBe(400)
    }
    for (const token of [editor, admin]) {
      const empty = await copy({ from: '2032-05-03' }, token)
      expect(empty.status).toBe(400)
      expect(empty.body.error).toMatch(/ne contient aucun créneau/)
    }
  })

  it('recopie de semaine : même jour et même heure de Paris sept jours plus tard, passage à l’heure d’hiver compris', async () => {
    // semaine TV du lundi 20 octobre 2031 à 0 h 30 au lundi 27 à 0 h 30 ; heure d’hiver le dimanche 26 à 3 h
    ranges.push(['2031-10-19T00:00:00.000Z', '2031-11-04T00:00:00.000Z'])
    await slot('2031-10-19T22:15:00.000Z', { durationMinutes: 15 }) // lundi 20 à 0 h 15 : fin de la soirée du dimanche, semaine précédente
    await slot('2031-10-20T18:30:00.000Z', { titleOverride: 'Lundi soir' }) // lundi 20 à 20 h 30 (UTC+2)
    await slot('2031-10-20T22:00:00.000Z', { titleOverride: 'Nuit du lundi' }) // mardi 21 à 0 h : soirée du lundi
    await slot('2031-10-26T19:30:00.000Z', { titleOverride: 'Dimanche soir' }) // dimanche 26 à 20 h 30 (UTC+1)
    const res = await copy({ from: '2031-10-22' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 3, skipped: 0, replaced: 0, target: '2031-10-27' })
    const copies = await slotsBetween('2031-10-26T23:30:00.000Z', '2031-11-04T00:00:00.000Z')
    expect(copies.map((s) => [s.startsAt, s.titleOverride, s.durationMinutes, s._status])).toEqual([
      ['2031-10-27T19:30:00.000Z', 'Lundi soir', 30, 'published'], // lundi 27 à 20 h 30 (UTC+1)
      ['2031-10-27T23:00:00.000Z', 'Nuit du lundi', 30, 'published'], // mardi 28 à 0 h (UTC+1)
      ['2031-11-02T19:30:00.000Z', 'Dimanche soir', 30, 'published'],
    ])
    expect(copies.every((s) => s.program === program.id)).toBe(true)
    // en ligne aussitôt : visibles du public
    expect((await apiJson<{ totalDocs: number }>(`/schedule/count?where[id][in][0]=${copies[0].id}&where[id][in][1]=${copies[2].id}`)).body.totalDocs).toBe(2)
  })

  it('recopie : passage à l’heure d’été (28 mars 2032) compris', async () => {
    ranges.push(['2032-03-21T00:00:00.000Z', '2032-04-05T00:00:00.000Z'])
    await slot('2032-03-22T19:30:00.000Z', { titleOverride: 'Lundi 22 à 20 h 30' }) // UTC+1
    const res = await copy({ from: '2032-03-22' })
    expect(res.status).toBe(200)
    const [copied] = await slotsBetween('2032-03-29T00:00:00.000Z', '2032-04-05T00:00:00.000Z')
    expect(copied.startsAt).toBe('2032-03-29T18:30:00.000Z') // lundi 29 à 20 h 30 (UTC+2)
  })

  it('recopie : refusée si la semaine d’arrivée n’est pas vide, sauf « Remplacer ce qui est déjà saisi »', async () => {
    ranges.push(['2032-02-01T00:00:00.000Z', '2032-02-17T00:00:00.000Z'])
    await slot('2032-02-03T19:00:00.000Z', { titleOverride: 'Source' })
    const existing = await slot('2032-02-12T19:00:00.000Z', { titleOverride: 'Déjà saisi' })
    const refused = await copy({ from: '2032-02-02' })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatch(/contient déjà 1 créneau/)
    expect((await slotsBetween('2032-02-09T01:00:00.000Z', '2032-02-16T01:00:00.000Z')).map((s) => s.id)).toEqual([existing.id])

    const replaced = await copy({ from: '2032-02-02', replace: true })
    expect(replaced.status).toBe(200)
    expect(replaced.body).toMatchObject({ copied: 1, replaced: 1, target: '2032-02-09' })
    expect((await slotsBetween('2032-02-09T01:00:00.000Z', '2032-02-16T01:00:00.000Z')).map((s) => s.titleOverride)).toEqual(['Source'])
  })

  it('recopie d’une seule soirée (de 18 h à 0 h 30) sur le même jour de la semaine suivante', async () => {
    ranges.push(['2032-03-02T00:00:00.000Z', '2032-03-12T00:00:00.000Z'])
    await slot('2032-03-03T19:00:00.000Z', { titleOverride: 'Mercredi soir' })
    await slot('2032-03-03T23:15:00.000Z', { titleOverride: 'Nuit de mercredi', durationMinutes: 15 }) // jeudi 4 à 0 h 15
    await slot('2032-03-04T19:00:00.000Z', { titleOverride: 'Jeudi soir' })
    const res = await copy({ from: '2032-03-03', days: 1 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ copied: 2, replaced: 0, target: '2032-03-10' })
    const copies = await slotsBetween('2032-03-05T00:00:00.000Z', '2032-03-12T00:00:00.000Z')
    expect(copies.map((s) => s.titleOverride)).toEqual(['Mercredi soir', 'Nuit de mercredi'])
  })

  it('recopie tout ou rien : une erreur en cours de route n’efface ni ne crée aucun créneau', async () => {
    ranges.push(['2032-04-04T00:00:00.000Z', '2032-04-20T00:00:00.000Z'])
    const gone = await post('programs', { title: unique('Émission arrêtée'), genre: 'magazine' })
    await slot('2032-04-05T18:00:00.000Z', { titleOverride: 'Premier' })
    await slot('2032-04-06T18:00:00.000Z', { titleOverride: 'Deuxième' })
    // dernier créneau de la semaine : son émission a été supprimée depuis (créneau sans émission)
    await slot('2032-04-07T18:00:00.000Z', { titleOverride: 'Orphelin', program: gone.id })
    await payload.delete({ collection: 'programs', id: gone.id, context: { disableRevalidate: true } })
    const kept = await slot('2032-04-13T18:00:00.000Z', { titleOverride: 'Arrivée' })
    const spy = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)
    const res = await copy({ from: '2032-04-05', replace: true })
    spy.mockRestore()
    // refus des contrôles de la grille (émission introuvable) : 400 avec la raison, pas une panne à « réessayer »
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/ne peut pas être recopié/)
    expect((await slotsBetween('2032-04-12T01:00:00.000Z', '2032-04-19T01:00:00.000Z')).map((s) => s.id)).toEqual([kept.id])
  })
})
