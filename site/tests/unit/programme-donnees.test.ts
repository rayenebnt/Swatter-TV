// Tests unitaires des données du programme TV, sans base : créneaux sérialisables (toSlot), créneaux d’un intervalle,
// programme en cours et suivants (getOnAir) et semaine de la page Programme TV (getProgrammeWeek), avec un faux
// client Payload qui applique lui-même le filtre de dates demandé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parisDateTime } from '@/lib/format'
import type { Media, Program, Schedule } from '@/payload-types'

vi.mock('@/lib/payload', () => ({ getPayloadClient: vi.fn() }))

const { getPayloadClient } = await import('@/lib/payload')
const { getOnAir, getScheduleBetween, toSlot } = await import('@/lib/queries/schedule')
const { getProgrammeWeek } = await import('@/components/programme/data')

type Bound = { greater_than_equal?: string; less_than?: string }
type FindArgs = { collection: string; where: { and: { startsAt: Bound }[] }; sort?: string; depth?: number; limit?: number; pagination?: boolean }

const program = (extra: Partial<Program> = {}): Program =>
  ({
    id: 7,
    title: 'Le journal des Alpes',
    slug: 'le-journal-des-alpes',
    genre: 'info',
    synopsis: 'L’actualité de la région.',
    isPremiere: true,
    image: null,
    ...extra,
  }) as Program

let lastId = 0
/** Créneau tel que le renvoie Payload (émission chargée), début en heure de Paris. */
function scheduleDoc(day: string, time: string, minutes: number, extra: Partial<Schedule> = {}): Schedule {
  lastId++
  return {
    id: lastId,
    startsAt: parisDateTime(day, time).toISOString(),
    durationMinutes: minutes,
    program: program(),
    titleOverride: null,
    ...extra,
  } as Schedule
}

/** Faux client : garde les créneaux dont le début respecte le filtre `and` de startsAt, triés par début. */
function useSchedule(docs: Schedule[]) {
  const find = vi.fn(async (args: FindArgs) => {
    const bounds = args.where.and.map((c) => c.startsAt)
    const from = bounds.find((b) => b.greater_than_equal)?.greater_than_equal
    const to = bounds.find((b) => b.less_than)?.less_than
    const kept = docs.filter((d) => (!from || d.startsAt >= from) && (!to || d.startsAt < to)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    return { docs: kept }
  })
  vi.mocked(getPayloadClient).mockResolvedValue({ find } as never)
  return find
}

beforeEach(() => {
  vi.mocked(getPayloadClient).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toSlot : créneau sérialisable', () => {
  it('titre, horaires ISO, genre, résumé, image et émission', () => {
    const image = {
      id: 3,
      url: 'http://localhost:3000/api/media/file/journal.jpg',
      sizes: { card: { url: 'http://localhost:3000/api/media/file/journal-card.webp' } },
    } as Media
    const doc = scheduleDoc('2026-10-21', '20:30', 45, { program: program({ image }) })
    expect(toSlot(doc)).toEqual({
      id: doc.id,
      title: 'Le journal des Alpes',
      start: '2026-10-21T18:30:00.000Z',
      end: '2026-10-21T19:15:00.000Z',
      durationMinutes: 45,
      genre: 'info',
      genreLabel: 'Info',
      synopsis: 'L’actualité de la région.',
      image: '/api/media/file/journal-card.webp',
      programSlug: 'le-journal-des-alpes',
      isPremiere: true,
    })
  })

  it('le titre spécifique du créneau passe avant celui de l’émission', () => {
    expect(toSlot(scheduleDoc('2026-10-21', '19:00', 30, { titleOverride: 'Le journal des Alpes — Soir' })).title).toBe('Le journal des Alpes — Soir')
  })

  it('émission non chargée (identifiant seul) : « Programme », sans genre ni image', () => {
    const slot = toSlot(scheduleDoc('2026-10-21', '19:00', 30, { program: 7 }))
    expect(slot).toMatchObject({ title: 'Programme', genre: null, genreLabel: '', synopsis: null, image: null, programSlug: null, isPremiere: false })
  })

  it('la fin suit la durée réelle, y compris la nuit du retour à l’heure d’hiver', () => {
    const slot = toSlot(scheduleDoc('2026-10-25', '01:30', 120))
    expect(slot.start).toBe('2026-10-24T23:30:00.000Z')
    expect(slot.end).toBe('2026-10-25T01:30:00.000Z')
  })
})

describe('getScheduleBetween : créneaux qui chevauchent un intervalle', () => {
  it('cherche les débuts jusqu’à 10 h avant l’intervalle et garde ceux qui finissent après son début', async () => {
    const before = scheduleDoc('2026-10-21', '04:00', 120) // 4 h → 6 h : finit au début de l'intervalle
    const overlapping = scheduleDoc('2026-10-21', '05:00', 90) // 5 h → 6 h 30
    const inside = scheduleDoc('2026-10-21', '20:00', 30)
    const after = scheduleDoc('2026-10-22', '06:00', 30)
    const find = useSchedule([after, inside, overlapping, before])
    const from = parisDateTime('2026-10-21', '06:00')
    const to = parisDateTime('2026-10-22', '06:00')
    const slots = await getScheduleBetween(from, to)
    expect(slots.map((s) => s.id)).toEqual([overlapping.id, inside.id])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'schedule',
        sort: 'startsAt',
        pagination: false,
        where: { and: [{ startsAt: { greater_than_equal: '2026-10-20T18:00:00.000Z' } }, { startsAt: { less_than: '2026-10-22T04:00:00.000Z' } }] },
      }),
    )
  })

  it('base en erreur (hors panne de connexion) : liste vide plutôt qu’une page cassée', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getPayloadClient).mockResolvedValue({ find: vi.fn(async () => Promise.reject(new Error('requête invalide'))) } as never)
    await expect(getScheduleBetween(new Date('2026-10-21T00:00:00Z'), new Date('2026-10-22T00:00:00Z'))).resolves.toEqual([])
  })
})

describe('getOnAir : programme en cours et suivants', () => {
  const now = parisDateTime('2026-10-21', '20:10')

  it('le créneau en cours et les trois suivants', async () => {
    const past = scheduleDoc('2026-10-21', '19:00', 60)
    const current = scheduleDoc('2026-10-21', '20:00', 30)
    const next = [
      scheduleDoc('2026-10-21', '20:30', 30),
      scheduleDoc('2026-10-21', '21:00', 60),
      scheduleDoc('2026-10-21', '22:00', 60),
      scheduleDoc('2026-10-21', '23:00', 60),
    ]
    const find = useSchedule([past, current, ...next])
    const onAir = await getOnAir(now, 3)
    expect(onAir.current?.id).toBe(current.id)
    expect(onAir.next.map((s) => s.id)).toEqual(next.slice(0, 3).map((s) => s.id))
    // fenêtre de 24 h à partir de maintenant
    const where = find.mock.calls[0][0].where.and
    expect(where[1].startsAt.less_than).toBe(new Date(now.getTime() + 24 * 3600_000).toISOString())
  })

  it('un créneau qui se termine à l’instant n’est plus en cours ; celui qui commence à l’instant l’est', async () => {
    const ending = scheduleDoc('2026-10-21', '19:40', 30) // 19 h 40 → 20 h 10
    const starting = scheduleDoc('2026-10-21', '20:10', 30)
    useSchedule([ending, starting])
    const onAir = await getOnAir(now, 3)
    expect(onAir.current?.id).toBe(starting.id)
    expect(onAir.next).toEqual([])
  })

  it('rien à l’antenne : pas de créneau en cours, les suivants seulement', async () => {
    const later = scheduleDoc('2026-10-21', '21:00', 60)
    useSchedule([later])
    const onAir = await getOnAir(now)
    expect(onAir.current).toBeNull()
    expect(onAir.next.map((s) => s.id)).toEqual([later.id])
  })

  it('grille vide : ni programme en cours ni suivant', async () => {
    useSchedule([])
    await expect(getOnAir(now, 3)).resolves.toEqual({ current: null, next: [] })
  })
})

describe('getProgrammeWeek : créneaux des sept jours de la page Programme TV', () => {
  it('de ce soir 18 h à 0 h 30 au bout de la 7e soirée (heure de Paris), à travers le retour à l’heure d’hiver', async () => {
    const early = scheduleDoc('2026-10-21', '17:30', 60) // déborde sur 18 h : gardé (rogné ensuite par slotsOfEvening)
    const first = scheduleDoc('2026-10-21', '18:00', 30)
    const night = scheduleDoc('2026-10-28', '00:15', 15) // soirée du 27, la 7e
    const outside = scheduleDoc('2026-10-28', '00:30', 30) // 0 h 30 pile : fin de l'antenne
    const nextEvening = scheduleDoc('2026-10-28', '18:00', 30)
    const find = useSchedule([early, first, night, outside, nextEvening])
    const slots = await getProgrammeWeek('2026-10-21')
    expect(slots.map((s) => s.id)).toEqual([early.id, first.id, night.id])
    const where = find.mock.calls[0][0].where.and
    // début de l'intervalle : 18 h le 21 (heure d'été), moins les 10 h de marge de la requête
    expect(where[0].startsAt.greater_than_equal).toBe(new Date(Date.parse('2026-10-21T16:00:00.000Z') - 10 * 3600_000).toISOString())
    // fin : 0 h 30 le 28 (heure d'hiver)
    expect(where[1].startsAt.less_than).toBe('2026-10-27T23:30:00.000Z')
  })

  it('créneau entièrement avant 18 h (ancienne donnée à 10 h) : écarté par la requête', async () => {
    const morning = scheduleDoc('2026-11-10', '10:00', 60)
    const evening = scheduleDoc('2026-11-10', '20:00', 30)
    useSchedule([morning, evening])
    expect((await getProgrammeWeek('2026-11-10')).map((s) => s.id)).toEqual([evening.id])
  })
})
