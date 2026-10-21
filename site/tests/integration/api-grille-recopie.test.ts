// Tests d'intégration de la recopie de la grille des programmes (POST /api/schedule/copy-week) : connexion de l'équipe
// exigée, refus clairs (semaine invalide, rien à recopier, arrivée déjà remplie), remplacement ou non de ce qui est déjà
// saisi, créneaux recopiés sept jours plus tard à la même heure de Paris (changements d'heure compris), tout ou rien.
// Chaque test travaille sur ses propres semaines de 2030.
import type { Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parisDateTime } from '@/lib/format'
import type { Program, Schedule } from '@/payload-types'
import { adminToken, apiJson, editorToken, testPayload } from './helpers'
import { createProgram, signup } from './api-outils'

type CopyAnswer = { copied?: number; replaced?: number; target?: string; error?: string }

const CONTEXT = { disableRevalidate: true }
const WEEK_MS = 7 * 86_400_000
const INVALID = { error: 'Semaine ou journée manquante ou invalide.' }

let payload: Payload
let journal: Program
let magazine: Program

beforeAll(async () => {
  payload = await testPayload()
  ;[journal, magazine] = await Promise.all([createProgram({ title: 'Le journal des tests' }), createProgram({ title: 'Le magazine des tests' })])
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Créneau en ligne, au jour et à l'heure de Paris donnés. */
async function slot(day: string, time: string, extra: Partial<Omit<Schedule, 'id'>> = {}): Promise<Schedule> {
  return payload.create({
    collection: 'schedule',
    data: { startsAt: parisDateTime(day, time).toISOString(), durationMinutes: 30, program: journal.id, _status: 'published', ...extra },
    depth: 0,
    context: CONTEXT,
  })
}

/** Créneaux qui commencent entre deux instants de Paris ([jour, heure]), dans l'ordre. */
async function slotsBetween(from: [string, string], to: [string, string]): Promise<Schedule[]> {
  const where = {
    and: [{ startsAt: { greater_than_equal: parisDateTime(...from).toISOString() } }, { startsAt: { less_than: parisDateTime(...to).toISOString() } }],
  }
  return (await payload.find({ collection: 'schedule', where, sort: 'startsAt', pagination: false, depth: 0 })).docs
}

const weekLater = (s: Schedule) => new Date(Date.parse(s.startsAt) + WEEK_MS).toISOString()

/** Demande de recopie faite par l'équipe (administrateur par défaut). */
const copy = async (body: unknown, token?: string) => apiJson<CopyAnswer>('/schedule/copy-week', { method: 'POST', body, token: token ?? (await adminToken()) })

describe('recopie de la grille', () => {
  it('recopie : réservée à l’équipe connectée (401 sans connexion ou avec une session de membre)', async () => {
    const m = await signup()
    for (const options of [{}, { cookie: m.jar.header() }]) {
      const res = await apiJson<CopyAnswer>('/schedule/copy-week', { body: { from: '2030-01-07' }, ...options })
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Connectez-vous pour modifier la grille.' })
    }
  })

  it.each<[string, unknown]>([
    ['sans corps', undefined],
    ['corps illisible', 'pas du json'],
    ['sans semaine', {}],
    ['semaine en toutes lettres', { from: 'lundi' }],
    ['mois 13', { from: '2030-13-01' }],
    ['jour 32', { from: '2030-01-32' }],
    ['date à la française', { from: '07/01/2030' }],
    ['date en nombre', { from: 20300107 }],
    ['date avec l’heure', { from: '2030-01-07T00:00' }],
    ['3 jours', { from: '2030-01-07', days: 3 }],
    ['« 7 » en texte', { from: '2030-01-07', days: '7' }],
    ['0 jour', { from: '2030-01-07', days: 0 }],
    ['nombre de jours vide', { from: '2030-01-07', days: null }],
  ])('recopie : %s → refus clair (400)', async (_, body) => {
    const res = await copy(body)
    expect(res.status).toBe(400)
    expect(res.body).toEqual(INVALID)
  })

  it('recopie : une date qui n’existe pas (30 février, 29 février 2030, 31 avril) est refusée, sans recopier un autre jour à la place', async () => {
    // samedi 2 mars 2030 : le jour que « 30 février » désignerait par débordement
    await slot('2030-03-02', '10:00')
    for (const from of ['2030-02-30', '2030-02-29', '2030-04-31']) {
      const res = await copy({ from, days: 1 })
      expect(res.status, from).toBe(400)
      expect(res.body, from).toEqual(INVALID)
    }
    expect(await slotsBetween(['2030-03-09', '00:00'], ['2030-03-10', '00:00'])).toEqual([])
  })

  it('recopie : une semaine ou une journée sans créneau → refus clair (400), rien n’est créé', async () => {
    // mercredi 5 ou dimanche 9 juin : c'est la semaine (du lundi au dimanche) qui les contient qui compte
    for (const from of ['2030-06-05', '2030-06-09']) {
      const week = await copy({ from })
      expect(week.status, from).toBe(400)
      expect(week.body, from).toEqual({ error: 'La semaine du lundi 3 au dimanche 9 juin ne contient aucun créneau : il n’y a rien à recopier.' })
    }
    const day = await copy({ from: '2030-06-03', days: 1 })
    expect(day.status).toBe(400)
    expect(day.body).toEqual({ error: 'La journée du lundi 3 juin ne contient aucun créneau : il n’y a rien à recopier.' })
    expect(await slotsBetween(['2030-06-10', '00:00'], ['2030-06-17', '00:00'])).toEqual([])
  })

  it('recopie : la semaine (journées TV de 2 h à 2 h) est recopiée sept jours plus tard à la même heure, directement en ligne', async () => {
    // nuit du dimanche 6 au lundi 7 à 1 h 30 : journée TV du dimanche, semaine précédente
    const previousWeek = await slot('2030-01-07', '01:30', { titleOverride: 'Nuit de la semaine précédente' })
    const sources = [
      await slot('2030-01-07', '06:00'),
      await slot('2030-01-09', '20:30', { program: magazine.id, titleOverride: 'Le magazine — Soirée spéciale', durationMinutes: 45 }),
      await slot('2030-01-13', '23:00'),
      // nuit du dimanche 13 au lundi 14 : encore la journée TV du dimanche
      await slot('2030-01-14', '01:30', { durationMinutes: 60 }),
    ]
    // un éditeur peut recopier ; un jour en milieu de semaine désigne toute la semaine
    const res = await copy({ from: '2030-01-09' }, await editorToken())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 4, replaced: 0, target: '2030-01-14' })

    const copies = await slotsBetween(['2030-01-14', '02:00'], ['2030-01-21', '02:00'])
    expect(copies.map((c) => c.startsAt)).toEqual(sources.map(weekLater))
    copies.forEach((c, i) => {
      expect(c.durationMinutes).toBe(sources[i].durationMinutes)
      expect(c.program).toBe(sources[i].program)
      expect(c.titleOverride ?? null).toBe(sources[i].titleOverride ?? null)
      expect(c._status).toBe('published')
    })
    expect(copies[1].label).toBe('16/01/2030 20:30 — Le magazine — Soirée spéciale')
    expect(copies[0].label).toBe('14/01/2030 06:00 — Le journal des tests')

    // la nuit de la semaine précédente n'est pas recopiée ; les créneaux d'origine sont intacts
    expect((await slotsBetween(['2030-01-14', '00:00'], ['2030-01-14', '02:00'])).map((s) => s.id)).toEqual([sources[3].id])
    expect((await slotsBetween(['2030-01-07', '00:00'], ['2030-01-14', '02:00'])).map((s) => s.id)).toEqual([previousWeek, ...sources].map((s) => s.id))
  })

  it('recopie : refusée (409) si la semaine suivante contient déjà des créneaux ; rien n’est effacé ni recopié', async () => {
    await slot('2030-02-04', '10:00')
    await slot('2030-02-06', '10:00')
    const first = await slot('2030-02-13', '12:00')
    const res = await copy({ from: '2030-02-04' })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error:
        'La semaine du lundi 11 au dimanche 17 février contient déjà 1 créneau. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.',
    })
    // seul le booléen true remplace
    expect((await copy({ from: '2030-02-04', replace: 'true' })).status).toBe(409)
    const second = await slot('2030-02-15', '12:00')
    expect((await copy({ from: '2030-02-04', replace: 1 })).body).toEqual({
      error:
        'La semaine du lundi 11 au dimanche 17 février contient déjà 2 créneaux. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.',
    })
    expect((await slotsBetween(['2030-02-11', '02:00'], ['2030-02-18', '02:00'])).map((s) => s.id)).toEqual([first.id, second.id])
  })

  it('recopie : avec « Remplacer », ce qui était saisi la semaine suivante est effacé puis remplacé (la semaine d’après n’est pas touchée)', async () => {
    const sources = [await slot('2030-07-01', '07:00'), await slot('2030-07-03', '18:00', { program: magazine.id })]
    const old = [await slot('2030-07-08', '09:00'), await slot('2030-07-10', '21:00')]
    const after = await slot('2030-07-15', '10:00')
    const res = await copy({ from: '2030-07-01', replace: true })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 2, replaced: 2, target: '2030-07-08' })
    const target = await slotsBetween(['2030-07-08', '02:00'], ['2030-07-15', '02:00'])
    expect(target.map((s) => s.startsAt)).toEqual(sources.map(weekLater))
    for (const o of old) expect(target.map((s) => s.id)).not.toContain(o.id)
    expect((await slotsBetween(['2030-07-15', '02:00'], ['2030-07-22', '02:00'])).map((s) => s.id)).toEqual([after.id])
    // une seule journée, avec « Remplacer » : la copie déjà faite ce jour-là est remplacée
    const monday = await copy({ from: '2030-07-01', days: 1, replace: true })
    expect(monday.body).toEqual({ copied: 1, replaced: 1, target: '2030-07-08' })
    expect((await slotsBetween(['2030-07-08', '02:00'], ['2030-07-15', '02:00'])).map((s) => s.startsAt)).toEqual(sources.map(weekLater))
  })

  it('recopie : la même heure de Paris d’une semaine à l’autre, changements d’heure compris', async () => {
    // fin de l'heure d'été le dimanche 27 octobre 2030
    await slot('2030-10-22', '20:30')
    await slot('2030-10-26', '12:00')
    await slot('2030-10-27', '12:00')
    expect((await copy({ from: '2030-10-21' })).body).toMatchObject({ copied: 3, target: '2030-10-28' })
    expect((await slotsBetween(['2030-10-28', '02:00'], ['2030-11-04', '02:00'])).map((s) => s.startsAt)).toEqual([
      '2030-10-29T19:30:00.000Z',
      '2030-11-02T11:00:00.000Z',
      '2030-11-03T11:00:00.000Z',
    ])
    // début de l'heure d'été le dimanche 31 mars 2030
    await slot('2030-03-30', '20:00')
    await slot('2030-03-31', '20:00')
    expect((await copy({ from: '2030-03-25' })).body).toMatchObject({ copied: 2, target: '2030-04-01' })
    expect((await slotsBetween(['2030-04-01', '02:00'], ['2030-04-08', '02:00'])).map((s) => s.startsAt)).toEqual([
      '2030-04-06T18:00:00.000Z',
      '2030-04-07T18:00:00.000Z',
    ])
  })

  it('recopie : une seule journée (days: 1) va sept jours plus tard ; le reste de la semaine n’est pas touché', async () => {
    // nuit du mardi au mercredi : journée TV du mardi
    await slot('2030-05-08', '01:00')
    const day = [await slot('2030-05-08', '09:00'), await slot('2030-05-08', '21:00'), await slot('2030-05-09', '01:00')]
    await slot('2030-05-09', '10:00')
    const res = await copy({ from: '2030-05-08', days: 1 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 3, replaced: 0, target: '2030-05-15' })
    expect((await slotsBetween(['2030-05-14', '00:00'], ['2030-05-17', '00:00'])).map((s) => s.startsAt)).toEqual(day.map(weekLater))

    const again = await copy({ from: '2030-05-08', days: 1 })
    expect(again.status).toBe(409)
    expect(again.body).toEqual({
      error: 'La journée du mercredi 15 mai contient déjà 3 créneaux. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.',
    })
  })

  it('recopie : tout ou rien — une erreur en cours de copie ne crée ni n’efface aucun créneau', async () => {
    await slot('2030-09-02', '08:00')
    await slot('2030-09-04', '08:00')
    await slot('2030-09-06', '08:00')
    const existing = await slot('2030-09-10', '12:00')
    const create = payload.create.bind(payload)
    let creations = 0
    // panne au deuxième créneau recopié
    vi.spyOn(payload, 'create').mockImplementation((async (args: { collection: string }) => {
      if (args.collection === 'schedule' && ++creations === 2) throw new Error('panne simulée de la base')
      return create(args as never)
    }) as unknown as typeof payload.create)
    const logged = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)

    const res = await copy({ from: '2030-09-02', replace: true })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'La copie a échoué : aucun créneau n’a été modifié. Réessayez dans un instant.' })
    expect(creations).toBe(2)
    expect(logged).toHaveBeenCalled()
    vi.restoreAllMocks()

    // le créneau qui était saisi est toujours là, aucune copie n'est restée
    expect((await slotsBetween(['2030-09-09', '02:00'], ['2030-09-16', '02:00'])).map((s) => s.id)).toEqual([existing.id])
    expect((await copy({ from: '2030-09-02', replace: true })).body).toEqual({ copied: 3, replaced: 1, target: '2030-09-09' })
  })
})
