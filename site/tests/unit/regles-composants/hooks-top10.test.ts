// Top 10 des vidéos (src/hooks/top10.ts) : places uniques comme une liste qu'on réordonne (calcul pur reorderTop10), et
// hooks d'enregistrement et de suppression avec une fausse requête (vidéos classées en mémoire, mises à jour notées).
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Where } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { reorderTop10, TOP10_REORDER, TOP10_SIZE, top10AfterChange, top10AfterDelete } from '@/hooks/top10'
import { matches, sortDocs, type Doc } from './outils'

type Ranked = { id: number; rank: number }
/** Vidéos classées : { id: place }. */
const ranked = (places: Record<number, number>): Ranked[] => Object.entries(places).map(([id, rank]) => ({ id: Number(id), rank }))
const changes = (others: Ranked[], freed: number | null, taken: number | null) => Object.fromEntries(reorderTop10(others, freed, taken))
/** Classement complet après les changements (null : sortie du Top 10). */
const after = (others: Ranked[], freed: number | null, taken: number | null) => {
  const c = reorderTop10(others, freed, taken)
  return Object.fromEntries(others.map((o) => [o.id, c.has(o.id) ? c.get(o.id) : o.rank]))
}
const FULL = ranked({ 101: 1, 102: 2, 103: 3, 104: 4, 105: 5, 106: 6, 107: 7, 108: 8, 109: 9, 110: 10 })

describe('reorderTop10 : nouvelles places des autres vidéos classées', () => {
  it('dix places', () => {
    expect(TOP10_SIZE).toBe(10)
  })

  it('place prise déjà occupée : cette vidéo et les suivantes descendent, la 10e sort du classement', () => {
    expect(changes(FULL, null, 3)).toEqual({ 103: 4, 104: 5, 105: 6, 106: 7, 107: 8, 108: 9, 109: 10, 110: null })
  })

  it('une place vide arrête le décalage', () => {
    const others = ranked({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 7, 8: 8 })
    expect(changes(others, null, 3)).toEqual({ 3: 4, 4: 5, 5: 6 })
  })

  it('place prise libre, ou aucune place : rien ne bouge', () => {
    expect(changes(ranked({ 1: 1, 2: 2, 4: 4 }), null, 3)).toEqual({})
    expect(changes(FULL, null, null)).toEqual({})
    expect(changes([], 4, 2)).toEqual({})
  })

  it('10e place prise : la vidéo qui l’occupait sort du classement', () => {
    expect(changes(FULL, null, 10)).toEqual({ 110: null })
  })

  it('vidéo qui quitte le classement : les suivantes remontent jusqu’à la première place vide', () => {
    const others = ranked({ 1: 1, 2: 2, 3: 3, 5: 5, 6: 6, 8: 8 })
    expect(changes(others, 4, null)).toEqual({ 5: 4, 6: 5 })
  })

  it('place libérée déjà reprise par une autre vidéo : pas de remontée', () => {
    expect(changes(ranked({ 1: 1, 2: 2, 3: 3, 5: 5 }), 3, null)).toEqual({})
  })

  it('vidéo qui descend (2 → 5) : comme une liste qu’on réordonne', () => {
    // 1:A 2:B 3:C 4:D 5:E 6:F, B passe 5e → A C D E B F
    const others = ranked({ 1: 1, 3: 3, 4: 4, 5: 5, 6: 6 })
    expect(changes(others, 2, 5)).toEqual({ 3: 2, 4: 3, 5: 4 })
    expect(after(others, 2, 5)).toEqual({ 1: 1, 3: 2, 4: 3, 5: 4, 6: 6 })
  })

  it('vidéo qui monte (5 → 2) : comme une liste qu’on réordonne', () => {
    // 1:A 2:B 3:C 4:D 5:E 6:F, E passe 2e → A E B C D F
    const others = ranked({ 1: 1, 2: 2, 3: 3, 4: 4, 6: 6 })
    expect(changes(others, 5, 2)).toEqual({ 2: 3, 3: 4, 4: 5 })
    expect(after(others, 5, 2)).toEqual({ 1: 1, 2: 3, 3: 4, 4: 5, 6: 6 })
  })

  it('après chaque réordonnancement, les places restent uniques (classement complet)', () => {
    for (let from = 1; from <= 10; from++) {
      for (let to = 1; to <= 10; to++) {
        if (from === to) continue
        const others = FULL.filter((o) => o.rank !== from)
        const places = Object.values(after(others, from, to)).filter((p) => p !== null)
        expect(new Set([...places, to]).size, `${from} → ${to}`).toBe(10)
      }
    }
  })

  it('ne renvoie que les places qui changent, sans modifier la liste reçue', () => {
    const others = ranked({ 1: 1, 2: 2, 3: 3 })
    const copy = structuredClone(others)
    expect([...reorderTop10(others, null, 2).keys()]).toEqual([2, 3])
    expect(others).toEqual(copy)
  })
})

/** Fausse requête : les vidéos sont en mémoire ; update applique la place et recopie `context` comme createLocalReq. */
function fakeReq(videos: Doc[], options: { failOn?: number } = {}) {
  const context: Record<string, unknown> = { origine: 'enregistrement principal' }
  const req: { context: Record<string, unknown>; payload: Record<string, ReturnType<typeof vi.fn>> } = { context, payload: {} }
  req.payload.find = vi.fn(async (args: { where: Where; sort: string[] }) => ({ docs: sortDocs(videos.filter((v) => matches(v, args.where)), args.sort) }))
  req.payload.update = vi.fn(async (args: { id: number; data: { top10Rank: number | null }; context: Record<string, unknown> }) => {
    req.context = args.context
    if (args.id === options.failOn) throw new Error('écriture refusée')
    const video = videos.find((v) => v.id === args.id)
    if (video) video.top10Rank = args.data.top10Rank
    return video
  })
  return { req, context }
}
const video = (id: number, top10Rank: number | null, updatedAt = '2026-10-01T10:00:00.000Z'): Doc => ({ id, top10Rank, updatedAt, _status: 'published' })
const rankOf = (videos: Doc[]) => Object.fromEntries(videos.map((v) => [v.id, v.top10Rank]))

type ChangeArgs = { doc: Doc; previousDoc?: Doc; operation: 'create' | 'update'; context?: Record<string, unknown> }
type HookArgs = Parameters<CollectionAfterChangeHook>[0]
const saved = (req: ReturnType<typeof fakeReq>['req'], { doc, previousDoc = {}, operation, context = {} }: ChangeArgs) =>
  top10AfterChange({ doc, previousDoc, operation, req, context, collection: { slug: 'videos' }, data: doc } as unknown as HookArgs)
const deleted = (req: ReturnType<typeof fakeReq>['req'], doc: Doc, context: Record<string, unknown> = {}) =>
  top10AfterDelete({ doc, req, context, id: doc.id, collection: { slug: 'videos' } } as unknown as Parameters<CollectionAfterDeleteHook>[0])

describe('top10AfterChange : enregistrement d’une vidéo', () => {
  it('nouvelle vidéo publiée à une place prise : les suivantes descendent, la 10e sort', async () => {
    const videos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => video(100 + r, r))
    const { req } = fakeReq(videos)
    const doc = { id: 200, top10Rank: 3, _status: 'published' }
    expect(await saved(req, { doc, operation: 'create' })).toBe(doc)
    expect(rankOf(videos)).toEqual({ 101: 1, 102: 2, 103: 4, 104: 5, 105: 6, 106: 7, 107: 8, 108: 9, 109: 10, 110: null })
  })

  it('vidéo publiée qui change de place : les autres se réordonnent comme une liste', async () => {
    const videos = [video(1, 1), video(3, 3), video(4, 4), video(5, 5), video(6, 6), video(2, 5)]
    const { req } = fakeReq(videos)
    await saved(req, { doc: { id: 2, top10Rank: 5, _status: 'published' }, previousDoc: { id: 2, top10Rank: 2, _status: 'published' }, operation: 'update' })
    expect(rankOf(videos)).toEqual({ 1: 1, 3: 2, 4: 3, 5: 4, 6: 6, 2: 5 })
  })

  it('vidéo publiée qui quitte le Top 10 (champ vidé) : les suivantes remontent', async () => {
    const videos = [video(1, 1), video(2, 2), video(3, 3), video(5, 5), video(6, 6)]
    const { req } = fakeReq(videos)
    await saved(req, { doc: { id: 4, top10Rank: null, _status: 'published' }, previousDoc: { id: 4, top10Rank: 4, _status: 'published' }, operation: 'update' })
    expect(rankOf(videos)).toEqual({ 1: 1, 2: 2, 3: 3, 5: 4, 6: 5 })
  })

  it('brouillon (enregistrement automatique) : le classement en ligne ne bouge pas', async () => {
    const videos = [video(1, 1), video(2, 2)]
    const { req } = fakeReq(videos)
    await saved(req, { doc: { id: 9, top10Rank: 1, _status: 'draft' }, previousDoc: { id: 9, top10Rank: null, _status: 'published' }, operation: 'update' })
    expect(req.payload.find).not.toHaveBeenCalled()
    expect(rankOf(videos)).toEqual({ 1: 1, 2: 2 })
  })

  it('première publication d’un brouillon classé : sa place n’était pas occupée sur le site, rien ne remonte', async () => {
    const videos = [video(1, 1), video(2, 2), video(3, 3), video(4, 4)]
    const { req } = fakeReq(videos)
    await saved(req, { doc: { id: 9, top10Rank: 2, _status: 'published' }, previousDoc: { id: 9, top10Rank: 2, _status: 'draft' }, operation: 'update' })
    expect(rankOf(videos)).toEqual({ 1: 1, 2: 3, 3: 4, 4: 5 })
  })

  it('vidéo republiée à la même place : rien ne bouge', async () => {
    const videos = [video(1, 1), video(3, 3)]
    const { req } = fakeReq(videos)
    await saved(req, { doc: { id: 2, top10Rank: 2, _status: 'published' }, previousDoc: { id: 2, top10Rank: 2, _status: 'published' }, operation: 'update' })
    expect(req.payload.update).not.toHaveBeenCalled()
  })

  it('vidéo hors classement, avant comme après : aucune requête', async () => {
    const { req } = fakeReq([video(1, 1)])
    const unranked = { id: 2, top10Rank: null, _status: 'published' }
    await saved(req, { doc: unranked, previousDoc: unranked, operation: 'update' })
    await saved(req, { doc: { id: 3, _status: 'published' }, operation: 'create' })
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('les autres vidéos : classées seulement, sans la vidéo enregistrée elle-même', async () => {
    const videos = [video(1, 1), video(2, 2), video(7, null), video(8, null)]
    const { req } = fakeReq(videos)
    // la ligne de la vidéo enregistrée porte déjà sa nouvelle place
    videos.push(video(9, 2))
    await saved(req, { doc: { id: 9, top10Rank: 2, _status: 'published' }, operation: 'create' })
    expect(rankOf(videos)).toEqual({ 1: 1, 2: 3, 7: null, 8: null, 9: 2 })
    const [args] = req.payload.find.mock.calls[0] as [{ where: Where; sort: string[]; pagination: boolean; req: unknown }]
    expect(args.sort).toEqual(['top10Rank', '-updatedAt'])
    expect(args.pagination).toBe(false)
    expect(args.req).toBe(req)
  })

  it('décalages enregistrés sans cascade ni régénération, puis contexte de la requête rétabli', async () => {
    const videos = [video(1, 1), video(2, 2)]
    const { req, context } = fakeReq(videos)
    await saved(req, { doc: { id: 9, top10Rank: 1, _status: 'published' }, operation: 'create' })
    const calls = req.payload.update.mock.calls.map(([args]) => args as { collection: string; context: Record<string, unknown>; req: unknown; depth: number })
    expect(calls).toHaveLength(2)
    for (const args of calls) {
      expect(args.collection).toBe('videos')
      expect(args.context).toEqual({ [TOP10_REORDER]: true, disableRevalidate: true })
      expect(args.req).toBe(req)
      expect(args.depth).toBe(0)
    }
    // sans cela, « disableRevalidate » empêcherait la régénération demandée par l'enregistrement principal
    expect(req.context).toBe(context)
  })

  it('contexte rétabli même si un décalage échoue', async () => {
    const videos = [video(1, 1), video(2, 2)]
    const { req, context } = fakeReq(videos, { failOn: 2 })
    await expect(saved(req, { doc: { id: 9, top10Rank: 1, _status: 'published' }, operation: 'create' })).rejects.toThrow('écriture refusée')
    expect(req.context).toBe(context)
  })

  it('décalage en cours (context.top10Reorder) : pas de réordonnancement en cascade', async () => {
    const { req } = fakeReq([video(1, 1)])
    await saved(req, { doc: { id: 2, top10Rank: 1, _status: 'published' }, operation: 'update', context: { [TOP10_REORDER]: true } })
    expect(req.payload.find).not.toHaveBeenCalled()
  })
})

describe('top10AfterDelete : suppression d’une vidéo', () => {
  it('vidéo classée supprimée : les suivantes remontent', async () => {
    const videos = [video(1, 1), video(3, 3), video(4, 4), video(6, 6)]
    const { req } = fakeReq(videos)
    const doc = { id: 2, top10Rank: 2 }
    expect(await deleted(req, doc)).toBe(doc)
    expect(rankOf(videos)).toEqual({ 1: 1, 3: 2, 4: 3, 6: 6 })
  })

  it('vidéo non classée, ou suppression faite par un décalage : rien', async () => {
    const { req } = fakeReq([video(1, 1)])
    await deleted(req, { id: 2, top10Rank: null })
    await deleted(req, { id: 3 })
    await deleted(req, { id: 4, top10Rank: 2 }, { [TOP10_REORDER]: true })
    expect(req.payload.find).not.toHaveBeenCalled()
  })
})
