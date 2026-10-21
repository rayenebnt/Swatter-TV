// Client Payload du site (src/lib/publication.ts) : hors aperçu, find / count / findDistinct sur une collection à
// brouillons ne renvoient que les versions publiées ; en aperçu, les dernières versions. Fausse instance Payload.
import type { CollectionConfig, Payload } from 'payload'
import { describe, expect, it } from 'vitest'
import { DRAFT_COLLECTIONS, PUBLISHED, publicationAware } from '@/lib/publication'
import { Ads } from '@/collections/Ads'
import { Articles } from '@/collections/Articles'
import { Events } from '@/collections/Events'
import { Media } from '@/collections/Media'
import { MemberFavorites, MemberHistory } from '@/collections/MemberActivity'
import { Members } from '@/collections/Members'
import { Messages } from '@/collections/Messages'
import { Pages } from '@/collections/Pages'
import { Programs } from '@/collections/Programs'
import { Replays } from '@/collections/Replays'
import { Schedule } from '@/collections/Schedule'
import { Users } from '@/collections/Users'
import { Videos } from '@/collections/Videos'
import { Webcams } from '@/collections/Webcams'

type Call = { method: string; args: Record<string, unknown> }

/** Fausse instance : chaque méthode note ses arguments (et utilise `this`, comme les vraies méthodes de Payload). */
class FakePayload {
  calls: Call[] = []
  config = { routes: { admin: '/admin' } }
  private record(method: string, args: Record<string, unknown>) {
    this.calls.push({ method, args })
    return { method, docs: [] }
  }
  async find(args: Record<string, unknown>) {
    return this.record('find', args)
  }
  async count(args: Record<string, unknown>) {
    return this.record('count', args)
  }
  async findDistinct(args: Record<string, unknown>) {
    return this.record('findDistinct', args)
  }
  async findGlobal(args: Record<string, unknown>) {
    return this.record('findGlobal', args)
  }
  async findByID(args: Record<string, unknown>) {
    return this.record('findByID', args)
  }
  async update(args: Record<string, unknown>) {
    return this.record('update', args)
  }
}

const wrap = (preview: boolean) => {
  const fake = new FakePayload()
  const client = publicationAware(fake as unknown as Payload, preview) as unknown as Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  return { fake, client }
}

describe('collections à brouillons', () => {
  it('toutes les rubriques du site : vidéos, articles, événements, replays, pages, grille, émissions, webcams, publicités', () => {
    expect([...DRAFT_COLLECTIONS].sort()).toEqual(['ads', 'articles', 'events', 'pages', 'programs', 'replays', 'schedule', 'videos', 'webcams'])
  })

  it('exactement les collections dont les fiches ont des brouillons (sinon le site montrerait des brouillons)', () => {
    const collections: CollectionConfig[] = [Ads, Articles, Events, Media, MemberFavorites, MemberHistory, Members, Messages, Pages, Programs]
    collections.push(Replays, Schedule, Users, Videos, Webcams)
    const withDrafts = collections.filter((c) => typeof c.versions === 'object' && c.versions !== null && Boolean(c.versions.drafts)).map((c) => c.slug)
    expect(withDrafts.sort()).toEqual([...DRAFT_COLLECTIONS].sort())
  })

  it('PUBLISHED : _status égal à « published »', () => {
    expect(PUBLISHED).toEqual({ _status: { equals: 'published' } })
  })
})

describe('site (hors aperçu) : versions publiées seulement', () => {
  it('find sans filtre : filtre « publié » ajouté', async () => {
    const { fake, client } = wrap(false)
    await client.find({ collection: 'videos', limit: 3 })
    expect(fake.calls).toEqual([{ method: 'find', args: { collection: 'videos', limit: 3, where: PUBLISHED } }])
  })

  it('find avec un filtre : les deux conditions (et), sans modifier les arguments de l’appelant', async () => {
    const { fake, client } = wrap(false)
    const where = { slug: { equals: 'mon-article' } }
    const args = { collection: 'articles', where, depth: 1 }
    await client.find(args)
    expect(fake.calls[0].args).toEqual({ collection: 'articles', where: { and: [where, PUBLISHED] }, depth: 1 })
    expect(args).toEqual({ collection: 'articles', where: { slug: { equals: 'mon-article' } }, depth: 1 })
  })

  it('count et findDistinct : même filtre (compteurs et listes de filtres sans brouillons)', async () => {
    const { fake, client } = wrap(false)
    await client.count({ collection: 'events' })
    await client.findDistinct({ collection: 'webcams', field: 'department', where: { active: { equals: true } } })
    expect(fake.calls).toEqual([
      { method: 'count', args: { collection: 'events', where: PUBLISHED } },
      { method: 'findDistinct', args: { collection: 'webcams', field: 'department', where: { and: [{ active: { equals: true } }, PUBLISHED] } } },
    ])
  })

  it('chaque collection à brouillons est filtrée', async () => {
    const { fake, client } = wrap(false)
    for (const collection of DRAFT_COLLECTIONS) await client.find({ collection })
    for (const call of fake.calls) expect(call.args.where).toEqual(PUBLISHED)
  })

  it('collections sans brouillons (médias, messages, comptes, redirections, membres) : requête inchangée', async () => {
    const { fake, client } = wrap(false)
    const others = ['media', 'messages', 'users', 'redirects', 'members', 'member-history', 'member-favorites']
    for (const collection of others) {
      const args = { collection, where: { id: { equals: 1 } } }
      await client.find(args)
      expect(fake.calls.at(-1)?.args).toBe(args)
    }
  })

  it('find sans collection : transmis tel quel', async () => {
    const { fake, client } = wrap(false)
    const args = { limit: 1 }
    await client.find(args)
    expect(fake.calls[0].args).toBe(args)
  })

  it('findGlobal : version publiée (pas de demande de brouillon)', async () => {
    const { fake, client } = wrap(false)
    await client.findGlobal({ slug: 'settings', depth: 1 })
    expect(fake.calls[0].args).toEqual({ slug: 'settings', depth: 1 })
  })

  it('le résultat de Payload est renvoyé tel quel', async () => {
    const { client } = wrap(false)
    expect(await client.find({ collection: 'videos' })).toEqual({ method: 'find', docs: [] })
  })
})

describe('mode aperçu : dernières versions (brouillons compris)', () => {
  it('find : draft: true, sans filtre de statut', async () => {
    const { fake, client } = wrap(true)
    await client.find({ collection: 'articles', where: { slug: { equals: 'a' } } })
    expect(fake.calls[0].args).toEqual({ collection: 'articles', where: { slug: { equals: 'a' } }, draft: true })
  })

  it('count et findDistinct (qui ne lisent pas les brouillons) : tous les documents, quel que soit leur statut', async () => {
    const { fake, client } = wrap(true)
    const count = { collection: 'videos', where: { category: { equals: 'sport' } } }
    const distinct = { collection: 'events', field: 'category' }
    await client.count(count)
    await client.findDistinct(distinct)
    expect(fake.calls[0].args).toBe(count)
    expect(fake.calls[1].args).toBe(distinct)
  })

  it('findGlobal : brouillon des réglages et de la météo', async () => {
    const { fake, client } = wrap(true)
    await client.findGlobal({ slug: 'meteo' })
    expect(fake.calls[0].args).toEqual({ slug: 'meteo', draft: true })
  })

  it('collections sans brouillons : inchangé, même en aperçu', async () => {
    const { fake, client } = wrap(true)
    const args = { collection: 'media' }
    await client.find(args)
    expect(fake.calls[0].args).toBe(args)
  })
})

describe('le reste de Payload est intact', () => {
  it('autres méthodes appelées sur l’instance d’origine (this), arguments inchangés', async () => {
    for (const preview of [false, true]) {
      const { fake, client } = wrap(preview)
      const args = { collection: 'videos', id: 3 }
      await client.findByID(args)
      await client.update({ collection: 'videos', id: 3, data: {} })
      expect(fake.calls.map((c) => c.method)).toEqual(['findByID', 'update'])
      expect(fake.calls[0].args).toBe(args)
    }
  })

  it('propriétés (configuration…) lues sur l’instance d’origine', () => {
    const fake = new FakePayload()
    const client = publicationAware(fake as unknown as Payload, false) as unknown as FakePayload
    expect(client.config).toBe(fake.config)
  })
})
