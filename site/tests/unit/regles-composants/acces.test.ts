// Règles d'accès de l'API (src/access) : droits du public, des éditeurs et des administrateurs (faux objets req), et
// clauses « where » des lectures publiques : contenus publiés et déjà en ligne, publicités en cours à l'heure de Paris.
import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  airedOrAuthenticated,
  anyone,
  authenticated,
  hiddenForEditors,
  isAdmin,
  isAdminField,
  publishedOrAuthenticated,
  publishedStatusOrAuthenticated,
  runningAdsOrAuthenticated,
  runningAdsWhere,
} from '@/access'
import { matches, type Doc } from './outils'

type User = { id: number; role?: string; collection?: string } | null

const ANONYME: User = null
const EDITEUR: User = { id: 2, role: 'editeur', collection: 'users' }
const ADMIN: User = { id: 1, role: 'admin', collection: 'users' }

const req = (user: User) => ({ user, payload: {}, context: {} }) as unknown as PayloadRequest
const run = (rule: Access, user: User) => rule({ req: req(user) })
const runField = (rule: FieldAccess, user: User) => rule({ req: req(user) } as Parameters<FieldAccess>[0])
/** Clause renvoyée au public (une règle qui renvoie true ou false n'en a pas). */
const whereFor = (rule: Access): Where => {
  const result = run(rule, ANONYME)
  if (typeof result !== 'object' || result === null) throw new Error('la règle devait renvoyer une clause where')
  return result as Where
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('règles d’accès : qui peut quoi', () => {
  it('anyone : tout le monde, même sans compte', () => {
    for (const user of [ANONYME, EDITEUR, ADMIN]) expect(run(anyone, user)).toBe(true)
  })

  it('authenticated : le public est refusé, toute l’équipe (éditeur ou administrateur) est acceptée', () => {
    expect(run(authenticated, ANONYME)).toBe(false)
    expect(run(authenticated, EDITEUR)).toBe(true)
    expect(run(authenticated, ADMIN)).toBe(true)
    // un compte de l'équipe sans rôle reste un compte connecté
    expect(run(authenticated, { id: 3 })).toBe(true)
  })

  it('isAdmin : seuls les administrateurs (ni le public, ni les éditeurs, ni un rôle mal orthographié)', () => {
    expect(run(isAdmin, ANONYME)).toBe(false)
    expect(run(isAdmin, EDITEUR)).toBe(false)
    expect(run(isAdmin, ADMIN)).toBe(true)
    expect(run(isAdmin, { id: 3 })).toBe(false)
    expect(run(isAdmin, { id: 4, role: 'Admin' })).toBe(false)
    expect(run(isAdmin, { id: 5, role: 'admin ' })).toBe(false)
  })

  it('isAdminField : même règle pour un champ (le rôle d’un compte ne se change que par un administrateur)', () => {
    expect(runField(isAdminField, ANONYME)).toBe(false)
    expect(runField(isAdminField, EDITEUR)).toBe(false)
    expect(runField(isAdminField, ADMIN)).toBe(true)
  })

  it('hiddenForEditors : rubriques techniques masquées aux éditeurs (et sans utilisateur), visibles des administrateurs', () => {
    expect(hiddenForEditors({ user: undefined })).toBe(true)
    expect(hiddenForEditors({ user: null })).toBe(true)
    expect(hiddenForEditors({ user: EDITEUR })).toBe(true)
    expect(hiddenForEditors({ user: { id: 3 } })).toBe(true)
    expect(hiddenForEditors({ user: ADMIN })).toBe(false)
  })

  it('les règles à clause where laissent tout voir à l’équipe connectée, éditeurs compris', () => {
    for (const rule of [publishedOrAuthenticated, publishedStatusOrAuthenticated, airedOrAuthenticated, runningAdsOrAuthenticated]) {
      expect(run(rule, EDITEUR)).toBe(true)
      expect(run(rule, ADMIN)).toBe(true)
    }
  })
})

describe('lectures publiques : contenus publiés et déjà en ligne', () => {
  const NOW = '2026-10-21T08:30:00.000Z'

  it('publishedOrAuthenticated : le public ne lit que les versions publiées dont la date de publication est passée', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const where = whereFor(publishedOrAuthenticated)
    expect(where).toEqual({ and: [{ _status: { equals: 'published' } }, { publishedAt: { less_than_equal: NOW } }] })
    const article = (doc: Doc) => matches({ _status: 'published', publishedAt: '2026-10-20T10:00:00.000Z', ...doc }, where)
    expect(article({})).toBe(true)
    // publié à l'instant même : visible
    expect(article({ publishedAt: NOW })).toBe(true)
    // programmé une minute plus tard : invisible jusqu'à sa date
    expect(article({ publishedAt: '2026-10-21T08:31:00.000Z' })).toBe(false)
    // brouillon (jamais publié, ou retiré du site) : invisible même avec une date passée
    expect(article({ _status: 'draft' })).toBe(false)
  })

  it('publishedOrAuthenticated : la date limite suit l’heure courante, à chaque requête', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const before = whereFor(publishedOrAuthenticated)
    vi.setSystemTime(new Date('2026-10-21T09:00:00.000Z'))
    const after = whereFor(publishedOrAuthenticated)
    expect(JSON.stringify(after)).toContain('2026-10-21T09:00:00.000Z')
    const programmed = { _status: 'published', publishedAt: '2026-10-21T08:45:00.000Z' }
    expect(matches(programmed, before)).toBe(false)
    expect(matches(programmed, after)).toBe(true)
  })

  it('airedOrAuthenticated : le public ne lit que les replays publiés déjà diffusés', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const where = whereFor(airedOrAuthenticated)
    expect(where).toEqual({ and: [{ _status: { equals: 'published' } }, { broadcastAt: { less_than_equal: NOW } }] })
    expect(matches({ _status: 'published', broadcastAt: '2026-10-20T18:00:00.000Z' }, where)).toBe(true)
    expect(matches({ _status: 'published', broadcastAt: '2026-10-21T18:00:00.000Z' }, where)).toBe(false)
    expect(matches({ _status: 'draft', broadcastAt: '2026-10-20T18:00:00.000Z' }, where)).toBe(false)
    // la date qui compte est celle de la diffusion, pas une éventuelle date de publication
    expect(matches({ _status: 'published', publishedAt: '2026-10-01T00:00:00.000Z', broadcastAt: '2026-10-22T18:00:00.000Z' }, where)).toBe(false)
  })

  it('publishedStatusOrAuthenticated : agenda, pages, grille, webcams… versions publiées seulement, sans condition de date', () => {
    const where = whereFor(publishedStatusOrAuthenticated)
    expect(where).toEqual({ _status: { equals: 'published' } })
    // un événement publié à venir reste lisible (l'agenda annonce l'avenir)
    expect(matches({ _status: 'published', startDate: '2030-01-01T10:00:00.000Z' }, where)).toBe(true)
    expect(matches({ _status: 'draft' }, where)).toBe(false)
    expect(matches({}, where)).toBe(false)
  })
})

describe('publicités en cours (runningAdsWhere) : du premier au dernier jour inclus, heure de Paris', () => {
  /** Jour choisi dans l'administration (sélecteur « jour seul » : enregistré à midi UTC). */
  const day = (d: string) => `${d}T12:00:00.000Z`
  const ad = (startsAt: string | null | undefined, endsAt: string | null | undefined, extra: Doc = {}): Doc => ({
    active: true,
    _status: 'published',
    startsAt: startsAt && startsAt.length === 10 ? day(startsAt) : startsAt,
    endsAt: endsAt && endsAt.length === 10 ? day(endsAt) : endsAt,
    ...extra,
  })
  const runningAt = (instant: string, doc: Doc) => matches(doc, runningAdsWhere(new Date(instant)))

  it('bornes exactes : du jour même à 0 h jusqu’au lendemain 0 h, heure de Paris', () => {
    expect(runningAdsWhere(new Date('2026-07-10T12:00:00.000Z'))).toEqual({
      and: [
        { active: { equals: true } },
        { or: [{ startsAt: { exists: false } }, { startsAt: { less_than: '2026-07-10T22:00:00.000Z' } }] },
        { or: [{ endsAt: { exists: false } }, { endsAt: { greater_than_equal: '2026-07-09T22:00:00.000Z' } }] },
      ],
    })
  })

  it('heure d’été : la campagne commence à minuit le premier jour et finit à minuit après le dernier jour', () => {
    const campaign = ad('2026-07-10', '2026-07-12')
    expect(runningAt('2026-07-09T21:59:59.999Z', campaign)).toBe(false) // 9 juillet, 23:59:59 à Paris
    expect(runningAt('2026-07-09T22:00:00.000Z', campaign)).toBe(true) // 10 juillet, 0 h à Paris
    expect(runningAt('2026-07-11T12:00:00.000Z', campaign)).toBe(true)
    expect(runningAt('2026-07-12T21:59:59.999Z', campaign)).toBe(true) // dernier jour, 23:59:59 à Paris
    expect(runningAt('2026-07-12T22:00:00.000Z', campaign)).toBe(false) // 13 juillet, 0 h à Paris
  })

  it('heure d’hiver : la journée de Paris commence à 23 h UTC la veille', () => {
    const campaign = ad('2026-01-15', '2026-01-15')
    expect(runningAt('2026-01-14T22:59:59.999Z', campaign)).toBe(false)
    expect(runningAt('2026-01-14T23:00:00.000Z', campaign)).toBe(true)
    expect(runningAt('2026-01-15T22:59:59.999Z', campaign)).toBe(true)
    expect(runningAt('2026-01-15T23:00:00.000Z', campaign)).toBe(false)
  })

  it('passage à l’heure d’hiver (dimanche 25 octobre 2026, journée de 25 h) : premier et dernier jour complets', () => {
    const lastDay = ad('2026-10-20', '2026-10-25')
    expect(runningAt('2026-10-25T00:30:00.000Z', lastDay)).toBe(true) // 2 h 30 (heure d'été)
    expect(runningAt('2026-10-25T01:30:00.000Z', lastDay)).toBe(true) // 2 h 30 (heure d'hiver)
    expect(runningAt('2026-10-25T22:59:59.999Z', lastDay)).toBe(true) // 23:59:59 à Paris
    expect(runningAt('2026-10-25T23:00:00.000Z', lastDay)).toBe(false) // lundi 26, 0 h
    const firstDay = ad('2026-10-25', '2026-10-31')
    expect(runningAt('2026-10-24T21:59:59.999Z', firstDay)).toBe(false) // samedi 24, 23:59:59 (heure d'été)
    expect(runningAt('2026-10-24T22:00:00.000Z', firstDay)).toBe(true) // dimanche 25, 0 h
  })

  it('passage à l’heure d’été (dimanche 29 mars 2026, journée de 23 h) : la campagne d’un jour dure toute la journée', () => {
    const campaign = ad('2026-03-29', '2026-03-29')
    expect(runningAt('2026-03-28T22:59:59.999Z', campaign)).toBe(false) // samedi 28, 23:59:59 (heure d'hiver)
    expect(runningAt('2026-03-28T23:00:00.000Z', campaign)).toBe(true) // dimanche 29, 0 h
    expect(runningAt('2026-03-29T00:59:59.999Z', campaign)).toBe(true) // 1:59:59, juste avant le saut
    expect(runningAt('2026-03-29T01:00:00.000Z', campaign)).toBe(true) // 3 h (heure d'été)
    expect(runningAt('2026-03-29T21:59:59.999Z', campaign)).toBe(true) // 23:59:59 (heure d'été)
    expect(runningAt('2026-03-29T22:00:00.000Z', campaign)).toBe(false) // lundi 30, 0 h
  })

  it('fin de mois et d’année : le lendemain du 31 décembre est le 1er janvier', () => {
    const december = ad('2026-12-01', '2026-12-31')
    expect(runningAt('2026-12-31T22:59:59.999Z', december)).toBe(true)
    expect(runningAt('2026-12-31T23:00:00.000Z', december)).toBe(false)
    const newYear = ad('2027-01-01', '2027-01-10')
    expect(runningAt('2026-12-31T22:59:59.999Z', newYear)).toBe(false)
    expect(runningAt('2026-12-31T23:00:00.000Z', newYear)).toBe(true)
    // 29 février d'une année bissextile
    const leap = ad('2028-02-29', '2028-02-29')
    expect(runningAt('2028-02-28T22:59:59.999Z', leap)).toBe(false)
    expect(runningAt('2028-02-29T12:00:00.000Z', leap)).toBe(true)
    expect(runningAt('2028-02-29T23:00:00.000Z', leap)).toBe(false)
  })

  it('jours enregistrés à une autre heure que midi (import, API) : même règle, au jour de Paris près', () => {
    // premier jour enregistré à minuit (heure de Paris), dernier jour enregistré à 23:59 (heure de Paris)
    const campaign = ad('2026-07-09T22:00:00.000Z', '2026-07-12T21:59:00.000Z')
    expect(runningAt('2026-07-09T21:59:59.999Z', campaign)).toBe(false)
    expect(runningAt('2026-07-09T22:00:00.000Z', campaign)).toBe(true)
    expect(runningAt('2026-07-12T21:59:59.999Z', campaign)).toBe(true)
    expect(runningAt('2026-07-12T22:00:00.000Z', campaign)).toBe(false)
  })

  it('sans premier jour : dès maintenant ; sans dernier jour : sans date de fin', () => {
    expect(runningAt('2020-01-01T12:00:00.000Z', ad(null, null))).toBe(true)
    expect(runningAt('2035-06-01T12:00:00.000Z', ad(undefined, undefined))).toBe(true)
    expect(runningAt('2026-07-01T12:00:00.000Z', ad(null, '2026-07-12'))).toBe(true)
    expect(runningAt('2026-07-13T12:00:00.000Z', ad(null, '2026-07-12'))).toBe(false)
    expect(runningAt('2030-01-01T12:00:00.000Z', ad('2026-07-10', null))).toBe(true)
    expect(runningAt('2026-07-09T12:00:00.000Z', ad('2026-07-10', null))).toBe(false)
  })

  it('une campagne décochée « Active » ne s’affiche jamais, même dans sa période', () => {
    expect(runningAt('2026-07-11T12:00:00.000Z', ad('2026-07-10', '2026-07-12', { active: false }))).toBe(false)
    expect(runningAt('2026-07-11T12:00:00.000Z', ad(null, null, { active: null }))).toBe(false)
  })

  it('le fuseau horaire du serveur n’a aucune influence (serveur réglé en UTC, à New York ou à Tokyo)', () => {
    const instant = new Date('2026-10-25T23:30:00.000Z') // lundi 26 octobre, 0 h 30 à Paris
    const reference = runningAdsWhere(instant)
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
      vi.stubEnv('TZ', tz)
      expect(runningAdsWhere(instant), tz).toEqual(reference)
      expect(matches(ad('2026-10-26', '2026-10-26'), runningAdsWhere(instant)), tz).toBe(true)
    }
  })

  it('sans argument, la période est jugée à l’heure courante', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T23:30:00.000Z')) // lundi 26 octobre, 0 h 30 à Paris
    expect(runningAdsWhere()).toEqual(runningAdsWhere(new Date('2026-10-25T23:30:00.000Z')))
    expect(matches(ad('2026-10-20', '2026-10-25'), runningAdsWhere())).toBe(false)
    expect(matches(ad('2026-10-26', '2026-10-26'), runningAdsWhere())).toBe(true)
  })

  it('runningAdsOrAuthenticated : le public ne lit que les campagnes publiées, actives et en cours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T12:00:00.000Z'))
    const where = whereFor(runningAdsOrAuthenticated)
    expect(where).toEqual({ and: [{ _status: { equals: 'published' } }, runningAdsWhere()] })
    expect(matches(ad('2026-07-10', '2026-07-12'), where)).toBe(true)
    // brouillon d'une campagne (jamais publiée) : invisible, même active et en cours
    expect(matches(ad('2026-07-10', '2026-07-12', { _status: 'draft' }), where)).toBe(false)
    // à venir ou terminée : invisible
    expect(matches(ad('2026-07-12', '2026-07-20'), where)).toBe(false)
    expect(matches(ad('2026-07-01', '2026-07-10'), where)).toBe(false)
  })
})
