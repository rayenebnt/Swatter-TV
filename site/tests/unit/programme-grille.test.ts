// Tests unitaires de src/components/programme/model.ts : journée TV (la nuit jusqu’à 2 h appartient à la veille),
// jours proposés et leurs libellés, frise de 6 h à 2 h (créneaux découpés aux bords, changements d’heure),
// vue liste, moments de la journée, durées et prochaine diffusion d’une émission.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGridData,
  capitalize,
  DAY_PARTS,
  dayLabel,
  dayLong,
  dayPart,
  findAiring,
  formatDuration,
  GRID_HOURS,
  GRID_MINUTES,
  GRID_START,
  minutesBetween,
  PROGRAMME_DAYS,
  programImage,
  programmeDays,
  programmeDayUrl,
  shiftDay,
  slotMeta,
  slotsOfTvDay,
  tvDay,
} from '@/components/programme/model'
import { parisDateTime } from '@/lib/format'
import type { Slot } from '@/lib/queries/schedule'

const NBSP = '\u00a0'
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

describe('tvDay : journée TV en cours (la nuit jusqu’à 2 h appartient à la veille)', () => {
  it('entre minuit et 2 h, c’est encore la journée de la veille', () => {
    expect(tvDay(new Date(at('2026-10-21', '23:59')))).toBe('2026-10-21')
    expect(tvDay(new Date(at('2026-10-22', '00:00')))).toBe('2026-10-21')
    expect(tvDay(new Date(at('2026-10-22', '01:59')))).toBe('2026-10-21')
    expect(tvDay(new Date(at('2026-10-22', '02:00')))).toBe('2026-10-22')
    expect(tvDay(new Date(at('2026-10-22', '06:00')))).toBe('2026-10-22')
  })

  it('en hiver comme en été', () => {
    expect(tvDay(new Date(at('2026-01-15', '01:30')))).toBe('2026-01-14')
    expect(tvDay(new Date(at('2026-07-15', '01:30')))).toBe('2026-07-14')
    expect(tvDay(new Date(at('2026-07-15', '02:30')))).toBe('2026-07-15')
  })

  it('la nuit du 31 décembre appartient encore à l’année qui se termine', () => {
    expect(tvDay(new Date(at('2027-01-01', '00:30')))).toBe('2026-12-31')
    expect(tvDay(new Date(at('2027-01-01', '02:00')))).toBe('2027-01-01')
  })

  it('nuit du passage à l’heure d’été : 1 h 59 → samedi, 3 h → dimanche', () => {
    expect(tvDay(new Date('2026-03-29T00:59:00Z'))).toBe('2026-03-28')
    expect(tvDay(new Date('2026-03-29T01:00:00Z'))).toBe('2026-03-29')
  })

  it('nuit du retour à l’heure d’hiver : 1 h 59 → samedi, 2 h (les deux fois) → dimanche', () => {
    expect(tvDay(new Date('2026-10-24T23:59:00Z'))).toBe('2026-10-24')
    expect(tvDay(new Date('2026-10-25T00:00:00Z'))).toBe('2026-10-25')
    expect(tvDay(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25')
    expect(tvDay(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25')
  })

  it('sans argument : l’heure courante', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(at('2026-10-22', '01:00')))
    expect(tvDay()).toBe('2026-10-21')
  })
})

describe('jours proposés et libellés', () => {
  it('aujourd’hui et les six jours suivants', () => {
    expect(PROGRAMME_DAYS).toBe(7)
    expect(programmeDays('2026-10-21')).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
    expect(programmeDays('2026-12-29')).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'])
    expect(programmeDays('2028-02-27').slice(1, 4)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })

  it('« Aujourd’hui », « Demain », « Hier », sinon le jour abrégé et son numéro', () => {
    const today = '2026-10-21'
    expect(dayLabel('2026-10-21', today)).toBe('Aujourd’hui')
    expect(dayLabel('2026-10-22', today)).toBe('Demain')
    expect(dayLabel('2026-10-20', today)).toBe('Hier')
    expect(dayLabel('2026-10-24', today)).toBe('Sam. 24')
    expect(dayLabel('2026-10-19', today)).toBe('Lun. 19')
    expect(dayLabel('2026-10-25', today)).toBe('Dim. 25')
    expect(dayLabel('2027-01-01', '2026-12-30')).toBe('Ven. 1')
    expect(dayLabel('2026-03-29', '2026-03-27')).toBe('Dim. 29')
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

  it('adresse d’un jour : canonique pour aujourd’hui, ?jour= sinon', () => {
    expect(programmeDayUrl('2026-10-21', '2026-10-21')).toBe('/programme-tv')
    expect(programmeDayUrl('2026-10-22', '2026-10-21')).toBe('/programme-tv?jour=2026-10-22')
  })
})

describe('buildGridData : frises des jours proposés (6 h → 2 h du lendemain)', () => {
  const today = '2026-10-21'

  it('une frise de 20 heures par jour, commençant à 6 h (heure de Paris)', () => {
    expect(GRID_START).toBe('06:00')
    expect(GRID_HOURS).toBe(20)
    expect(GRID_MINUTES).toBe(1200)
    const data = buildGridData([], today, 0)
    expect(data.today).toBe(today)
    expect(data.days.map((d) => d.key)).toEqual(programmeDays(today))
    expect(data.days.map((d) => d.start)).toEqual(programmeDays(today).map((d) => at(d, '06:00')))
    expect(data.days.every((d) => d.slots.length === 0)).toBe(true)
    expect(data.programs).toEqual([])
  })

  it('créneau dans la journée : position en minutes depuis 6 h', () => {
    const s = slot(today, '20:30', 45)
    const [day] = buildGridData([s], today, 0).days
    expect(day.slots).toEqual([{ id: s.id, title: s.title, start: s.start, end: s.end, prog: 0, from: 870, to: 915 }])
  })

  it('créneau commencé avant 6 h : bord gauche découpé', () => {
    const s = slot(today, '05:30', 60)
    const [day] = buildGridData([s], today, 0).days
    expect(day.slots[0]).toMatchObject({ id: s.id, from: 0, to: 30, cutL: true })
    expect(day.slots[0].cutR).toBeUndefined()
  })

  it('la nuit jusqu’à 2 h est au bout de la frise de la veille ; un créneau qui finit après 2 h est découpé', () => {
    const night = slot('2026-10-22', '01:00', 30)
    const late = slot(today, '23:30', 180)
    const data = buildGridData([night, late], today, 0)
    expect(data.days[0].slots.find((x) => x.id === night.id)).toMatchObject({ from: 1140, to: 1170 })
    expect(data.days[0].slots.find((x) => x.id === late.id)).toMatchObject({ from: 1050, to: 1200, cutR: true })
    expect(data.days[1].slots.some((x) => x.id === night.id || x.id === late.id)).toBe(false)
  })

  it('un créneau de la nuit après 2 h et avant 6 h n’apparaît sur aucune frise', () => {
    const s = slot('2026-10-22', '02:30', 180)
    expect(buildGridData([s], today, 0).days.flatMap((d) => d.slots)).toEqual([])
  })

  it('un créneau à cheval sur deux frises apparaît sur les deux, découpé de chaque côté', () => {
    const s = slot(today, '23:00', 9 * 60)
    const data = buildGridData([s], today, 0)
    expect(data.days[0].slots[0]).toMatchObject({ id: s.id, from: 1020, to: 1200, cutR: true })
    expect(data.days[1].slots[0]).toMatchObject({ id: s.id, from: 0, to: 120, cutL: true })
  })

  it('créneaux sans durée, à l’envers, aux dates illisibles ou hors des sept jours : ignorés', () => {
    const empty = slot(today, '10:00', 0)
    const reversed = { ...slot(today, '11:00', 30), end: at(today, '10:30') }
    const broken = { ...slot(today, '12:00', 30), start: 'pas une date' }
    const before = slot('2026-10-20', '20:00', 60)
    const after = slot('2026-10-28', '20:00', 60)
    const data = buildGridData([empty, reversed, broken, before, after], today, 0)
    expect(data.days.flatMap((d) => d.slots)).toEqual([])
    expect(data.programs).toEqual([])
  })

  it('une fiche d’émission par émission (par adresse), une par créneau sans émission', () => {
    const a = slot(today, '07:00', 30, { programSlug: 'le-journal', genre: 'info', genreLabel: 'Info', synopsis: 'Résumé' })
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

  it('vignettes chargées d’emblée autour de maintenant (de une heure avant à trois heures après)', () => {
    const now = Date.parse(at(today, '12:00'))
    const ended = slot(today, '09:00', 120) // finit à 11 h : exactement une heure avant
    const recent = slot(today, '09:30', 91) // finit à 11 h 01
    const current = slot(today, '11:30', 60)
    const soon = slot(today, '14:59', 30)
    const later = slot(today, '15:00', 30) // commence exactement trois heures après
    const [day] = buildGridData([ended, recent, current, soon, later], today, now).days
    const eager = Object.fromEntries(day.slots.map((x) => [x.id, x.eager === true]))
    expect(eager).toEqual({ [ended.id]: false, [recent.id]: true, [current.id]: true, [soon.id]: true, [later.id]: false })
  })

  it('jours du retour à l’heure d’hiver : chaque frise commence à 6 h de Paris et dure 20 heures', () => {
    const data = buildGridData([], '2026-10-24', 0)
    expect(data.days[0].start).toBe('2026-10-24T04:00:00.000Z')
    expect(data.days[1].start).toBe('2026-10-25T05:00:00.000Z')
    // samedi : 1 h 30 → 2 h 30 (heure d'été) est découpé à 2 h, fin de la frise
    const night = slot('2026-10-25', '01:30', 60)
    const sunday = slot('2026-10-25', '06:00', 60)
    const grid = buildGridData([night, sunday], '2026-10-24', 0)
    expect(grid.days[0].slots[0]).toMatchObject({ id: night.id, from: 1170, to: 1200, cutR: true })
    expect(grid.days[1].slots[0]).toMatchObject({ id: sunday.id, from: 0, to: 60 })
  })

  it('jours du passage à l’heure d’été : frises de 6 h (heure d’hiver puis heure d’été)', () => {
    const data = buildGridData([], '2026-03-28', 0)
    expect(data.days[0].start).toBe('2026-03-28T05:00:00.000Z')
    expect(data.days[1].start).toBe('2026-03-29T04:00:00.000Z')
    const evening = slot('2026-03-28', '20:00', 60)
    const sunday = slot('2026-03-29', '20:00', 60)
    const grid = buildGridData([evening, sunday], '2026-03-28', 0)
    expect(grid.days[0].slots[0]).toMatchObject({ from: 840, to: 900 })
    expect(grid.days[1].slots[0]).toMatchObject({ from: 840, to: 900 })
  })
})

describe('slotsOfTvDay : vue liste d’une journée (de 6 h à 6 h, d’après l’heure de début)', () => {
  it('de 6 h ce jour-là à 6 h le lendemain, nuit comprise', () => {
    const early = slot('2026-10-21', '05:59', 30)
    const first = slot('2026-10-21', '06:00', 30)
    const night = slot('2026-10-22', '01:00', 60)
    const lastOne = slot('2026-10-22', '05:59', 30)
    const next = slot('2026-10-22', '06:00', 30)
    const slots = [early, first, night, lastOne, next]
    expect(slotsOfTvDay(slots, '2026-10-21').map((s) => s.id)).toEqual([first.id, night.id, lastOne.id])
    expect(slotsOfTvDay(slots, '2026-10-20').map((s) => s.id)).toEqual([early.id])
    expect(slotsOfTvDay(slots, '2026-10-22').map((s) => s.id)).toEqual([next.id])
  })

  it('le samedi du retour à l’heure d’hiver garde toute la nuit, 2 h 30 des deux passages comprises', () => {
    const first = { ...slot('2026-10-24', '20:00', 30), start: '2026-10-25T00:30:00.000Z' }
    const second = { ...slot('2026-10-24', '20:00', 30), start: '2026-10-25T01:30:00.000Z' }
    const sunday = slot('2026-10-25', '06:00', 30)
    expect(slotsOfTvDay([first, second, sunday], '2026-10-24').map((s) => s.id)).toEqual([first.id, second.id])
    expect(slotsOfTvDay([first, second, sunday], '2026-10-25').map((s) => s.id)).toEqual([sunday.id])
  })
})

describe('dayPart : moment de la journée d’après l’heure de Paris', () => {
  it('matinée de 6 h à midi, après-midi de midi à 18 h, soirée jusqu’à minuit, nuit ensuite', () => {
    const cases: [string, ReturnType<typeof dayPart>][] = [
      ['05:59', 'nuit'],
      ['06:00', 'matin'],
      ['11:59', 'matin'],
      ['12:00', 'apres-midi'],
      ['17:59', 'apres-midi'],
      ['18:00', 'soir'],
      ['23:59', 'soir'],
      ['00:00', 'nuit'],
      ['01:30', 'nuit'],
    ]
    for (const [time, part] of cases) {
      expect(dayPart(at('2026-12-21', time)), `hiver ${time}`).toBe(part)
      expect(dayPart(at('2026-06-21', time)), `été ${time}`).toBe(part)
    }
  })

  it('libellés des moments, dans l’ordre de la journée', () => {
    expect(DAY_PARTS.map((p) => p.value)).toEqual(['matin', 'apres-midi', 'soir', 'nuit'])
    expect(DAY_PARTS.map((p) => p.label)).toEqual(['Matinée', 'Après-midi', 'Soirée', 'Nuit'])
  })
})

describe('durées et ligne d’infos d’un créneau', () => {
  it('minutes entre deux dates ISO (durée réelle, y compris la nuit du changement d’heure)', () => {
    expect(minutesBetween('2026-10-21T10:00:00Z', '2026-10-21T11:15:00Z')).toBe(75)
    // 1 h 30 → 2 h 30 de la deuxième fois : deux heures réelles
    expect(minutesBetween('2026-10-24T23:30:00Z', '2026-10-25T01:30:00Z')).toBe(120)
    expect(minutesBetween('2026-10-21T10:00:30Z', '2026-10-21T10:01:00Z')).toBe(1)
  })

  it('« 45 min », « 1 h », « 1 h 05 », « 2 h 15 » avec des espaces insécables', () => {
    expect(formatDuration(1)).toBe(`1${NBSP}min`)
    expect(formatDuration(45)).toBe(`45${NBSP}min`)
    expect(formatDuration(59)).toBe(`59${NBSP}min`)
    expect(formatDuration(60)).toBe(`1${NBSP}h`)
    expect(formatDuration(65)).toBe(`1${NBSP}h${NBSP}05`)
    expect(formatDuration(135)).toBe(`2${NBSP}h${NBSP}15`)
    expect(formatDuration(600)).toBe(`10${NBSP}h`)
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
  const morning = slot(today, '07:00', 30, { programSlug: 'le-journal' })
  const evening = slot(today, '20:00', 30, { programSlug: 'le-journal' })
  const tomorrow = slot('2026-10-22', '07:00', 30, { programSlug: 'le-journal' })
  const other = slot(today, '21:00', 60, { programSlug: 'la-meteo' })
  const data = buildGridData([morning, evening, other, tomorrow], today, 0)

  it('la diffusion en cours ou la prochaine', () => {
    expect(findAiring(data, 'le-journal', Date.parse(at(today, '07:10')))).toMatchObject({ day: today, slot: { id: morning.id } })
    expect(findAiring(data, 'le-journal', Date.parse(at(today, '07:30')))).toMatchObject({ day: today, slot: { id: evening.id } })
    expect(findAiring(data, 'le-journal', Date.parse(at(today, '21:00')))).toMatchObject({ day: '2026-10-22', slot: { id: tomorrow.id } })
  })

  it('toutes passées : la première de la semaine ; émission absente : rien', () => {
    expect(findAiring(data, 'le-journal', Date.parse(at('2026-10-23', '12:00')))).toMatchObject({ day: today, slot: { id: morning.id } })
    expect(findAiring(data, 'emission-inconnue', 0)).toBeNull()
  })

  it('un créneau à cheval sur deux frises est trouvé dans la première', () => {
    const long = slot(today, '23:00', 9 * 60, { programSlug: 'la-nuit' })
    const grid = buildGridData([long], today, 0)
    expect(findAiring(grid, 'la-nuit', Date.parse(at(today, '12:00')))).toMatchObject({ day: today, slot: { id: long.id, cutR: true } })
  })
})
