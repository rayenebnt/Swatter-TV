// Branchement des règles d'accès (src/access) sur chaque collection et chaque global : ce que le public, un éditeur et
// un administrateur peuvent lire, créer, modifier et supprimer par l'API (faux objets req, sans base de données).
import type { CollectionConfig, GlobalConfig, PayloadRequest, Where } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { Meteo } from '@/globals/Meteo'
import { Settings } from '@/globals/Settings'
import { Youtube } from '@/globals/Youtube'
import { matches } from './outils'

type User = { id: number; role?: string; collection: 'users' } | null
const PUBLIC: User = null
const EDITEUR: User = { id: 2, role: 'editeur', collection: 'users' }
const ADMIN: User = { id: 1, role: 'admin', collection: 'users' }

/** Résumé d'une règle : true, false, ou « filtre » (clause where : lecture limitée). */
type Verdict = boolean | 'filtre'
type Rule = (args: { req: PayloadRequest }) => unknown
const req = (user: User) => ({ user, payload: {}, context: {} }) as unknown as PayloadRequest
const verdict = (rule: Rule | undefined, user: User): Verdict => {
  if (!rule) throw new Error('règle absente : Payload appliquerait sa règle par défaut')
  const result = rule({ req: req(user) })
  return typeof result === 'object' && result !== null ? 'filtre' : Boolean(result)
}
/** [public, éditeur, administrateur] pour chaque opération. */
const rights = (config: CollectionConfig | GlobalConfig, ops: string[]) =>
  Object.fromEntries(ops.map((op) => [op, [PUBLIC, EDITEUR, ADMIN].map((u) => verdict((config.access as Record<string, Rule> | undefined)?.[op], u))]))
const CRUD = ['read', 'create', 'update', 'delete']

const NOW = new Date('2026-10-21T10:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('contenus du site : lecture publique limitée, écriture par toute l’équipe', () => {
  const contents: [string, CollectionConfig][] = [
    ['articles', Articles],
    ['vidéos', Videos],
    ['replays', Replays],
    ['événements', Events],
    ['pages', Pages],
    ['émissions', Programs],
    ['grille', Schedule],
    ['webcams', Webcams],
    ['publicités', Ads],
  ]

  for (const [name, config] of contents) {
    it(`${name} : le public lit à travers un filtre ; éditeurs et administrateurs lisent, créent, modifient et suppriment`, () => {
      expect(rights(config, CRUD)).toEqual({
        read: ['filtre', true, true],
        create: [false, true, true],
        update: [false, true, true],
        delete: [false, true, true],
      })
    })
  }

  it('le filtre public écarte toujours les brouillons', () => {
    for (const [name, config] of contents) {
      const where = (config.access?.read as Rule)({ req: req(PUBLIC) }) as Where
      const live = { _status: 'published', publishedAt: '2026-10-01T10:00:00.000Z', broadcastAt: '2026-10-01T10:00:00.000Z', active: true }
      expect(matches(live, where), name).toBe(true)
      expect(matches({ ...live, _status: 'draft' }, where), name).toBe(false)
    }
  })

  it('articles et vidéos programmés, replays pas encore diffusés : invisibles du public jusqu’à leur date', () => {
    const read = (config: CollectionConfig) => (config.access?.read as Rule)({ req: req(PUBLIC) }) as Where
    expect(matches({ _status: 'published', publishedAt: '2026-10-22T10:00:00.000Z' }, read(Articles))).toBe(false)
    expect(matches({ _status: 'published', publishedAt: '2026-10-22T10:00:00.000Z' }, read(Videos))).toBe(false)
    expect(matches({ _status: 'published', broadcastAt: '2026-10-22T10:00:00.000Z' }, read(Replays))).toBe(false)
    // agenda : un événement à venir reste lisible
    expect(matches({ _status: 'published', startDate: '2026-12-01T10:00:00.000Z' }, read(Events))).toBe(true)
  })

  it('publicités : le public ne lit que les campagnes actives en cours', () => {
    const where = (Ads.access?.read as Rule)({ req: req(PUBLIC) }) as Where
    expect(matches({ _status: 'published', active: false }, where)).toBe(false)
    expect(matches({ _status: 'published', active: true, endsAt: '2026-10-20T12:00:00.000Z' }, where)).toBe(false)
    expect(matches({ _status: 'published', active: true, startsAt: '2026-10-21T12:00:00.000Z' }, where)).toBe(true)
  })
})

describe('médiathèque, messages, comptes et membres', () => {
  it('médiathèque : lecture par tous (images du site), écriture par l’équipe', () => {
    expect(rights(Media, CRUD)).toEqual({ read: [true, true, true], create: [false, true, true], update: [false, true, true], delete: [false, true, true] })
  })

  it('messages reçus : jamais créés par l’API (formulaire de contact côté serveur), supprimés par les administrateurs', () => {
    expect(rights(Messages, CRUD)).toEqual({
      read: [false, true, true],
      create: [false, false, false],
      update: [false, true, true],
      delete: [false, false, true],
    })
  })

  it('membres du site : données personnelles réservées aux administrateurs, aucune création par l’API', () => {
    expect(rights(Members, CRUD)).toEqual({
      read: [false, false, true],
      create: [false, false, false],
      update: [false, false, true],
      delete: [false, false, true],
    })
  })

  it('historique et « Ma liste » des membres : aucun accès par l’API, même pour les administrateurs', () => {
    for (const config of [MemberHistory, MemberFavorites]) {
      const none = [false, false, false]
      expect(rights(config, CRUD)).toEqual({ read: none, create: none, update: none, delete: none })
    }
  })

  it('comptes de l’équipe : créés et supprimés par les administrateurs ; un éditeur ne modifie que son propre compte', () => {
    expect(rights(Users, [...CRUD, 'admin'])).toEqual({
      read: [false, true, true],
      create: [false, false, true],
      update: [false, 'filtre', true],
      delete: [false, false, true],
      admin: [false, true, true],
    })
    const own = (Users.access?.update as Rule)({ req: req(EDITEUR) }) as Where
    expect(own).toEqual({ id: { equals: 2 } })
    expect(matches({ id: 2 }, own)).toBe(true)
    expect(matches({ id: 1 }, own)).toBe(false)
  })

  it('rôle d’un compte : modifiable par un administrateur seulement (un éditeur ne peut pas se promouvoir)', () => {
    const role = Users.fields.find((f) => 'name' in f && f.name === 'role') as { access?: { update?: Rule } } | undefined
    const update = role?.access?.update
    expect([PUBLIC, EDITEUR, ADMIN].map((u) => verdict(update, u))).toEqual([false, false, true])
  })
})

describe('réglages du site (globals)', () => {
  it('accueil et direct, météo : lecture publique de la version publiée, modification par l’équipe', () => {
    for (const config of [Settings, Meteo]) {
      expect(rights(config, ['read', 'update'])).toEqual({ read: ['filtre', true, true], update: [false, true, true] })
      const where = (config.access?.read as Rule)({ req: req(PUBLIC) }) as Where
      expect(matches({ _status: 'draft' }, where)).toBe(false)
    }
  })

  it('chaîne YouTube : réservée à l’équipe (lecture comprise)', () => {
    expect(rights(Youtube, ['read', 'update'])).toEqual({ read: [false, true, true], update: [false, true, true] })
  })
})
