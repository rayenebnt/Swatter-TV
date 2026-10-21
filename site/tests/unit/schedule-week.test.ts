// Tests unitaires de src/lib/schedule-week.ts : semaines et journées TV de 2 h à 2 h (outil de la grille de
// l’administration et recopie de semaine) : lundi d’une semaine, filtres et adresses de la liste, plage affichée,
// libellés en français, et décalage d’une semaine à la même heure de Paris, changements d’heure compris.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Where } from 'payload'
import { shiftDay, tvDay } from '@/components/programme/model'
import { parisDateTime } from '@/lib/format'
import { currentMonday, dayLabel, mondayOf, nextWeekSameTime, rangeFromWhere, rangeLabel, rangeSearch, rangeWhere, weekLabel } from '@/lib/schedule-week'

/** Bornes [début, fin[ d'une plage, lues dans le filtre produit par rangeWhere. */
function bounds(where: Where): { from: string; to: string } {
  const and = (where.or as Where[])[0].and as Where[]
  return {
    from: (and[0].startsAt as { greater_than_equal: string }).greater_than_equal,
    to: (and[1].startsAt as { less_than: string }).less_than,
  }
}
const inRange = (instant: Date, where: Where) => {
  const { from, to } = bounds(where)
  return instant.getTime() >= Date.parse(from) && instant.getTime() < Date.parse(to)
}
/** Instants toutes les 15 minutes entre deux dates ISO. */
function* everyQuarter(from: string, to: string) {
  for (let t = Date.parse(from); t < Date.parse(to); t += 15 * 60_000) yield new Date(t)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('mondayOf et currentMonday : lundi de la semaine', () => {
  it('du lundi au dimanche, la semaine commence le lundi', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19')
    expect(mondayOf('2026-10-21')).toBe('2026-10-19')
    expect(mondayOf('2026-10-25')).toBe('2026-10-19')
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
  })

  it('à cheval sur deux mois, deux années ou un 29 février', () => {
    expect(mondayOf('2026-03-01')).toBe('2026-02-23')
    expect(mondayOf('2026-01-01')).toBe('2025-12-29')
    expect(mondayOf('2027-01-03')).toBe('2026-12-28')
    expect(mondayOf('2028-03-01')).toBe('2028-02-28')
  })

  it('semaine TV en cours : la nuit du dimanche au lundi, jusqu’à 2 h, appartient encore à la semaine qui finit', () => {
    expect(currentMonday(new Date(parisDateTime('2026-10-26', '01:59')))).toBe('2026-10-19')
    expect(currentMonday(new Date(parisDateTime('2026-10-26', '02:00')))).toBe('2026-10-26')
    expect(currentMonday(new Date(parisDateTime('2026-10-21', '12:00')))).toBe('2026-10-19')
  })

  it('sans argument : l’heure courante', () => {
    vi.useFakeTimers()
    vi.setSystemTime(parisDateTime('2027-01-04', '01:00'))
    expect(currentMonday()).toBe('2026-12-28')
  })
})

describe('rangeWhere et rangeSearch : filtre de la liste de la grille', () => {
  it('une semaine : du lundi 2 h au lundi suivant 2 h (heure de Paris)', () => {
    expect(rangeWhere('2026-10-12', 7)).toEqual({
      or: [{ and: [{ startsAt: { greater_than_equal: '2026-10-12T00:00:00.000Z' } }, { startsAt: { less_than: '2026-10-19T00:00:00.000Z' } }] }],
    })
  })

  it('une journée : de 2 h à 2 h le lendemain', () => {
    expect(bounds(rangeWhere('2026-10-21', 1))).toEqual({ from: '2026-10-21T00:00:00.000Z', to: '2026-10-22T00:00:00.000Z' })
    expect(bounds(rangeWhere('2026-12-31', 1))).toEqual({ from: '2026-12-31T01:00:00.000Z', to: '2027-01-01T01:00:00.000Z' })
  })

  it('semaines des changements d’heure : 2 h de Paris à chaque bout', () => {
    expect(bounds(rangeWhere('2026-03-23', 7))).toEqual({ from: '2026-03-23T01:00:00.000Z', to: '2026-03-30T00:00:00.000Z' })
    expect(bounds(rangeWhere('2026-10-26', 7))).toEqual({ from: '2026-10-26T01:00:00.000Z', to: '2026-11-02T01:00:00.000Z' })
  })

  it('les journées et les semaines se suivent sans trou ni chevauchement', () => {
    for (const first of ['2026-03-23', '2026-10-19', '2026-12-28']) {
      for (let i = 0; i < 7; i++) {
        expect(bounds(rangeWhere(shiftDay(first, i), 1)).to).toBe(bounds(rangeWhere(shiftDay(first, i + 1), 1)).from)
      }
      expect(bounds(rangeWhere(first, 7)).from).toBe(bounds(rangeWhere(first, 1)).from)
      expect(bounds(rangeWhere(first, 7)).to).toBe(bounds(rangeWhere(shiftDay(first, 6), 1)).to)
    }
  })

  it('adresse de la liste filtrée : les mêmes bornes en paramètres where[…]', () => {
    const search = rangeSearch('2026-10-19', 7)
    expect(search.startsWith('?')).toBe(true)
    const params = new URLSearchParams(search.slice(1))
    expect([...params.entries()]).toEqual([
      ['where[or][0][and][0][startsAt][greater_than_equal]', bounds(rangeWhere('2026-10-19', 7)).from],
      ['where[or][0][and][1][startsAt][less_than]', bounds(rangeWhere('2026-10-19', 7)).to],
    ])
  })
})

describe('rangeFromWhere : plage affichée par le filtre de la liste', () => {
  it('retrouve une semaine (lundi) ou une journée créée par rangeWhere, changements d’heure compris', () => {
    for (const monday of ['2026-10-19', '2026-10-26', '2026-03-23', '2026-03-30', '2026-12-28']) {
      expect(rangeFromWhere(rangeWhere(monday, 7))).toEqual({ first: monday, days: 7 })
    }
    for (const day of ['2026-10-21', '2026-10-24', '2026-10-25', '2026-10-26', '2026-03-28', '2026-03-29', '2026-12-31', '2027-01-01']) {
      expect(rangeFromWhere(rangeWhere(day, 1))).toEqual({ first: day, days: 1 })
    }
  })

  it('accepte les mêmes instants écrits autrement (décalage horaire explicite)', () => {
    const where: Where = {
      or: [{ and: [{ startsAt: { greater_than_equal: '2026-10-21T02:00:00+02:00' } }, { startsAt: { less_than: '2026-10-22T02:00:00+02:00' } }] }],
    }
    expect(rangeFromWhere(where)).toEqual({ first: '2026-10-21', days: 1 })
  })

  it('rien pour tout autre filtre : semaine ne commençant pas un lundi, autre durée, bornes décalées, dates illisibles…', () => {
    expect(rangeFromWhere(undefined)).toBeNull()
    expect(rangeFromWhere({})).toBeNull()
    expect(rangeFromWhere({ title: { equals: 'x' } })).toBeNull()
    expect(rangeFromWhere(rangeWhere('2026-10-21', 7))).toBeNull()
    expect(rangeFromWhere(rangeWhere('2026-10-21', 3))).toBeNull()
    expect(rangeFromWhere(rangeWhere('2026-10-21', 14))).toBeNull()
    const shifted: Where = {
      or: [{ and: [{ startsAt: { greater_than_equal: '2026-10-21T01:00:00.000Z' } }, { startsAt: { less_than: '2026-10-22T00:00:00.000Z' } }] }],
    }
    expect(rangeFromWhere(shifted)).toBeNull()
    const unreadable: Where = { or: [{ and: [{ startsAt: { greater_than_equal: 'hier' } }, { startsAt: { less_than: 'demain' } }] }] }
    expect(rangeFromWhere(unreadable)).toBeNull()
    const day = bounds(rangeWhere('2026-10-21', 1))
    const extra: Where = {
      or: [{ and: [{ startsAt: { greater_than_equal: day.from } }, { startsAt: { less_than: day.to } }, { program: { equals: 3 } }] }],
    }
    expect(rangeFromWhere(extra)).toBeNull()
  })
})

describe('libellés en français', () => {
  it('« samedi 24 octobre »', () => {
    expect(dayLabel('2026-10-24')).toBe('samedi 24 octobre')
    expect(dayLabel('2026-10-25')).toBe('dimanche 25 octobre')
    expect(dayLabel('2026-03-29')).toBe('dimanche 29 mars')
    expect(dayLabel('2026-12-31')).toBe('jeudi 31 décembre')
  })

  it('semaine dans un même mois : le mois une seule fois, à la fin', () => {
    expect(weekLabel('2026-10-12')).toBe('du lundi 12 au dimanche 18 octobre')
    expect(weekLabel('2026-03-23')).toBe('du lundi 23 au dimanche 29 mars')
  })

  it('semaine à cheval sur deux mois ou deux années : les deux mois', () => {
    expect(weekLabel('2026-09-28')).toBe('du lundi 28 septembre au dimanche 4 octobre')
    expect(weekLabel('2026-12-28')).toBe('du lundi 28 décembre au dimanche 3 janvier')
    expect(weekLabel('2026-10-26')).toBe('du lundi 26 octobre au dimanche 1er novembre')
  })

  it('« semaine du … » ou « journée du … »', () => {
    expect(rangeLabel('2026-10-12', 7)).toBe('semaine du lundi 12 au dimanche 18 octobre')
    expect(rangeLabel('2026-10-24', 1)).toBe('journée du samedi 24 octobre')
  })
})

describe('nextWeekSameTime : même jour et même heure de Paris, sept jours plus tard', () => {
  const paris = (day: string, time: string) => parisDateTime(day, time).toISOString()

  it('semaine ordinaire', () => {
    expect(nextWeekSameTime(paris('2026-10-12', '20:30')).toISOString()).toBe(paris('2026-10-19', '20:30'))
    expect(nextWeekSameTime(new Date(paris('2026-10-13', '06:00'))).toISOString()).toBe(paris('2026-10-20', '06:00'))
  })

  it('à travers le retour à l’heure d’hiver : la même heure affichée, une heure UTC plus tard', () => {
    expect(nextWeekSameTime('2026-10-19T18:30:00.000Z').toISOString()).toBe('2026-10-26T19:30:00.000Z')
    // nuit du samedi au dimanche, 1 h 30 : encore à l'heure d'été le 25
    expect(nextWeekSameTime(paris('2026-10-18', '01:30')).toISOString()).toBe(paris('2026-10-25', '01:30'))
    expect(nextWeekSameTime(paris('2026-10-24', '23:30')).toISOString()).toBe(paris('2026-10-31', '23:30'))
  })

  it('à travers le passage à l’heure d’été : la même heure affichée, une heure UTC plus tôt', () => {
    expect(nextWeekSameTime(paris('2026-03-23', '20:30')).toISOString()).toBe('2026-03-30T18:30:00.000Z')
    expect(nextWeekSameTime(paris('2026-03-22', '01:30')).toISOString()).toBe(paris('2026-03-29', '01:30'))
    // 2 h 30 n'existe pas le 29 mars : la copie tombe à 3 h 30
    expect(nextWeekSameTime(paris('2026-03-22', '02:30')).toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('du 31 décembre au 7 janvier', () => {
    expect(nextWeekSameTime(paris('2026-12-31', '23:30')).toISOString()).toBe(paris('2027-01-07', '23:30'))
  })
})

describe('journées TV de la grille et changements d’heure', () => {
  it('rangeWhere et tvDay rangent chaque instant dans la même journée TV', () => {
    const nights = [
      ['2026-03-28T18:00:00Z', '2026-03-29T06:00:00Z'],
      ['2026-10-24T18:00:00Z', '2026-10-25T06:00:00Z'],
      ['2026-12-31T18:00:00Z', '2027-01-01T06:00:00Z'],
    ]
    for (const [from, to] of nights) {
      for (const instant of everyQuarter(from, to)) {
        expect(inRange(instant, rangeWhere(tvDay(instant), 1)), `${instant.toISOString()} (journée TV ${tvDay(instant)})`).toBe(true)
      }
    }
  })

  it('recopie d’une journée : chaque créneau recopié tombe dans la journée d’arrivée (sept jours plus tard)', () => {
    const days = ['2026-03-21', '2026-03-22', '2026-03-28', '2026-03-29', '2026-10-17', '2026-10-18', '2026-10-24', '2026-10-25', '2026-12-31']
    for (const day of days) {
      const { from, to } = bounds(rangeWhere(day, 1))
      for (const instant of everyQuarter(from, to)) {
        const copy = nextWeekSameTime(instant)
        expect(inRange(copy, rangeWhere(shiftDay(day, 7), 1)), `${instant.toISOString()} (${day}) → ${copy.toISOString()}`).toBe(true)
      }
    }
  })

  it('recopie d’une semaine : chaque créneau recopié tombe dans la semaine suivante', () => {
    for (const monday of ['2026-03-16', '2026-03-23', '2026-10-19', '2026-10-26', '2026-12-28']) {
      const { from, to } = bounds(rangeWhere(monday, 7))
      for (const instant of everyQuarter(from, to)) {
        expect(inRange(nextWeekSameTime(instant), rangeWhere(shiftDay(monday, 7), 7)), instant.toISOString()).toBe(true)
      }
    }
  })
})
