// Tests unitaires de src/components/programme/model.ts : la chaîne est à l’antenne tous les soirs de 18 h à 0 h 30
// (heure de Paris) ; de 0 h à 0 h 30, c’est encore la soirée de la veille ; hors antenne le reste du temps. Soirée en
// cours (tvDay), soirées proposées et leurs libellés, frise de 18 h à 0 h 30 (390 min, créneaux rognés aux bords,
// changements d’heure), créneaux d’une soirée (frise, liste et JSON-LD), parties de la soirée, « après minuit », durées
// et prochaine diffusion d’une émission. Tous les instants sont passés en paramètre : rien ne dépend de l’heure du test.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGridData,
  capitalize,
  dayLabel,
  dayLong,
  EVENING_PARTS,
  eveningPart,
  findAiring,
  formatDuration,
  GRID_HOURS,
  GRID_MINUTES,
  GRID_START,
  isAfterMidnight,
  minutesBetween,
  PROGRAMME_DAYS,
  programImage,
  programmeDays,
  programmeDayUrl,
  RULER_HOURS,
  shiftDay,
  slotMeta,
  slotsOfEvening,
  tvDay,
} from '@/components/programme/model'
import { BROADCAST_MINUTES, BROADCAST_START } from '@/lib/broadcast'
import { parisDateTime } from '@/lib/format'
import type { Slot } from '@/lib/queries/schedule'

const NBSP = ' '
/** Instant ISO d'un jour et d'une heure de Paris. */
const at = (day: string, time: string) => parisDateTime(day, time).toISOString()

let lastId = 0
/** Créneau sérialisable : début en heure de Paris, durée en minutes. */
function slot(day: string, time: string, minutes: number, extra: Partial<Slot> = {}): Slot {
  const start = parisDateTime(day, time)
  lastId++
  return {
    id: lastId,
    title: `Créneau ${lastId}`,
    start: start.toISOString(),
    end: new Date(start.getTime() + minutes * 60_000).toISOString(),
    durationMinutes: minutes,
    genre: 'info',
    genreLabel: 'Info',
    synopsis: null,
    image: null,
    programSlug: 'le-journal',
    isPremiere: false,
    ...extra,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('shiftDay : calcul calendaire', () => {
  it('avance et recule d’un nombre de jours, à travers mois, années et 29 février', () => {
    expect(shiftDay('2026-10-21', 0)).toBe('2026-10-21')
    expect(shiftDay('2026-10-21', 1)).toBe('2026-10-22')
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftDay('2026-10-25', 7)).toBe('2026-11-01')
    expect(shiftDay('2026-10-21', 365)).toBe('2027-10-21')
  })
})

describe('tvDay : soirée en cours ou à venir (de 0 h à 0 h 30, encore celle de la veille)', () => {
  it('jusqu’à 0 h 30, la soirée de la veille ; à partir de 0 h 30, celle qui commence à 18 h', () => {
    expect(tvDay(new Date(at('2026-10-21', '23:59')))).toBe('2026-10-21')
    expect(tvDay(new Date(at('2026-10-22', '00:00')))).toBe('2026-10-21')
    expect(tvDay(new Date(at('2026-10-22', '00:29')))).toBe('2026-10-21')
    expect(tvDay(new Date(at('2026-10-22', '00:30')))).toBe('2026-10-22')
    expect(tvDay(new Date(at('2026-10-22', '10:00')))).toBe('2026-10-22')
    expect(tvDay(new Date(at('2026-10-22', '17:59')))).toBe('2026-10-22')
    expect(tvDay(new Date(at('2026-10-22', '18:00')))).toBe('2026-10-22')
  })

  it('la nuit du 31 décembre appartient encore à l’année qui se termine', () => {
    expect(tvDay(new Date(at('2027-01-01', '00:15')))).toBe('2026-12-31')
    expect(tvDay(new Date(at('2027-01-01', '00:30')))).toBe('2027-01-01')
  })

  it('nuit du passage à l’heure d’été (29/03, heure d’hiver jusqu’à 2 h) : 0 h 29 → samedi, 0 h 30 → dimanche', () => {
    expect(tvDay(new Date('2026-03-28T23:29:00Z'))).toBe('2026-03-28')
    expect(tvDay(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29')
    expect(tvDay(new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29')
  })

  it('nuit du retour à l’heure d’hiver (25/10, heure d’été jusqu’à 3 h) : 0 h 29 → samedi, 0 h 30 → dimanche', () => {
    expect(tvDay(new Date('2026-10-24T22:29:00Z'))).toBe('2026-10-24')
    expect(tvDay(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25')
    // 2 h 30 sonne deux fois : dimanche les deux fois
    expect(tvDay(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25')
    expect(tvDay(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25')
  })

  it('sans argument : l’heure courante', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(at('2026-10-22', '00:15')))
    expect(tvDay()).toBe('2026-10-21')
  })
})

describe('soirées proposées et libellés', () => {
  it('ce soir et les six soirées suivantes', () => {
    expect(PROGRAMME_DAYS).toBe(7)
    expect(programmeDays('2026-10-21')).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
    expect(programmeDays('2026-12-29')).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'])
    expect(programmeDays('2028-02-27').slice(1, 4)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })

  it('« Ce soir », « Demain soir », « Hier soir », sinon le jour abrégé et son numéro', () => {
    const today = '2026-10-21'
    expect(dayLabel('2026-10-21', today)).toBe('Ce soir')
    expect(dayLabel('2026-10-22', today)).toBe('Demain soir')
    expect(dayLabel('2026-10-20', today)).toBe('Hier soir')
    expect(dayLabel('2026-10-24', today)).toBe('Sam. 24')
    expect(dayLabel('2026-10-19', today)).toBe('Lun. 19')
    expect(dayLabel('2026-10-25', today)).toBe('Dim. 25')
    expect(dayLabel('2027-01-01', '2026-12-30')).toBe('Ven. 1')
    expect(dayLabel('2026-03-29', '2026-03-27')).toBe('Dim. 29')
  })

  it('à 0 h 15, « Ce soir » est encore la soirée de la veille ; à 0 h 30, la soirée qui vient', () => {
    expect(dayLabel('2026-10-21', tvDay(new Date(at('2026-10-22', '00:15'))))).toBe('Ce soir')
    expect(dayLabel('2026-10-21', tvDay(new Date(at('2026-10-22', '00:30'))))).toBe('Hier soir')
    expect(dayLabel('2026-10-22', tvDay(new Date(at('2026-10-22', '00:30'))))).toBe('Ce soir')
  })

  it('« samedi 24 octobre », y compris les jours de changement d’heure', () => {
    expect(dayLong('2026-10-24')).toBe('samedi 24 octobre')
    expect(dayLong('2026-10-25')).toBe('dimanche 25 octobre')
    expect(dayLong('2026-03-29')).toBe('dimanche 29 mars')
    expect(dayLong('2026-12-31')).toBe('jeudi 31 décembre')
  })

  it('majuscule initiale', () => {
    expect(capitalize('samedi 24 octobre')).toBe('Samedi 24 octobre')
    expect(capitalize('été')).toBe('Été')
    expect(capitalize('')).toBe('')
  })

  it('adresse d’une soirée : canonique pour ce soir, ?jour= sinon', () => {
    expect(programmeDayUrl('2026-10-21', '2026-10-21')).toBe('/programme-tv')
    expect(programmeDayUrl('2026-10-22', '2026-10-21')).toBe('/programme-tv?jour=2026-10-22')
  })
})

describe('buildGridData : frises des soirées proposées (18 h → 0 h 30 du lendemain)', () => {
  const today = '2026-10-21'

  it('une frise de 390 minutes par soirée, commençant à 18 h (heure de Paris) ; 7 graduations, 6,5 h de large', () => {
    expect(GRID_START).toBe(BROADCAST_START)
    expect(GRID_START).toBe('18:00')
    expect(GRID_MINUTES).toBe(BROADCAST_MINUTES)
    expect(GRID_MINUTES).toBe(390)
    expect(GRID_HOURS).toBe(6.5)
    // 18:00, 19:00, 20:00, 21:00, 22:00, 23:00, 00:00 ; la dernière demi-heure finit au bord droit
    expect(RULER_HOURS).toBe(7)
    const data = buildGridData([], today, 0)
    expect(data.today).toBe(today)
    expect(data.days.map((d) => d.key)).toEqual(programmeDays(today))
    expect(data.days.map((d) => d.start)).toEqual(programmeDays(today).map((d) => at(d, '18:00')))
    expect(data.days.every((d) => d.slots.length === 0)).toBe(true)
    expect(data.programs).toEqual([])
  })

  it('créneau de la soirée : position en minutes depuis 18 h', () => {
    const s = slot(today, '20:30', 45)
    const [day] = buildGridData([s], today, 0).days
    expect(day.slots).toEqual([{ id: s.id, title: s.title, start: s.start, end: s.end, prog: 0, from: 150, to: 195 }])
  })

  it('créneau 17:30 – 18:30 (ancienne donnée) : rogné à 18 h, bord gauche découpé', () => {
    const s = slot(today, '17:30', 60)
    const [day] = buildGridData([s], today, 0).days
    expect(day.slots[0]).toMatchObject({ id: s.id, from: 0, to: 30, cutL: true, start: at(today, '18:00'), end: at(today, '18:30') })
    expect(day.slots[0].cutR).toBeUndefined()
  })

  it('de 0 h à 0 h 30 : au bout de la frise de la veille ; un créneau qui finit après 0 h 30 est rogné, bord droit découpé', () => {
    const night = slot('2026-10-22', '00:00', 30)
    const late = slot(today, '23:30', 120) // jusqu'à 1 h 30
    const overflow = slot('2026-10-22', '00:15', 30) // jusqu'à 0 h 45
    const data = buildGridData([night, late, overflow], today, 0)
    expect(data.days[0].slots.find((x) => x.id === night.id)).toMatchObject({ from: 360, to: 390 })
    expect(data.days[0].slots.find((x) => x.id === night.id)?.cutR).toBeUndefined()
    expect(data.days[0].slots.find((x) => x.id === late.id)).toMatchObject({ from: 330, to: 390, cutR: true, end: at('2026-10-22', '00:30') })
    expect(data.days[0].slots.find((x) => x.id === overflow.id)).toMatchObject({ from: 375, to: 390, cutR: true })
    expect(data.days[1].slots).toEqual([])
  })

  it('créneau 00:00 – 01:00 : rogné à 0 h 30 sur la frise de la veille', () => {
    const s = slot('2026-10-22', '00:00', 60)
    const data = buildGridData([s], today, 0)
    expect(data.days[0].slots[0]).toMatchObject({ id: s.id, from: 360, to: 390, cutR: true, start: s.start, end: at('2026-10-22', '00:30') })
    expect(data.days[1].slots).toEqual([])
  })

  it('un créneau entièrement hors antenne (10 h, 1 h, 17 h, 0 h 30 pile, 17:30 – 18:00) n’apparaît sur aucune frise', () => {
    const slots = [
      slot('2026-10-22', '10:00', 60),
      slot('2026-10-22', '01:00', 30),
      slot('2026-10-22', '17:00', 30),
      slot('2026-10-22', '00:30', 30),
      slot('2026-10-22', '17:30', 30),
    ]
    const data = buildGridData(slots, today, 0)
    expect(data.days.flatMap((d) => d.slots)).toEqual([])
    expect(data.programs).toEqual([])
  })

  it('créneaux sans durée, à l’envers, aux dates illisibles ou hors des sept soirées : ignorés', () => {
    const empty = slot(today, '19:00', 0)
    const reversed = { ...slot(today, '20:00', 30), end: at(today, '19:30') }
    const broken = { ...slot(today, '21:00', 30), start: 'pas une date' }
    const before = slot('2026-10-20', '20:00', 60)
    const after = slot('2026-10-28', '20:00', 60)
    const data = buildGridData([empty, reversed, broken, before, after], today, 0)
    expect(data.days.flatMap((d) => d.slots)).toEqual([])
    expect(data.programs).toEqual([])
  })

  it('une fiche d’émission par émission (par adresse), une par créneau sans émission', () => {
    const a = slot(today, '18:00', 30, { programSlug: 'le-journal', genre: 'info', genreLabel: 'Info', synopsis: 'Résumé' })
    const b = slot(today, '20:00', 30, { programSlug: 'le-journal' })
    const c = slot(today, '21:00', 60, { programSlug: 'la-meteo', genre: 'meteo', genreLabel: 'Météo', image: '/api/media/file/meteo.webp', isPremiere: true })
    const d = slot(today, '22:00', 30, { programSlug: null })
    const e = slot(today, '22:30', 30, { programSlug: null })
    const data = buildGridData([a, b, c, d, e], today, 0)
    expect(data.programs).toHaveLength(4)
    const progOf = (id: number) => data.programs[data.days[0].slots.find((x) => x.id === id)!.prog]
    expect(progOf(a.id)).toEqual({ slug: 'le-journal', genre: 'info', genreLabel: 'Info', synopsis: 'Résumé', image: null, isPremiere: false })
    expect(progOf(b.id)).toBe(progOf(a.id))
    expect(progOf(c.id)).toEqual({
      slug: 'la-meteo',
      genre: 'meteo',
      genreLabel: 'Météo',
      synopsis: null,
      image: '/api/media/file/meteo.webp',
      isPremiere: true,
    })
    expect(progOf(d.id)).not.toBe(progOf(e.id))
  })

  it('à l’antenne : vignettes chargées d’emblée autour de maintenant (de une heure avant à trois heures après)', () => {
    const now = Date.parse(at(today, '21:00'))
    const ended = slot(today, '18:00', 120) // finit à 20 h : exactement une heure avant
    const recent = slot(today, '18:30', 91) // finit à 20 h 01
    const current = slot(today, '20:30', 60)
    const soon = slot(today, '23:59', 1)
    const later = slot('2026-10-22', '00:00', 30) // commence exactement trois heures après, toujours dans la soirée
    const [day] = buildGridData([ended, recent, current, soon, later], today, now).days
    const eager = Object.fromEntries(day.slots.map((x) => [x.id, x.eager === true]))
    expect(eager).toEqual({ [ended.id]: false, [recent.id]: true, [current.id]: true, [soon.id]: true, [later.id]: false })
  })

  it('hors antenne : les vignettes des trois premières heures de la soirée à venir (la frise s’ouvre à 18 h)', () => {
    const first = slot(today, '18:00', 30)
    const prime = slot(today, '20:59', 30)
    const late = slot(today, '21:00', 30)
    const tomorrow = slot('2026-10-22', '18:00', 30)
    const slots = [first, prime, late, tomorrow]
    const eagerAt = (time: [string, string]) =>
      Object.fromEntries(buildGridData(slots, today, Date.parse(at(...time))).days.flatMap((d) => d.slots).map((x) => [x.id, x.eager === true]))
    // 10 h et 17 h 59 : la soirée de ce soir
    for (const time of [[today, '10:00'], [today, '00:30'], [today, '17:59']] as [string, string][]) {
      expect(eagerAt(time), time[1]).toEqual({ [first.id]: true, [prime.id]: true, [late.id]: false, [tomorrow.id]: false })
    }
    // 0 h 30 pile, fin de l'antenne : c'est déjà la soirée du lendemain qui compte
    expect(eagerAt(['2026-10-22', '00:30'])).toEqual({ [first.id]: false, [prime.id]: false, [late.id]: false, [tomorrow.id]: true })
    // 18 h pile : à l'antenne, autour de maintenant
    expect(eagerAt([today, '18:00'])).toEqual({ [first.id]: true, [prime.id]: true, [late.id]: false, [tomorrow.id]: false })
  })

  it('retour à l’heure d’hiver (nuit du 24 au 25/10) : frises de 18 h, 390 min réelles, 0 h – 1 h (heure d’été) rogné à 0 h 30', () => {
    const data = buildGridData([], '2026-10-24', 0)
    expect(data.days[0].start).toBe('2026-10-24T16:00:00.000Z')
    expect(data.days[1].start).toBe('2026-10-25T17:00:00.000Z')
    const night = slot('2026-10-25', '00:00', 60) // 0 h → 1 h, encore à l'heure d'été
    const last = slot('2026-10-25', '00:00', 30)
    const sunday = slot('2026-10-25', '18:00', 60)
    const grid = buildGridData([night, last, sunday], '2026-10-24', 0)
    expect(grid.days[0].slots.find((x) => x.id === night.id)).toMatchObject({ from: 360, to: 390, cutR: true })
    expect(grid.days[0].slots.find((x) => x.id === last.id)).toMatchObject({ from: 360, to: 390 })
    expect(grid.days[0].slots.find((x) => x.id === last.id)?.cutR).toBeUndefined()
    expect(grid.days[1].slots).toEqual([expect.objectContaining({ id: sunday.id, from: 0, to: 60 })])
  })

  it('passage à l’heure d’été (nuit du 28 au 29/03) : frises de 18 h (heure d’hiver puis heure d’été), 0 h 15 sur la veille', () => {
    const data = buildGridData([], '2026-03-28', 0)
    expect(data.days[0].start).toBe('2026-03-28T17:00:00.000Z')
    expect(data.days[1].start).toBe('2026-03-29T16:00:00.000Z')
    const evening = slot('2026-03-28', '20:00', 60)
    const night = slot('2026-03-29', '00:15', 15) // avant le saut de 2 h : heure d'hiver
    const sunday = slot('2026-03-29', '20:00', 60)
    const grid = buildGridData([evening, night, sunday], '2026-03-28', 0)
    expect(grid.days[0].slots.map((x) => [x.id, x.from, x.to])).toEqual([
      [evening.id, 120, 180],
      [night.id, 375, 390],
    ])
    expect(grid.days[1].slots[0]).toMatchObject({ id: sunday.id, from: 120, to: 180 })
  })
})

describe('slotsOfEvening : créneaux d’une soirée (frise, vue liste et JSON-LD)', () => {
  it('de 18 h à 0 h 30 le lendemain, après minuit compris ; 0 h 30 pile et 10 h exclus', () => {
    const first = slot('2026-10-21', '18:00', 30)
    const late = slot('2026-10-21', '23:45', 30)
    const night = slot('2026-10-22', '00:15', 15)
    const atEnd = slot('2026-10-22', '00:30', 30)
    const morning = slot('2026-10-22', '10:00', 60)
    const next = slot('2026-10-22', '18:00', 30)
    const slots = [first, late, night, atEnd, morning, next]
    expect(slotsOfEvening(slots, '2026-10-21').map((s) => s.id)).toEqual([first.id, late.id, night.id])
    expect(slotsOfEvening(slots, '2026-10-22').map((s) => s.id)).toEqual([next.id])
    expect(slotsOfEvening(slots, '2026-10-20')).toEqual([])
    // créneau entièrement dans l'antenne : rendu tel quel
    expect(slotsOfEvening(slots, '2026-10-21')[0]).toBe(first)
  })

  it('créneau qui déborde (17:30 – 18:30, 00:00 – 01:00) : rogné aux bornes de la soirée, durée comprise', () => {
    const early = slot('2026-10-21', '17:30', 60)
    const night = slot('2026-10-22', '00:00', 60)
    const [a, b] = slotsOfEvening([early, night], '2026-10-21')
    expect(a).toMatchObject({ id: early.id, start: at('2026-10-21', '18:00'), end: at('2026-10-21', '18:30'), durationMinutes: 30, cutL: true })
    expect(a.cutR).toBeUndefined()
    expect(b).toMatchObject({ id: night.id, start: night.start, end: at('2026-10-22', '00:30'), durationMinutes: 30, cutR: true })
    expect(b.cutL).toBeUndefined()
  })

  it('mêmes créneaux que la frise : un créneau à 10 h n’est ni sur la frise, ni dans la liste (donc ni dans le JSON-LD)', () => {
    const today = '2026-10-21'
    const slots = [
      slot(today, '10:00', 60),
      slot(today, '17:30', 60),
      slot(today, '19:00', 30),
      slot('2026-10-22', '00:00', 60),
      slot('2026-10-22', '06:00', 30),
      slot('2026-10-23', '12:00', 30),
      slot('2026-10-23', '20:00', 30),
    ]
    const data = buildGridData(slots, today, 0)
    for (const d of data.days) {
      const list = slotsOfEvening(slots, d.key)
      expect(d.slots.map((s) => [s.id, s.start, s.end]), d.key).toEqual(list.map((s) => [s.id, s.start, s.end]))
    }
    expect(data.days.flatMap((d) => d.slots)).toHaveLength(4)
  })

  it('nuit du retour à l’heure d’hiver : 0 h 15 (heure d’été) le 25/10 → soirée du samedi ; 18 h le 25 → dimanche', () => {
    const night = slot('2026-10-25', '00:15', 15)
    const sunday = slot('2026-10-25', '18:00', 30)
    expect(night.start).toBe('2026-10-24T22:15:00.000Z')
    expect(slotsOfEvening([night, sunday], '2026-10-24').map((s) => s.id)).toEqual([night.id])
    expect(slotsOfEvening([night, sunday], '2026-10-25').map((s) => s.id)).toEqual([sunday.id])
  })
})

describe('eveningPart et isAfterMidnight : parties de la soirée, mention « après minuit »', () => {
  it('« Début de soirée » de 18 h à 21 h, « Soirée » ensuite, après minuit compris (hiver comme été)', () => {
    const cases: [string, string, ReturnType<typeof eveningPart>][] = [
      ['', '18:00', 'debut'],
      ['', '20:59', 'debut'],
      ['', '21:00', 'soiree'],
      ['', '23:59', 'soiree'],
      ['+1', '00:00', 'soiree'],
      ['+1', '00:29', 'soiree'],
    ]
    for (const day of ['2026-12-21', '2026-06-21']) {
      for (const [shift, time, part] of cases) {
        expect(eveningPart(at(shift ? shiftDay(day, 1) : day, time), day), `${day} ${shift}${time}`).toBe(part)
      }
    }
    // créneau rogné à 18 h (commencé à 17 h 30) : début de soirée
    const [early] = slotsOfEvening([slot('2026-12-21', '17:30', 60)], '2026-12-21')
    expect(eveningPart(early.start, '2026-12-21')).toBe('debut')
  })

  it('libellés des parties, dans l’ordre de la soirée', () => {
    expect(EVENING_PARTS.map((p) => p.value)).toEqual(['debut', 'soiree'])
    expect(EVENING_PARTS.map((p) => p.label)).toEqual(['Début de soirée', 'Soirée'])
  })

  it('après minuit : le créneau garde son heure mais appartient à la soirée de la veille', () => {
    expect(isAfterMidnight(at('2026-10-22', '00:15'), '2026-10-21')).toBe(true)
    expect(isAfterMidnight(at('2026-10-22', '00:00'), '2026-10-21')).toBe(true)
    expect(isAfterMidnight(at('2026-10-21', '23:59'), '2026-10-21')).toBe(false)
    expect(isAfterMidnight(at('2026-10-21', '18:00'), '2026-10-21')).toBe(false)
    expect(isAfterMidnight(at('2027-01-01', '00:10'), '2026-12-31')).toBe(true)
    // 0 h 15 de la nuit du 24 au 25/10, encore à l'heure d'été
    expect(isAfterMidnight('2026-10-24T22:15:00.000Z', '2026-10-24')).toBe(true)
    expect(isAfterMidnight('2026-10-24T21:45:00.000Z', '2026-10-24')).toBe(false)
  })
})

describe('durées et ligne d’infos d’un créneau', () => {
  it('minutes entre deux dates ISO (durée réelle, y compris la nuit du changement d’heure)', () => {
    expect(minutesBetween('2026-10-21T18:00:00Z', '2026-10-21T19:15:00Z')).toBe(75)
    // 1 h 30 → 2 h 30 de la deuxième fois : deux heures réelles
    expect(minutesBetween('2026-10-24T23:30:00Z', '2026-10-25T01:30:00Z')).toBe(120)
    expect(minutesBetween('2026-10-21T18:00:30Z', '2026-10-21T18:01:00Z')).toBe(1)
  })

  it('« 45 min », « 1 h », « 1 h 05 », « 2 h 15 » avec des espaces insécables', () => {
    expect(formatDuration(1)).toBe(`1${NBSP}min`)
    expect(formatDuration(45)).toBe(`45${NBSP}min`)
    expect(formatDuration(59)).toBe(`59${NBSP}min`)
    expect(formatDuration(60)).toBe(`1${NBSP}h`)
    expect(formatDuration(65)).toBe(`1${NBSP}h${NBSP}05`)
    expect(formatDuration(135)).toBe(`2${NBSP}h${NBSP}15`)
    expect(formatDuration(390)).toBe(`6${NBSP}h${NBSP}30`)
  })

  it('« Documentaire · Inédit · 75 min », sans les éléments absents', () => {
    const program = { slug: 'x', genre: 'documentaire', genreLabel: 'Documentaire', synopsis: null, image: null, isPremiere: true }
    expect(slotMeta(program, 75)).toBe(`Documentaire · Inédit · 75${NBSP}min`)
    expect(slotMeta({ ...program, isPremiere: false }, 30)).toBe(`Documentaire · 30${NBSP}min`)
    expect(slotMeta({ ...program, genreLabel: '', isPremiere: false }, 90)).toBe(`90${NBSP}min`)
    expect(slotMeta(undefined, 30)).toBe(`30${NBSP}min`)
  })

  it('image de l’émission, sinon visuel de la maquette assorti au genre', () => {
    expect(programImage({ image: '/api/media/file/x.webp', genre: 'sport' })).toBe('/api/media/file/x.webp')
    expect(programImage({ image: null, genre: 'sport' })).toBe('/visuels/t-orage-a.webp')
    expect(programImage({ image: null, genre: 'meteo' })).toBe('/visuels/t-nuages-b.webp')
    expect(programImage({ image: '', genre: 'info' })).toBe('/visuels/t-crepuscule-c.webp')
    expect(programImage({ image: null, genre: 'inconnu' })).toBe('/visuels/t-nuit-a.webp')
    expect(programImage({ image: null, genre: null })).toBe('/visuels/t-nuit-a.webp')
    expect(programImage(undefined)).toBe('/visuels/t-nuit-a.webp')
  })
})

describe('findAiring : prochaine diffusion d’une émission (fiche par ancre /programme-tv#slug)', () => {
  const today = '2026-10-21'
  const first = slot(today, '18:00', 30, { programSlug: 'le-journal' })
  const last = slot(today, '23:00', 30, { programSlug: 'le-journal' })
  const tomorrow = slot('2026-10-22', '18:00', 30, { programSlug: 'le-journal' })
  const other = slot(today, '21:00', 60, { programSlug: 'la-meteo' })
  const night = slot('2026-10-22', '00:00', 30, { programSlug: 'la-nuit' })
  const data = buildGridData([first, last, other, night, tomorrow], today, 0)

  it('la diffusion en cours ou la prochaine, y compris hors antenne', () => {
    expect(findAiring(data, 'le-journal', Date.parse(at(today, '18:10')))).toMatchObject({ day: today, slot: { id: first.id } })
    expect(findAiring(data, 'le-journal', Date.parse(at(today, '18:30')))).toMatchObject({ day: today, slot: { id: last.id } })
    expect(findAiring(data, 'le-journal', Date.parse(at(today, '23:40')))).toMatchObject({ day: '2026-10-22', slot: { id: tomorrow.id } })
    // 10 h, hors antenne : la prochaine, à 18 h
    expect(findAiring(data, 'le-journal', Date.parse(at('2026-10-22', '10:00')))).toMatchObject({ day: '2026-10-22', slot: { id: tomorrow.id } })
  })

  it('après minuit : trouvée dans la soirée de la veille', () => {
    expect(findAiring(data, 'la-nuit', Date.parse(at('2026-10-22', '00:10')))).toMatchObject({ day: today, slot: { id: night.id, from: 360 } })
  })

  it('toutes passées : la première de la semaine ; émission absente : rien', () => {
    expect(findAiring(data, 'le-journal', Date.parse(at('2026-10-23', '12:00')))).toMatchObject({ day: today, slot: { id: first.id } })
    expect(findAiring(data, 'emission-inconnue', 0)).toBeNull()
  })

  it('un créneau qui déborde après 0 h 30 est trouvé, rogné ; terminé pour le public à 0 h 30', () => {
    const long = slot(today, '23:30', 120, { programSlug: 'la-longue-nuit' })
    const grid = buildGridData([long], today, 0)
    expect(findAiring(grid, 'la-longue-nuit', Date.parse(at(today, '20:00')))).toMatchObject({ day: today, slot: { id: long.id, cutR: true } })
    // à 0 h 45, plus rien à l'antenne : la seule diffusion est passée (la première de la semaine est rendue)
    expect(findAiring(grid, 'la-longue-nuit', Date.parse(at('2026-10-22', '00:45')))?.slot.end).toBe(at('2026-10-22', '00:30'))
  })
})
