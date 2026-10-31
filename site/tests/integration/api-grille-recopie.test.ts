// Tests d'intégration de la grille des programmes : horaires d'antenne contrôlés à l'enregistrement (tous les jours de
// 18 h à 0 h 30, heure de Paris ; un créneau de 0 h à 0 h 30 est daté du lendemain et appartient à la soirée de la
// veille), puis recopie (POST /api/schedule/copy-week) : connexion de l'équipe exigée, refus clairs (semaine invalide, rien
// à recopier, arrivée déjà remplie), remplacement ou non de ce qui est déjà saisi, créneaux recopiés sept jours plus tard
// à la même heure de Paris (changements d'heure compris), anciens créneaux hors antenne laissés de côté et comptés, tout
// ou rien. Chaque test travaille sur ses propres semaines de 2030.
import { ValidationError, type Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parisDateTime } from '@/lib/format'
import type { Program, Schedule } from '@/payload-types'
import { adminToken, apiJson, editorToken, testPayload } from './helpers'
import { createProgram, signup } from './api-outils'

type CopyAnswer = { copied?: number; replaced?: number; target?: string; error?: string }

const CONTEXT = { disableRevalidate: true }
const WEEK_MS = 7 * 86_400_000
const INVALID = { error: 'Semaine ou soirée manquante ou invalide.' }

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

/** Créneau en ligne, au jour et à l'heure de Paris donnés (30 min par défaut ; à 0 h 15, 15 min pour finir à 0 h 30). */
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

/**
 * Ancien créneau hors antenne (saisi avant les horaires 18 h – 0 h 30) : créé à l'antenne, puis déplacé directement en
 * base, sans les contrôles de Payload, comme les données d'avant.
 */
async function legacySlot(day: string, time: string, durationMinutes = 30, titleOverride = 'Ancien créneau'): Promise<Schedule> {
  const created = await slot(day, '20:00', { titleOverride })
  await payload.db.updateOne({ collection: 'schedule', id: created.id, data: { startsAt: parisDateTime(day, time).toISOString(), durationMinutes } })
  return payload.findByID({ collection: 'schedule', id: created.id, depth: 0 })
}

/** Champ et message de l'erreur de contrôle levée par Payload. */
async function refusal(promise: Promise<unknown>): Promise<{ path: string; message: string }[]> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'le créneau aurait dû être refusé').toBeInstanceOf(ValidationError)
  return ((error as ValidationError).data.errors ?? []).map(({ path, message }) => ({ path, message }))
}

const START_REFUSED = { path: 'startsAt', message: expect.stringContaining('choisissez une heure de début entre 18:00 et 00:25') }

describe('grille : horaires d’antenne contrôlés à l’enregistrement (18 h – 0 h 30, heure de Paris)', () => {
  it('début : 17:55 refusé, 18:00 accepté, 00:25 accepté (soirée de la veille), 00:30 refusé', async () => {
    expect(await refusal(slot('2030-11-04', '17:55'))).toEqual([START_REFUSED])
    expect(await refusal(slot('2030-11-05', '00:30'))).toEqual([START_REFUSED])
    expect(await refusal(slot('2030-11-04', '12:00'))).toEqual([START_REFUSED])
    const six = await slot('2030-11-04', '18:00')
    expect(six.label).toBe('04/11/2030 18:00 — Le journal des tests')
    const late = await slot('2030-11-05', '00:25', { durationMinutes: 5 })
    // daté du mardi 5, rattaché à la soirée du lundi 4
    expect(late.label).toBe('Soirée du 04/11/2030, 00:25 — Le journal des tests')
    const midnight = await slot('2030-11-05', '00:00', { durationMinutes: 30 })
    expect(midnight.label).toBe('Soirée du 04/11/2030, 00:00 — Le journal des tests')
  })

  it('fin : 0 h 30 au plus tard (23:45 + 60 min refusé, 23:45 + 45 min accepté), soirée entière de 390 min au plus', async () => {
    expect(await refusal(slot('2030-11-06', '23:45', { durationMinutes: 60 }))).toEqual([
      { path: 'durationMinutes', message: 'Ce créneau finirait à 00:45, après la fin de l\'antenne (0 h 30) : 45 min au plus à partir de 23:45.' },
    ])
    await slot('2030-11-06', '23:45', { durationMinutes: 45 })
    await slot('2030-11-07', '18:00', { durationMinutes: 390 })
    const tooLong = await refusal(slot('2030-11-08', '18:00', { durationMinutes: 391 }))
    expect(tooLong.map((e) => e.path)).toEqual(['durationMinutes'])
    expect(await refusal(slot('2030-11-08', '18:00', { durationMinutes: 0 }))).toHaveLength(1)
  })

  it('modification partielle : la seule durée est contrôlée avec le début enregistré, le seul début avec la durée enregistrée', async () => {
    const s = await slot('2030-11-11', '23:45', { durationMinutes: 30 })
    // allongé au-delà de 0 h 30, sans renvoyer le début (API)
    const longer = await apiJson<{ errors?: { data?: { errors?: { path: string; message: string }[] } }[] }>(`/schedule/${s.id}`, {
      method: 'PATCH',
      token: await editorToken(),
      body: { durationMinutes: 60 },
    })
    expect(longer.status).toBe(400)
    expect(longer.body.errors?.[0]?.data?.errors).toEqual([expect.objectContaining({ path: 'durationMinutes', message: expect.stringMatching(/45 min au plus/) })])
    expect(await refusal(payload.update({ collection: 'schedule', id: s.id, data: { durationMinutes: 46 }, context: CONTEXT }))).toEqual([
      expect.objectContaining({ path: 'durationMinutes' }),
    ])
    // déplacé à 17 h, sans renvoyer la durée : refusé ; à 0 h 10 le lendemain avec 30 min : finit à 0 h 40, refusé
    expect(await refusal(payload.update({ collection: 'schedule', id: s.id, data: { startsAt: parisDateTime('2030-11-11', '17:00').toISOString() } }))).toEqual([START_REFUSED])
    expect((await refusal(payload.update({ collection: 'schedule', id: s.id, data: { startsAt: parisDateTime('2030-11-12', '00:10').toISOString() } })))[0].path).toBe(
      'durationMinutes',
    )
    const ok = await payload.update({ collection: 'schedule', id: s.id, data: { durationMinutes: 45 }, context: CONTEXT })
    expect(ok.durationMinutes).toBe(45)
    expect((await payload.findByID({ collection: 'schedule', id: s.id, depth: 0 })).startsAt).toBe(s.startsAt)
  })

  it('jours de changement d’heure : la soirée fait toujours 6 h 30 (0 h 15 le dimanche encore à l’heure d’été ou d’hiver)', async () => {
    // dimanche 30 octobre 2033 (retour à l'heure d'hiver à 3 h) et dimanche 27 mars 2033 (heure d'été à 2 h)
    for (const [day, next] of [
      ['2033-10-29', '2033-10-30'],
      ['2033-10-30', '2033-10-31'],
      ['2033-03-26', '2033-03-27'],
      ['2033-03-27', '2033-03-28'],
    ]) {
      await slot(day, '18:00', { durationMinutes: 360, titleOverride: `Soirée du ${day}` })
      await slot(next, '00:00', { durationMinutes: 30, titleOverride: `Fin de soirée du ${day}` })
      expect(await refusal(slot(next, '00:00', { durationMinutes: 31 }))).toHaveLength(1)
    }
  })
})

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
    await slot('2030-03-02', '20:00')
    for (const from of ['2030-02-30', '2030-02-29', '2030-04-31']) {
      const res = await copy({ from, days: 1 })
      expect(res.status, from).toBe(400)
      expect(res.body, from).toEqual(INVALID)
    }
    expect(await slotsBetween(['2030-03-09', '00:00'], ['2030-03-10', '00:00'])).toEqual([])
  })

  it('recopie : une semaine ou une soirée sans créneau → refus clair (400), rien n’est créé', async () => {
    // mercredi 5 ou dimanche 9 juin : c'est la semaine (du lundi au dimanche) qui les contient qui compte
    for (const from of ['2030-06-05', '2030-06-09']) {
      const week = await copy({ from })
      expect(week.status, from).toBe(400)
      expect(week.body, from).toEqual({ error: 'La semaine du lundi 3 au dimanche 9 juin ne contient aucun créneau : il n’y a rien à recopier.' })
    }
    const day = await copy({ from: '2030-06-03', days: 1 })
    expect(day.status).toBe(400)
    expect(day.body).toEqual({ error: 'La soirée du lundi 3 juin ne contient aucun créneau : il n’y a rien à recopier.' })
    expect(await slotsBetween(['2030-06-10', '00:00'], ['2030-06-17', '00:00'])).toEqual([])
  })

  it('recopie : la semaine (soirées du lundi au dimanche, de 18 h à 0 h 30) est recopiée sept jours plus tard à la même heure, directement en ligne', async () => {
    // lundi 7 à 0 h 15 : fin de la soirée du dimanche 6, semaine précédente
    const previousWeek = await slot('2030-01-07', '00:15', { titleOverride: 'Fin de la semaine précédente', durationMinutes: 15 })
    const sources = [
      await slot('2030-01-07', '18:00'),
      await slot('2030-01-09', '20:30', { program: magazine.id, titleOverride: 'Le magazine — Soirée spéciale', durationMinutes: 45 }),
      await slot('2030-01-13', '23:00'),
      // lundi 14 à 0 h 15 : encore la soirée du dimanche 13
      await slot('2030-01-14', '00:15', { durationMinutes: 15 }),
    ]
    // un éditeur peut recopier ; un jour en milieu de semaine désigne toute la semaine
    const res = await copy({ from: '2030-01-09' }, await editorToken())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 4, skipped: 0, replaced: 0, target: '2030-01-14' })

    const copies = await slotsBetween(['2030-01-14', '00:30'], ['2030-01-21', '00:30'])
    expect(copies.map((c) => c.startsAt)).toEqual(sources.map(weekLater))
    copies.forEach((c, i) => {
      expect(c.durationMinutes).toBe(sources[i].durationMinutes)
      expect(c.program).toBe(sources[i].program)
      expect(c.titleOverride ?? null).toBe(sources[i].titleOverride ?? null)
      expect(c._status).toBe('published')
    })
    expect(copies[1].label).toBe('16/01/2030 20:30 — Le magazine — Soirée spéciale')
    expect(copies[0].label).toBe('14/01/2030 18:00 — Le journal des tests')
    expect(copies[3].label).toBe('Soirée du 20/01/2030, 00:15 — Le journal des tests')

    // la fin de soirée de la semaine précédente n'est pas recopiée ; les créneaux d'origine sont intacts
    expect((await slotsBetween(['2030-01-14', '00:00'], ['2030-01-14', '00:30'])).map((s) => s.id)).toEqual([sources[3].id])
    expect((await slotsBetween(['2030-01-07', '00:00'], ['2030-01-14', '00:30'])).map((s) => s.id)).toEqual([previousWeek, ...sources].map((s) => s.id))
  })

  it('recopie : refusée (409) si la semaine suivante contient déjà des créneaux ; rien n’est effacé ni recopié', async () => {
    await slot('2030-02-04', '19:00')
    await slot('2030-02-06', '19:00')
    const first = await slot('2030-02-13', '20:00')
    const res = await copy({ from: '2030-02-04' })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error:
        'La semaine du lundi 11 au dimanche 17 février contient déjà 1 créneau. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.',
    })
    // seul le booléen true remplace
    expect((await copy({ from: '2030-02-04', replace: 'true' })).status).toBe(409)
    const second = await slot('2030-02-15', '20:00')
    expect((await copy({ from: '2030-02-04', replace: 1 })).body).toEqual({
      error:
        'La semaine du lundi 11 au dimanche 17 février contient déjà 2 créneaux. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.',
    })
    expect((await slotsBetween(['2030-02-11', '00:30'], ['2030-02-18', '00:30'])).map((s) => s.id)).toEqual([first.id, second.id])
  })

  it('recopie : avec « Remplacer », ce qui était saisi la semaine suivante est effacé puis remplacé (la semaine d’après n’est pas touchée)', async () => {
    const sources = [await slot('2030-07-01', '19:00'), await slot('2030-07-03', '18:00', { program: magazine.id })]
    const old = [await slot('2030-07-08', '21:00'), await slot('2030-07-10', '21:00')]
    const after = await slot('2030-07-15', '20:00')
    const res = await copy({ from: '2030-07-01', replace: true })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 2, skipped: 0, replaced: 2, target: '2030-07-08' })
    const target = await slotsBetween(['2030-07-08', '00:30'], ['2030-07-15', '00:30'])
    expect(target.map((s) => s.startsAt)).toEqual(sources.map(weekLater))
    for (const o of old) expect(target.map((s) => s.id)).not.toContain(o.id)
    expect((await slotsBetween(['2030-07-15', '00:30'], ['2030-07-22', '00:30'])).map((s) => s.id)).toEqual([after.id])
    // une seule soirée, avec « Remplacer » : la copie déjà faite ce soir-là est remplacée
    const monday = await copy({ from: '2030-07-01', days: 1, replace: true })
    expect(monday.body).toEqual({ copied: 1, skipped: 0, replaced: 1, target: '2030-07-08' })
    expect((await slotsBetween(['2030-07-08', '00:30'], ['2030-07-15', '00:30'])).map((s) => s.startsAt)).toEqual(sources.map(weekLater))
  })

  it('recopie : la même heure de Paris d’une semaine à l’autre, changements d’heure compris', async () => {
    // fin de l'heure d'été le dimanche 27 octobre 2030 à 3 h : le dimanche à 0 h 15 (soirée du samedi) est encore à
    // l'heure d'été, sa copie du dimanche 3 novembre à l'heure d'hiver
    await slot('2030-10-22', '20:30')
    await slot('2030-10-26', '20:00')
    const sundayNight = await slot('2030-10-27', '00:15', { durationMinutes: 15 })
    expect(sundayNight.startsAt).toBe('2030-10-26T22:15:00.000Z')
    await slot('2030-10-27', '20:00')
    expect((await copy({ from: '2030-10-21' })).body).toEqual({ copied: 4, skipped: 0, replaced: 0, target: '2030-10-28' })
    expect((await slotsBetween(['2030-10-28', '00:30'], ['2030-11-04', '00:30'])).map((s) => s.startsAt)).toEqual([
      '2030-10-29T19:30:00.000Z',
      '2030-11-02T19:00:00.000Z',
      '2030-11-02T23:15:00.000Z',
      '2030-11-03T19:00:00.000Z',
    ])
    // début de l'heure d'été le dimanche 31 mars 2030 à 2 h : le dimanche à 0 h 15 est encore à l'heure d'hiver
    await slot('2030-03-30', '20:00')
    await slot('2030-03-31', '00:15', { durationMinutes: 15 })
    await slot('2030-03-31', '20:00')
    expect((await copy({ from: '2030-03-25' })).body).toMatchObject({ copied: 3, skipped: 0, target: '2030-04-01' })
    expect((await slotsBetween(['2030-04-01', '00:30'], ['2030-04-08', '00:30'])).map((s) => s.startsAt)).toEqual([
      '2030-04-06T18:00:00.000Z',
      '2030-04-06T22:15:00.000Z',
      '2030-04-07T18:00:00.000Z',
    ])
  })

  it('recopie : une seule soirée (days: 1, de 18 h à 0 h 30) va sept jours plus tard ; le reste de la semaine n’est pas touché', async () => {
    // mercredi 8 à 0 h 15 : fin de la soirée du mardi
    await slot('2030-05-08', '00:15', { durationMinutes: 15 })
    const day = [await slot('2030-05-08', '19:00'), await slot('2030-05-08', '21:00'), await slot('2030-05-09', '00:15', { durationMinutes: 15 })]
    await slot('2030-05-09', '20:00')
    const res = await copy({ from: '2030-05-08', days: 1 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 3, skipped: 0, replaced: 0, target: '2030-05-15' })
    expect((await slotsBetween(['2030-05-14', '00:00'], ['2030-05-17', '00:00'])).map((s) => s.startsAt)).toEqual(day.map(weekLater))

    const again = await copy({ from: '2030-05-08', days: 1 })
    expect(again.status).toBe(409)
    expect(again.body).toEqual({
      error: 'La soirée du mercredi 15 mai contient déjà 3 créneaux. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.',
    })
  })

  it('recopie : tout ou rien — une erreur en cours de copie ne crée ni n’efface aucun créneau', async () => {
    await slot('2030-09-02', '20:00')
    await slot('2030-09-04', '20:00')
    await slot('2030-09-06', '20:00')
    const existing = await slot('2030-09-10', '21:00')
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
    expect((await slotsBetween(['2030-09-09', '00:30'], ['2030-09-16', '00:30'])).map((s) => s.id)).toEqual([existing.id])
    expect((await copy({ from: '2030-09-02', replace: true })).body).toEqual({ copied: 3, skipped: 0, replaced: 1, target: '2030-09-09' })
  })

  it('recopie : les anciens créneaux hors antenne (6 h, 17 h 30, 0 h 30, fin après 0 h 30) sont laissés de côté et comptés', async () => {
    const onAir = [await slot('2030-12-02', '18:00'), await slot('2030-12-03', '00:00', { durationMinutes: 30 })]
    await legacySlot('2030-12-02', '06:00', 360, 'Matinale d’avant')
    await legacySlot('2030-12-03', '17:30', 60)
    await legacySlot('2030-12-04', '00:30', 30)
    await legacySlot('2030-12-04', '23:45', 60)
    const res = await copy({ from: '2030-12-02' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 2, skipped: 4, replaced: 0, target: '2030-12-09' })
    expect((await slotsBetween(['2030-12-09', '00:30'], ['2030-12-16', '00:30'])).map((s) => s.startsAt)).toEqual(onAir.map(weekLater))

    // une soirée qui ne contient que d'anciens créneaux : rien à recopier
    await legacySlot('2030-12-18', '12:00')
    const only = await copy({ from: '2030-12-18', days: 1 })
    expect(only.status).toBe(400)
    expect(only.body.error).toBe(
      'La soirée du mercredi 18 décembre ne contient qu’un créneau en dehors des horaires d’antenne (18 h – 0 h 30) : il n’y a rien à recopier. Corrigez son heure ou sa durée, ou supprimez-le.',
    )
  })
})
