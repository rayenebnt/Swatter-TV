// Tests unitaires de la recopie de semaine (POST /api/schedule/copy-week, src/lib/schedule-copy.ts), sans base :
// le point d’entrée est appelé avec une fausse requête et un faux Payload en mémoire. Vérifie la validation, les
// plages de départ et d’arrivée, les messages en français, le décalage des créneaux (changements d’heure compris),
// le refus d’écraser une semaine déjà remplie, la transaction (tout ou rien) et la régénération du site.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest, Where } from 'payload'
import { parisDateTime } from '@/lib/format'
import { copyWeekEndpoint } from '@/lib/schedule-copy'
import { rangeLabel, rangeWhere } from '@/lib/schedule-week'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const { revalidatePath } = await import('next/cache')

type SlotDoc = { id: number; startsAt: string; durationMinutes: number; program: number | { id: number; title: string }; titleOverride?: string | null }
type Body = Record<string, unknown>

/** Les créneaux dont le début est dans la plage d'un filtre produit par rangeWhere. */
function matches(where: Where, doc: SlotDoc): boolean {
  return (where.or as Where[]).some((branch) =>
    (branch.and as Where[]).every((c) => {
      const cond = c.startsAt as { greater_than_equal?: string; less_than?: string }
      const t = Date.parse(doc.startsAt)
      return (
        (cond.greater_than_equal === undefined || t >= Date.parse(cond.greater_than_equal)) && (cond.less_than === undefined || t < Date.parse(cond.less_than))
      )
    }),
  )
}

/** Faux Payload : grille en mémoire, transaction et journal espionnés ; `failOnCreate` fait échouer la n-ième création. */
function fakePayload(docs: SlotDoc[], { failOnCreate }: { failOnCreate?: number } = {}) {
  let store = [...docs]
  let nextId = 1000
  let creations = 0
  const payload = {
    find: vi.fn(async ({ where }: { where: Where }) => ({ docs: store.filter((d) => matches(where, d)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) })),
    count: vi.fn(async ({ where }: { where: Where }) => ({ totalDocs: store.filter((d) => matches(where, d)).length })),
    delete: vi.fn(async ({ where }: { where: Where }) => {
      const removed = store.filter((d) => matches(where, d))
      store = store.filter((d) => !matches(where, d))
      return { docs: removed, errors: [] }
    }),
    create: vi.fn(async ({ data }: { data: Omit<SlotDoc, 'id'> }) => {
      creations++
      if (creations === failOnCreate) throw new Error('panne pendant la création')
      const doc = { id: nextId++, ...data }
      store.push(doc)
      return doc
    }),
    db: {
      beginTransaction: vi.fn(async () => 'transaction-1'),
      commitTransaction: vi.fn(async () => {}),
      rollbackTransaction: vi.fn(async () => {}),
    },
    logger: { error: vi.fn() },
    get store() {
      return store
    },
  }
  return payload
}
type FakePayload = ReturnType<typeof fakePayload>

const request = (payload: FakePayload, body: Body | (() => Promise<unknown>), user: object | null = { id: 1, role: 'editeur' }) =>
  ({ user, payload, json: typeof body === 'function' ? body : async () => body }) as unknown as PayloadRequest

async function call(payload: FakePayload, body: Body | (() => Promise<unknown>), user?: object | null) {
  const res = await copyWeekEndpoint.handler(request(payload, body, user))
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

let lastId = 0
const slotAt = (day: string, time: string, extra: Partial<SlotDoc> = {}): SlotDoc => ({
  id: ++lastId,
  startsAt: parisDateTime(day, time).toISOString(),
  durationMinutes: 30,
  program: { id: 4, title: 'Le journal des Alpes' },
  titleOverride: null,
  ...extra,
})
const paris = (day: string, time: string) => parisDateTime(day, time).toISOString()

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear()
})

describe('recopie de semaine : accès et validation', () => {
  it('sans connexion : 401, rien n’est lu ni écrit', async () => {
    const payload = fakePayload([slotAt('2026-10-12', '20:00')])
    const res = await call(payload, { from: '2026-10-12' }, null)
    expect(res).toEqual({ status: 401, json: { error: 'Connectez-vous pour modifier la grille.' } })
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('jour de départ manquant ou mal écrit : 400', async () => {
    const payload = fakePayload([slotAt('2026-10-12', '20:00')])
    for (const from of [undefined, '', 20261012, '12/10/2026', '2026-1-5', '2026-10-12T00:00', '2026-13-01', '2026-00-10', ' 2026-10-12']) {
      const res = await call(payload, { from })
      expect(res, String(from)).toEqual({ status: 400, json: { error: 'Semaine ou journée manquante ou invalide.' } })
    }
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('corps illisible (JSON invalide) : 400', async () => {
    const payload = fakePayload([])
    const res = await call(payload, () => Promise.reject(new SyntaxError('JSON invalide')))
    expect(res.status).toBe(400)
  })

  it('durée autre qu’une journée (1) ou une semaine (7, par défaut) : 400', async () => {
    const payload = fakePayload([slotAt('2026-10-12', '20:00')])
    for (const days of [0, 2, 14, '7', '1', null, true]) {
      expect((await call(payload, { from: '2026-10-12', days })).status, String(days)).toBe(400)
    }
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('une date qui n’existe pas (30 février) est refusée comme invalide', async () => {
    // Date.parse('2026-02-30') ne renvoie pas NaN (lu comme le 2 mars) : la vérification doit être plus stricte
    const payload = fakePayload([slotAt('2026-03-02', '20:00')])
    const res = await call(payload, { from: '2026-02-30', days: 1 })
    expect(res.status).toBe(400)
  })
})

describe('recopie de semaine : plages de départ et d’arrivée', () => {
  it('semaine par défaut : la semaine (lundi → lundi 2 h) qui contient le jour donné, recopiée sept jours plus tard', async () => {
    const monday = slotAt('2026-10-12', '20:00')
    const sundayNight = slotAt('2026-10-19', '01:30') // nuit du dimanche au lundi : encore la semaine du 12
    const nextWeek = slotAt('2026-10-19', '02:00') // lundi 2 h : semaine d'arrivée, remplacé
    const payload = fakePayload([monday, sundayNight, nextWeek])
    const res = await call(payload, { from: '2026-10-15', replace: true })
    expect(res).toEqual({ status: 200, json: { copied: 2, replaced: 1, target: '2026-10-19' } })
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'schedule', where: rangeWhere('2026-10-12', 7), sort: 'startsAt' }))
    expect(payload.count).toHaveBeenCalledWith(expect.objectContaining({ collection: 'schedule', where: rangeWhere('2026-10-19', 7) }))
  })

  it('une journée (days: 1) : ce jour-là de 2 h à 2 h, recopié le même jour de la semaine suivante', async () => {
    const day = slotAt('2026-10-14', '18:00')
    const night = slotAt('2026-10-15', '01:00')
    const otherDay = slotAt('2026-10-15', '18:00')
    const payload = fakePayload([day, night, otherDay])
    const res = await call(payload, { from: '2026-10-14', days: 1 })
    expect(res).toEqual({ status: 200, json: { copied: 2, replaced: 0, target: '2026-10-21' } })
    expect(payload.create.mock.calls.map(([args]) => args.data.startsAt)).toEqual([paris('2026-10-21', '18:00'), paris('2026-10-22', '01:00')])
  })

  it('rien à recopier : 400 avec la plage en toutes lettres, rien n’est écrit', async () => {
    const payload = fakePayload([slotAt('2026-10-20', '20:00')])
    expect(await call(payload, { from: '2026-10-14' })).toEqual({
      status: 400,
      json: { error: 'La semaine du lundi 12 au dimanche 18 octobre ne contient aucun créneau : il n’y a rien à recopier.' },
    })
    expect(await call(payload, { from: '2026-10-24', days: 1 })).toEqual({
      status: 400,
      json: { error: 'La journée du samedi 24 octobre ne contient aucun créneau : il n’y a rien à recopier.' },
    })
    expect(payload.count).not.toHaveBeenCalled()
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('recopie de semaine : arrivée déjà remplie', () => {
  it('sans « Remplacer » : 409, nombre de créneaux et plage d’arrivée dans le message, rien n’est effacé ni créé', async () => {
    const payload = fakePayload([slotAt('2026-10-12', '20:00'), slotAt('2026-10-19', '20:00'), slotAt('2026-10-20', '20:00')])
    expect(await call(payload, { from: '2026-10-12' })).toEqual({
      status: 409,
      json: {
        error:
          'La semaine du lundi 19 au dimanche 25 octobre contient déjà 2 créneaux. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.',
      },
    })
    expect(payload.delete).not.toHaveBeenCalled()
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.db.beginTransaction).not.toHaveBeenCalled()
  })

  it('un seul créneau déjà saisi : « 1 créneau » au singulier', async () => {
    const payload = fakePayload([slotAt('2026-10-14', '20:00'), slotAt('2026-10-21', '06:00')])
    const res = await call(payload, { from: '2026-10-14', days: 1 })
    expect(res.status).toBe(409)
    expect(res.json.error).toBe(
      `La ${rangeLabel('2026-10-21', 1)} contient déjà 1 créneau. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.`,
    )
  })

  it('« replace » doit valoir true (une chaîne « true » ne suffit pas)', async () => {
    const payload = fakePayload([slotAt('2026-10-12', '20:00'), slotAt('2026-10-19', '20:00')])
    expect((await call(payload, { from: '2026-10-12', replace: 'true' })).status).toBe(409)
    expect(payload.delete).not.toHaveBeenCalled()
  })

  it('avec « Remplacer » : l’arrivée est vidée puis remplie, le nombre de créneaux remplacés est renvoyé', async () => {
    const old = [slotAt('2026-10-19', '20:00'), slotAt('2026-10-20', '07:00')]
    const source = slotAt('2026-10-12', '20:00')
    const payload = fakePayload([source, ...old])
    const res = await call(payload, { from: '2026-10-12', replace: true })
    expect(res).toEqual({ status: 200, json: { copied: 1, replaced: 2, target: '2026-10-19' } })
    expect(payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'schedule', where: rangeWhere('2026-10-19', 7) }))
    expect(payload.delete.mock.invocationCallOrder[0]).toBeLessThan(payload.create.mock.invocationCallOrder[0])
    expect(payload.store.filter((d) => old.some((o) => o.id === d.id))).toEqual([])
    expect(payload.store.map((d) => d.startsAt).sort()).toEqual([source.startsAt, paris('2026-10-19', '20:00')].sort())
  })
})

describe('recopie de semaine : créneaux créés', () => {
  it('publiés aussitôt, même durée, même émission (identifiant), même titre spécifique, sans régénération à chaque créneau', async () => {
    const payload = fakePayload([
      slotAt('2026-10-12', '07:00', { durationMinutes: 45, program: { id: 9, title: 'La météo' }, titleOverride: 'La météo du matin' }),
      slotAt('2026-10-12', '20:00', { durationMinutes: 90, program: 12, titleOverride: null }),
    ])
    await call(payload, { from: '2026-10-12' })
    expect(payload.create).toHaveBeenCalledTimes(2)
    const [first, second] = payload.create.mock.calls.map(([args]) => args as unknown as { collection: string; data: Record<string, unknown>; context: object })
    expect(first.collection).toBe('schedule')
    expect(first.data).toEqual({
      _status: 'published',
      startsAt: paris('2026-10-19', '07:00'),
      durationMinutes: 45,
      program: 9,
      titleOverride: 'La météo du matin',
    })
    expect(second.data).toEqual({ _status: 'published', startsAt: paris('2026-10-19', '20:00'), durationMinutes: 90, program: 12, titleOverride: null })
    expect(first.context).toEqual({ disableRevalidate: true })
  })

  it('créés dans l’ordre de la grille', async () => {
    const payload = fakePayload([slotAt('2026-10-14', '20:00'), slotAt('2026-10-12', '20:00'), slotAt('2026-10-13', '06:00')])
    await call(payload, { from: '2026-10-12' })
    expect(payload.create.mock.calls.map(([args]) => args.data.startsAt)).toEqual([
      paris('2026-10-19', '20:00'),
      paris('2026-10-20', '06:00'),
      paris('2026-10-21', '20:00'),
    ])
  })

  it('à travers le retour à l’heure d’hiver : même heure de Paris (20 h 30 → 20 h 30)', async () => {
    const payload = fakePayload([slotAt('2026-10-19', '20:30'), slotAt('2026-10-25', '23:00'), slotAt('2026-10-26', '01:30')])
    const res = await call(payload, { from: '2026-10-21' })
    expect(res.json).toEqual({ copied: 3, replaced: 0, target: '2026-10-26' })
    expect(payload.create.mock.calls.map(([args]) => args.data.startsAt)).toEqual([
      '2026-10-26T19:30:00.000Z',
      paris('2026-11-01', '23:00'),
      paris('2026-11-02', '01:30'),
    ])
  })

  it('à travers le passage à l’heure d’été : même heure de Paris', async () => {
    const payload = fakePayload([slotAt('2026-03-23', '20:30'), slotAt('2026-03-28', '12:00')])
    await call(payload, { from: '2026-03-23' })
    expect(payload.create.mock.calls.map(([args]) => args.data.startsAt)).toEqual(['2026-03-30T18:30:00.000Z', paris('2026-04-04', '12:00')])
  })
})

describe('recopie de semaine : tout ou rien et régénération du site', () => {
  it('réussite : transaction validée, puis tout le site régénéré', async () => {
    const payload = fakePayload([slotAt('2026-10-12', '20:00')])
    await call(payload, { from: '2026-10-12' })
    expect(payload.db.beginTransaction).toHaveBeenCalledTimes(1)
    expect(payload.db.commitTransaction).toHaveBeenCalledWith('transaction-1')
    expect(payload.db.rollbackTransaction).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('échec en cours de copie : transaction annulée, 500 avec un message rassurant, rien de régénéré', async () => {
    const payload = fakePayload([slotAt('2026-10-12', '20:00'), slotAt('2026-10-13', '20:00'), slotAt('2026-10-19', '20:00')], { failOnCreate: 2 })
    const res = await call(payload, { from: '2026-10-12', replace: true })
    expect(res).toEqual({ status: 500, json: { error: 'La copie a échoué : aucun créneau n’a été modifié. Réessayez dans un instant.' } })
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith('transaction-1')
    expect(payload.db.commitTransaction).not.toHaveBeenCalled()
    expect(payload.logger.error).toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
