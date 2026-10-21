// Régénération du site après un enregistrement (src/hooks/revalidate.ts, next/cache simulé) : un brouillon enregistré
// automatiquement ne touche pas au cache ; publication, retrait du site et suppression le régénèrent, pour les contenus
// comme pour les réglages ; les écritures des scripts (context.disableRevalidate) non ; un décalage du Top 10 ne prive pas
// l’enregistrement principal de sa régénération.
import path from 'node:path'
import type { CollectionSlug, Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, editorToken, testPayload, unique } from './helpers'

const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), revalidatePath }))

type Doc = { id: number } & Record<string, unknown>

let payload: Payload
let editor: string
let image: number
let settings: Record<string, unknown>
const created: { collection: CollectionSlug; id: number }[] = []

const track = <T extends { id: number }>(collection: CollectionSlug, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

/** Article en ligne, créé sans régénération (comme par un script). */
async function article(): Promise<Doc> {
  const data = { title: unique('Info'), department: 'loire' as const, publishedAt: '2025-06-01T08:00:00.000Z', _status: 'published' as const }
  return track('articles', (await payload.create({ collection: 'articles', data, context: { disableRevalidate: true } })) as unknown as Doc)
}

/** Le site a-t-il été régénéré (tout le site : revalidatePath('/', 'layout')) ? */
const regenerated = () => revalidatePath.mock.calls.some(([route, type]) => route === '/' && type === 'layout')

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  const filePath = path.resolve('public/og/hero-matin.jpg')
  image = track('media', await payload.create({ collection: 'media', data: { alt: 'Image des tests de régénération' }, filePath })).id
  const current = (await payload.findGlobal({ slug: 'settings', depth: 0 })) as unknown as Record<string, unknown>
  const { id: _id, globalType: _type, createdAt: _c, updatedAt: _u, ...rest } = current
  settings = rest
})

afterAll(async () => {
  for (const { collection, id } of created.reverse()) {
    await payload.delete({ collection, id, context: { disableRevalidate: true, top10Reorder: true } }).catch(() => undefined)
  }
  // réglages remis comme avant (base neuve : aucune présentation, aucune version en ligne)
  const restored = { tagline: null, _status: 'draft', ...settings }
  await payload.updateGlobal({ slug: 'settings', data: restored as never, context: { disableRevalidate: true } }).catch(() => undefined)
})

beforeEach(() => {
  revalidatePath.mockClear()
})

describe('contenus', () => {
  it('brouillon enregistré automatiquement : le cache du site n’est pas touché', async () => {
    const doc = await article()
    const autosave = await api(`/articles/${doc.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { title: unique('Brouillon') } })
    expect(autosave.status).toBe(200)
    expect(revalidatePath).not.toHaveBeenCalled()
    // nouveau contenu enregistré en brouillon : rien non plus
    const draft = await api('/pages?draft=true', { method: 'POST', token: editor, body: { title: unique('Page en préparation') } })
    track('pages', ((await draft.json()) as { doc: Doc }).doc)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('publication : le site est régénéré', async () => {
    const doc = await article()
    await api(`/articles/${doc.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { title: unique('Corrigé') } })
    revalidatePath.mockClear()
    expect((await api(`/articles/${doc.id}`, { method: 'PATCH', token: editor, body: { _status: 'published' } })).status).toBe(200)
    expect(regenerated()).toBe(true)
  })

  it('retrait du site : le site est régénéré', async () => {
    const doc = await article()
    expect((await api(`/articles/${doc.id}`, { method: 'PATCH', token: editor, body: { _status: 'draft' } })).status).toBe(200)
    expect(regenerated()).toBe(true)
  })

  it('retrait du site d’un contenu qui a des modifications en attente : le site est régénéré aussi', async () => {
    const doc = await article()
    await api(`/articles/${doc.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { title: unique('En attente') } })
    revalidatePath.mockClear()
    expect((await api(`/articles/${doc.id}`, { method: 'PATCH', token: editor, body: { _status: 'draft' } })).status).toBe(200)
    expect((await api(`/articles/${doc.id}`)).status).toBe(404)
    expect(regenerated()).toBe(true)
  })

  it('suppression : le site est régénéré', async () => {
    const doc = await article()
    expect((await api(`/articles/${doc.id}`, { method: 'DELETE', token: editor })).status).toBe(200)
    expect(regenerated()).toBe(true)
  })

  it('écritures des scripts (context.disableRevalidate) : aucune régénération', async () => {
    const doc = await article()
    await payload.update({ collection: 'articles', id: doc.id, data: { title: unique('Script') }, context: { disableRevalidate: true } })
    await payload.delete({ collection: 'articles', id: doc.id, context: { disableRevalidate: true } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('Top 10 : les vidéos décalées ne privent pas l’enregistrement principal de sa régénération', async () => {
    const { docs } = await payload.find({ collection: 'videos', where: { top10Rank: { exists: true } }, pagination: false, depth: 0 })
    const foreign = docs.flatMap((d) => (typeof d.top10Rank === 'number' ? [{ id: d.id, rank: d.top10Rank }] : []))
    for (const f of foreign) await payload.db.updateOne({ collection: 'videos', id: f.id, data: { top10Rank: null } })
    try {
      const video = (top10Rank: number | null) => ({
        title: unique('Vidéo'),
        source: { provider: 'url' as const, url: 'https://exemple.fr/v.mp4' },
        thumbnail: image,
        category: 'info' as const,
        publishedAt: '2025-06-01T08:00:00.000Z',
        top10Rank,
        _status: 'published' as const,
      })
      for (const rank of [1, 2]) track('videos', await payload.create({ collection: 'videos', data: video(rank), context: { disableRevalidate: true } }))
      const moved = track('videos', await payload.create({ collection: 'videos', data: video(null), context: { disableRevalidate: true } }))
      revalidatePath.mockClear()
      expect((await api(`/videos/${moved.id}`, { method: 'PATCH', token: editor, body: { top10Rank: 1 } })).status).toBe(200)
      expect(regenerated()).toBe(true)
    } finally {
      for (const { collection, id } of created) if (collection === 'videos') await payload.db.updateOne({ collection: 'videos', id, data: { top10Rank: null } })
      for (const f of foreign) await payload.db.updateOne({ collection: 'videos', id: f.id, data: { top10Rank: f.rank } })
    }
  })
})

describe('réglages (globals)', () => {
  it('réglages : brouillon sans régénération, publication avec', async () => {
    expect((await api('/globals/settings?draft=true', { method: 'POST', token: editor, body: { tagline: unique('Brouillon') } })).status).toBe(200)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect((await api('/globals/settings', { method: 'POST', token: editor, body: { tagline: unique('Publié'), _status: 'published' } })).status).toBe(200)
    expect(regenerated()).toBe(true)
  })
})
