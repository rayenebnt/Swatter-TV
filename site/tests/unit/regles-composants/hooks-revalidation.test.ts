// Régénération du site après une modification (src/hooks/revalidate.ts), avec de faux arguments de hook : publication,
// retrait du site et suppression régénèrent ; un brouillon (enregistrement automatique) ne touche pas au cache.
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook } from 'payload'
import { revalidatePath } from 'next/cache'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordLiveBefore } from '@/hooks/live-before'
import { revalidateAfterChange, revalidateAfterDelete, revalidateGlobal, revalidateHooks } from '@/hooks/revalidate'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

type Status = 'draft' | 'published' | null | undefined
type Versioned = { id?: number; _status?: Status; title?: string } | null | undefined

/** Fausse requête : `live` est la ligne principale (version en ligne) lue en base après l'enregistrement. */
function fakeReq(live: Versioned = null, context: Record<string, unknown> = {}) {
  return {
    context,
    payload: {
      db: {
        findOne: vi.fn(async () => live),
        findGlobal: vi.fn(async () => live),
      },
    },
  }
}

type Req = ReturnType<typeof fakeReq>
type ChangeArgs = Parameters<CollectionAfterChangeHook>[0]
const change = (req: Req, doc: Versioned, previousDoc: Versioned, operation: 'create' | 'update' = 'update') =>
  revalidateAfterChange({ doc, previousDoc, req, collection: { slug: 'videos' }, operation, context: req.context, data: {} } as unknown as ChangeArgs)
const globalChange = (req: Req, doc: Versioned, previousDoc: Versioned) =>
  revalidateGlobal({ doc, previousDoc, req, global: { slug: 'settings' }, context: req.context, data: {} } as unknown as Parameters<GlobalAfterChangeHook>[0])
const remove = (req: Req, doc: Versioned) =>
  revalidateAfterDelete({ doc, req, id: doc?.id, collection: { slug: 'videos' }, context: req.context } as unknown as Parameters<CollectionAfterDeleteHook>[0])

const revalidated = () => vi.mocked(revalidatePath).mock.calls.length
/** Avant l'enregistrement de la fiche `id` : version en ligne retenue (hook beforeChange de revalidateHooks). */
const beforeSave = (req: Req, id: number) =>
  recordLiveBefore({ collection: { slug: 'videos' }, data: {}, operation: 'update', originalDoc: { id }, req, context: req.context } as unknown as Parameters<
    typeof recordLiveBefore
  >[0])

beforeEach(() => {
  vi.mocked(revalidatePath).mockReset()
})

describe('collections : la version visible a-t-elle changé ?', () => {
  it('publication (création ou mise à jour) : tout le site est régénéré, sans lecture en base', async () => {
    const req = fakeReq()
    await change(req, { id: 5, _status: 'published' }, null, 'create')
    await change(req, { id: 5, _status: 'published' }, { id: 5, _status: 'draft' })
    await change(req, { id: 5, _status: 'published' }, { id: 5, _status: 'published' })
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/', 'layout'],
      ['/', 'layout'],
      ['/', 'layout'],
    ])
    expect(req.payload.db.findOne).not.toHaveBeenCalled()
  })

  it('contenu sans brouillons (pas de statut) : régénéré à chaque enregistrement', async () => {
    await change(fakeReq(), { id: 1 }, { id: 1 })
    expect(revalidated()).toBe(1)
  })

  it('« Ajouter » puis enregistrement automatique d’un brouillon jamais publié : rien', async () => {
    const req = fakeReq({ id: 5, _status: 'draft' })
    await change(req, { id: 5, _status: 'draft' }, null, 'create')
    await change(req, { id: 5, _status: 'draft' }, { id: 5, _status: 'draft' })
    expect(revalidated()).toBe(0)
    expect(req.payload.db.findOne).not.toHaveBeenCalled()
  })

  it('brouillon enregistré sur un contenu publié : la version en ligne n’a pas changé, rien', async () => {
    const req = fakeReq({ id: 5, _status: 'published' })
    await change(req, { id: 5, _status: 'draft', title: 'Titre en cours de saisie' }, { id: 5, _status: 'published' })
    expect(revalidated()).toBe(0)
    // la version en ligne est lue dans la ligne principale de la collection, pour ce document
    expect(req.payload.db.findOne).toHaveBeenCalledWith({ collection: 'videos', where: { id: { equals: 5 } }, req })
  })

  it('« Retirer du site » : la ligne principale repasse en brouillon, le site est régénéré', async () => {
    const req = fakeReq({ id: 5, _status: 'draft' })
    await change(req, { id: 5, _status: 'draft' }, { id: 5, _status: 'published' })
    expect(revalidated()).toBe(1)
  })

  it('« Retirer du site » d’un contenu qui a des modifications en attente : la version en ligne retenue avant fait foi', async () => {
    // previousDoc, la dernière version, est le brouillon en attente ; la ligne principale était en ligne avant l'enregistrement
    const req = fakeReq({ id: 5, _status: 'draft' })
    req.payload.db.findOne.mockResolvedValueOnce({ id: 5, _status: 'published' })
    await beforeSave(req, 5)
    await change(req, { id: 5, _status: 'draft' }, { id: 5, _status: 'draft', title: 'Modification en attente' })
    expect(revalidated()).toBe(1)
  })

  it('brouillon enregistré sur un contenu déjà retiré du site : rien', async () => {
    const req = fakeReq({ id: 5, _status: 'draft' })
    await beforeSave(req, 5)
    await change(req, { id: 5, _status: 'draft' }, { id: 5, _status: 'published' })
    expect(revalidated()).toBe(0)
  })

  it('ligne principale introuvable : rien', async () => {
    await change(fakeReq(null), { id: 5, _status: 'draft' }, { id: 5, _status: 'published' })
    expect(revalidated()).toBe(0)
  })

  it('contexte « disableRevalidate » (imports, contenus de départ, décalages du Top 10) : jamais de régénération', async () => {
    const req = fakeReq({ id: 5, _status: 'draft' }, { disableRevalidate: true })
    await change(req, { id: 5, _status: 'published' }, null, 'create')
    await change(req, { id: 5, _status: 'draft' }, { id: 5, _status: 'published' })
    await remove(req, { id: 5, _status: 'published' })
    expect(revalidated()).toBe(0)
  })

  it('le hook renvoie toujours le document enregistré', async () => {
    const doc = { id: 9, _status: 'draft' as const }
    expect(await change(fakeReq({ id: 9, _status: 'published' }), doc, { id: 9, _status: 'published' })).toBe(doc)
    const published = { id: 9, _status: 'published' as const }
    expect(await change(fakeReq(), published, null)).toBe(published)
  })

  it('hors du runtime Next.js (scripts, imports) : l’échec de revalidatePath est ignoré', async () => {
    vi.mocked(revalidatePath).mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in revalidatePath /')
    })
    const doc = { id: 2, _status: 'published' as const }
    await expect(change(fakeReq(), doc, null)).resolves.toBe(doc)
    await expect(remove(fakeReq(), doc)).resolves.toBe(doc)
  })
})

describe('suppression et globals', () => {
  it('suppression : le site est régénéré (le contenu doit disparaître des pages en cache)', async () => {
    const doc = { id: 3, _status: 'published' as const }
    expect(await remove(fakeReq(), doc)).toBe(doc)
    // même un brouillon supprimé : sans conséquence, mais sans risque
    await remove(fakeReq(), { id: 4, _status: 'draft' })
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/', 'layout'],
      ['/', 'layout'],
    ])
  })

  it('réglages et météo : même règle, la version en ligne étant lue par findGlobal', async () => {
    const published = fakeReq()
    await globalChange(published, { _status: 'published' }, { _status: 'draft' })
    expect(revalidated()).toBe(1)
    expect(published.payload.db.findGlobal).not.toHaveBeenCalled()

    const autosave = fakeReq({ _status: 'published' })
    await globalChange(autosave, { _status: 'draft' }, { _status: 'published' })
    expect(revalidated()).toBe(1)
    expect(autosave.payload.db.findGlobal).toHaveBeenCalledWith({ slug: 'settings', req: autosave })

    await globalChange(fakeReq({ _status: 'draft' }), { _status: 'draft' }, { _status: 'published' })
    expect(revalidated()).toBe(2)

    await globalChange(fakeReq({ _status: 'published' }), { _status: 'draft' }, { _status: 'draft' })
    expect(revalidated()).toBe(2)
  })

  it('revalidateHooks : version en ligne retenue avant l’enregistrement, régénération après enregistrement et après suppression', () => {
    expect(revalidateHooks).toEqual({ beforeChange: [recordLiveBefore], afterChange: [revalidateAfterChange], afterDelete: [revalidateAfterDelete] })
  })
})
