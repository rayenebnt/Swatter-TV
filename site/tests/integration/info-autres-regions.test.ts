// L'Info, catégorie « Autres régions » (Suisse, Vallée d'Aoste, hors Auvergne-Rhône-Alpes) : article créé par l'API comme
// depuis l'administration (publié, puis en brouillon : table des versions), lecture publique, filtre par département,
// recherche ; valeur par défaut inchangée (Haute-Savoie) ; valeur refusée par l'agenda et les webcams.
import type { CollectionSlug, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SearchHit } from '@/lib/search'
import { articleUrl } from '@/lib/urls'
import type { Article } from '@/payload-types'
import { apiJson, editorToken, testPayload, unique } from './helpers'

/** Mot inventé (lettres seulement) : ne désigne que les contenus de ce fichier. */
const TAG = `zq${Array.from({ length: 7 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`
const PASSE = new Date(Date.now() - 60 * 60_000).toISOString()

let payload: Payload
let editor: string
const created: { collection: CollectionSlug; id: number }[] = []

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
})

afterAll(async () => {
  for (const { collection, id } of created.reverse()) await payload.delete({ collection, id, context: { disableRevalidate: true } }).catch(() => undefined)
})

/** Article créé par l'API REST (comme l'administration), publié il y a une heure sauf indication contraire. */
async function post(body: Record<string, unknown>, query = ''): Promise<Article> {
  const res = await apiJson<{ doc: Article }>(`/articles${query}`, { method: 'POST', token: editor, body: { _status: 'published', publishedAt: PASSE, ...body } })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  created.push({ collection: 'articles', id: res.body.doc.id })
  return res.body.doc
}

describe('L’Info : « Autres régions »', () => {
  let geneve: Article
  let aoste: Article
  let annecy: Article

  beforeAll(async () => {
    geneve = await post({ title: `Derby ${TAG} à Genève`, department: 'autres-regions', city: 'Genève', kicker: 'Sport' })
    aoste = await post({ title: `Col ${TAG} rouvert côté Aoste`, department: 'autres-regions' })
    annecy = await post({ title: `Marché ${TAG} d’Annecy`, department: 'haute-savoie', city: 'Annecy' })
  })

  it('création par l’API : l’article est rangé dans « autres-regions », à l’adresse /info/autres-regions/<adresse>', () => {
    expect(geneve.department).toBe('autres-regions')
    expect(articleUrl(geneve)).toBe(`/info/autres-regions/${geneve.slug}`)
  })

  it('lecture publique (sans compte) : l’article publié est visible avec sa zone', async () => {
    const res = await apiJson<Article>(`/articles/${geneve.id}`)
    expect(res.status).toBe(200)
    expect(res.body.department).toBe('autres-regions')
    expect(res.body.city).toBe('Genève')
  })

  it('filtre par département : « autres-regions » ne donne que ses articles, la Haute-Savoie garde les siens', async () => {
    const list = async (department: string) =>
      (await apiJson<{ docs: Article[] }>(`/articles?where[department][equals]=${department}&where[title][like]=${TAG}&limit=10&depth=0`)).body.docs
        .map((a) => a.id)
        .sort()
    expect(await list('autres-regions')).toEqual([geneve.id, aoste.id].sort())
    expect(await list('haute-savoie')).toEqual([annecy.id])
  })

  it('sans département choisi : Haute-Savoie, la valeur par défaut, comme avant', async () => {
    const doc = await post({ title: unique('Sans département') })
    expect(doc.department).toBe('haute-savoie')
  })

  it('brouillon (enregistrement automatique) puis publication : la zone est gardée dans les versions', async () => {
    const draft = await post({ title: unique('Brouillon des autres régions'), department: 'savoie', _status: 'draft' }, '?draft=true')
    const saved = await apiJson<{ doc: Article }>(`/articles/${draft.id}?draft=true&autosave=true`, { method: 'PATCH', token: editor, body: { department: 'autres-regions' } })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await apiJson<Article>(`/articles/${draft.id}?draft=true`, { token: editor })).body.department).toBe('autres-regions')
    // jamais publié : invisible du public
    expect((await apiJson(`/articles/${draft.id}`)).status).toBe(404)
    const published = await apiJson<{ doc: Article }>(`/articles/${draft.id}`, { method: 'PATCH', token: editor, body: { _status: 'published' } })
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    expect((await apiJson<Article>(`/articles/${draft.id}`)).body.department).toBe('autres-regions')
  })

  it('recherche : adresse dans /info/autres-regions, commune ou « Autres régions » en sous-titre', async () => {
    const { status, body } = await apiJson<{ hits: SearchHit[] }>(`/search?q=${TAG}`)
    expect(status).toBe(200)
    const hit = (a: Article) => body.hits.find((h) => h.href === articleUrl(a))
    expect(hit(geneve)?.subtitle).toMatch(/^Genève · /)
    expect(hit(aoste)?.subtitle).toMatch(/^Autres régions · /)
    expect(hit(annecy)?.subtitle).toMatch(/^Annecy · /)
  })

  it('valeur inconnue refusée (400) ; « autres-regions » réservée aux articles : l’agenda et les webcams la refusent', async () => {
    const bad = await apiJson('/articles', { method: 'POST', token: editor, body: { title: unique('Info suisse'), department: 'suisse', _status: 'published' } })
    expect(bad.status).toBe(400)
    const event = await apiJson('/events', {
      method: 'POST',
      token: editor,
      body: { title: unique('Sortie à Aoste'), startDate: '2031-07-01T10:00:00.000Z', city: 'Aoste', department: 'autres-regions', _status: 'published' },
    })
    expect(event.status).toBe(400)
    const cam = await apiJson('/webcams', { method: 'POST', token: editor, body: { name: unique('Genève'), department: 'autres-regions', provider: 'iframe', _status: 'published' } })
    expect(cam.status).toBe(400)
  })
})
