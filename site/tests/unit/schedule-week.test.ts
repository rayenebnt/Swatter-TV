// Tests unitaires de src/lib/schedule-week.ts : semaines et soirées de la grille (antenne de 18 h à 0 h 30 ; journées TV
// de 0 h 30 à 0 h 30, outil de la grille de l’administration, recopie de semaine et tableau de bord) : lundi d’une
// semaine, filtres et adresses de la liste, plage affichée, libellés en français, couverture d’une soirée, titre d’un
// créneau, et décalage d’une semaine à la même heure de Paris, changements d’heure compris. Instants toujours explicites.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Where } from 'payload'
import { shiftDay, tvDay } from '@/components/programme/model'
import { parisDateTime } from '@/lib/format'
import {
  currentMonday,
  dayLabel,
  durationLabel,
  eveningShortLabel,
  mondayOf,
  nextWeekSameTime,
  rangeFromWhere,
  rangeLabel,
  rangeSearch,
  rangeWhere,
  slotWhen,
  uncoveredMinutes,
  weekEveningsLabel,
  weekLabel,
} from '@/lib/schedule-week'

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

  it('semaine TV en cours : jusqu’au lundi 0 h 30, la soirée du dimanche (et sa semaine) est encore à l’antenne', () => {
    expect(currentMonday(parisDateTime('2026-10-26', '00:00'))).toBe('2026-10-19')
    expect(currentMonday(parisDateTime('2026-10-26', '00:15'))).toBe('2026-10-19')
    expect(currentMonday(parisDateTime('2026-10-26', '00:29'))).toBe('2026-10-19')
    expect(currentMonday(parisDateTime('2026-10-26', '00:30'))).toBe('2026-10-26')
    expect(currentMonday(parisDateTime('2026-10-26', '10:00'))).toBe('2026-10-26')
    expect(currentMonday(parisDateTime('2026-10-26', '18:00'))).toBe('2026-10-26')
    expect(currentMonday(parisDateTime('2026-10-25', '23:59'))).toBe('2026-10-19')
    expect(currentMonday(parisDateTime('2026-10-21', '12:00'))).toBe('2026-10-19')
  })

  it('sans argument : l’heure courante', () => {
    vi.useFakeTimers()
    vi.setSystemTime(parisDateTime('2027-01-04', '00:15'))
    expect(currentMonday()).toBe('2026-12-28')
    vi.setSystemTime(parisDateTime('2027-01-04', '00:30'))
    expect(currentMonday()).toBe('2027-01-04')
  })
})

describe('rangeWhere et rangeSearch : filtre de la liste de la grille', () => {
  it('une semaine : du lundi 0 h 30 au lundi suivant 0 h 30 (heure de Paris)', () => {
    expect(rangeWhere('2026-10-12', 7)).toEqual({
      or: [{ and: [{ startsAt: { greater_than_equal: '2026-10-11T22:30:00.000Z' } }, { startsAt: { less_than: '2026-10-18T22:30:00.000Z' } }] }],
    })
  })

  it('une soirée : de 0 h 30 à 0 h 30 le lendemain (la soirée entière et les anciens créneaux hors antenne du jour)', () => {
    expect(bounds(rangeWhere('2026-10-21', 1))).toEqual({ from: '2026-10-20T22:30:00.000Z', to: '2026-10-21T22:30:00.000Z' })
    expect(bounds(rangeWhere('2026-12-31', 1))).toEqual({ from: '2026-12-30T23:30:00.000Z', to: '2026-12-31T23:30:00.000Z' })
    const where = rangeWhere('2026-10-21', 1)
    // la soirée de 18 h à 0 h 30, le créneau de 0 h 15 (daté du 22) compris ; un ancien créneau de 6 h aussi
    for (const time of ['18:00', '20:30', '23:59']) expect(inRange(parisDateTime('2026-10-21', time), where), time).toBe(true)
    for (const time of ['00:00', '00:15', '00:25']) expect(inRange(parisDateTime('2026-10-22', time), where), time).toBe(true)
    expect(inRange(parisDateTime('2026-10-21', '06:00'), where)).toBe(true)
    // 0 h 15 du 21 : soirée du 20 ; 0 h 30 du 22 : hors antenne, journée du 22
    expect(inRange(parisDateTime('2026-10-21', '00:15'), where)).toBe(false)
    expect(inRange(parisDateTime('2026-10-22', '00:30'), where)).toBe(false)
  })

  it('semaines des changements d’heure : 0 h 30 de Paris à chaque bout', () => {
    expect(bounds(rangeWhere('2026-03-23', 7))).toEqual({ from: '2026-03-22T23:30:00.000Z', to: '2026-03-29T22:30:00.000Z' })
    expect(bounds(rangeWhere('2026-10-26', 7))).toEqual({ from: '2026-10-25T23:30:00.000Z', to: '2026-11-01T23:30:00.000Z' })
    // semaine du changement d'heure (dimanche 25 à 3 h) : départ en heure d'été, arrivée en heure d'hiver
    expect(bounds(rangeWhere('2026-10-19', 7))).toEqual({ from: '2026-10-18T22:30:00.000Z', to: '2026-10-25T23:30:00.000Z' })
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
      or: [{ and: [{ startsAt: { greater_than_equal: '2026-10-21T00:30:00+02:00' } }, { startsAt: { less_than: '2026-10-22T00:30:00+02:00' } }] }],
    }
    expect(rangeFromWhere(where)).toEqual({ first: '2026-10-21', days: 1 })
  })

  it('adresse enregistrée avant les soirées (journée de 2 h à 2 h) : plus reconnue, l’outil propose la semaine en cours', () => {
    const old: Where = {
      or: [{ and: [{ startsAt: { greater_than_equal: '2026-10-21T00:00:00.000Z' } }, { startsAt: { less_than: '2026-10-22T00:00:00.000Z' } }] }],
    }
    expect(rangeFromWhere(old)).toBeNull()
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

  it('le 1er du mois : « lundi 1er », le mois une seule fois', () => {
    expect(weekLabel('2027-03-01')).toBe('du lundi 1er au dimanche 7 mars')
  })

  it('« semaine du … » ou « soirée du … » (messages de la recopie), « soirées du … » (titre de l’outil)', () => {
    expect(rangeLabel('2026-10-12', 7)).toBe('semaine du lundi 12 au dimanche 18 octobre')
    expect(rangeLabel('2026-10-24', 1)).toBe('soirée du samedi 24 octobre')
    expect(weekEveningsLabel('2026-10-12')).toBe('soirées du lundi 12 au dimanche 18 octobre')
    expect(weekEveningsLabel('2026-10-26')).toBe('soirées du lundi 26 octobre au dimanche 1er novembre')
  })

  it('soirée en quelques mots : « ce soir », « demain soir », « hier soir », puis « sam. 24 »', () => {
    expect(eveningShortLabel('2026-10-21', '2026-10-21')).toBe('ce soir')
    expect(eveningShortLabel('2026-10-22', '2026-10-21')).toBe('demain soir')
    expect(eveningShortLabel('2026-10-20', '2026-10-21')).toBe('hier soir')
    expect(eveningShortLabel('2026-10-24', '2026-10-21')).toBe('sam. 24')
    expect(eveningShortLabel('2026-10-27', '2026-10-21')).toBe('mar. 27')
    expect(eveningShortLabel('2027-01-01', '2026-12-31')).toBe('demain soir')
  })

  it('durées : « 45 min », « 1 h 15 », « 2 h », « 1 h 05 », « 6 h 30 »', () => {
    expect(durationLabel(45)).toBe('45 min')
    expect(durationLabel(75)).toBe('1 h 15')
    expect(durationLabel(120)).toBe('2 h')
    expect(durationLabel(65)).toBe('1 h 05')
    expect(durationLabel(390)).toBe('6 h 30')
  })
})

describe('nextWeekSameTime : même jour et même heure de Paris, sept jours plus tard', () => {
  const paris = (day: string, time: string) => parisDateTime(day, time).toISOString()

  it('semaine ordinaire', () => {
    expect(nextWeekSameTime(paris('2026-10-12', '20:30')).toISOString()).toBe(paris('2026-10-19', '20:30'))
    expect(nextWeekSameTime(new Date(paris('2026-10-13', '18:00'))).toISOString()).toBe(paris('2026-10-20', '18:00'))
    expect(nextWeekSameTime(paris('2026-10-14', '00:15')).toISOString()).toBe(paris('2026-10-21', '00:15'))
  })

  it('à travers le retour à l’heure d’hiver : la même heure affichée, une heure UTC plus tard', () => {
    expect(nextWeekSameTime('2026-10-19T18:30:00.000Z').toISOString()).toBe('2026-10-26T19:30:00.000Z')
    // nuit du samedi 24 au dimanche 25, 0 h 15 : encore à l'heure d'été (le changement a lieu à 3 h)
    expect(nextWeekSameTime(paris('2026-10-18', '00:15')).toISOString()).toBe('2026-10-24T22:15:00.000Z')
    expect(nextWeekSameTime(paris('2026-10-19', '00:15')).toISOString()).toBe('2026-10-25T23:15:00.000Z')
    expect(nextWeekSameTime(paris('2026-10-24', '23:30')).toISOString()).toBe(paris('2026-10-31', '23:30'))
  })

  it('à travers le passage à l’heure d’été : la même heure affichée, une heure UTC plus tôt', () => {
    expect(nextWeekSameTime(paris('2026-03-23', '20:30')).toISOString()).toBe('2026-03-30T18:30:00.000Z')
    // nuit du samedi 28 au dimanche 29, 0 h 15 : encore à l'heure d'hiver (le changement a lieu à 2 h)
    expect(nextWeekSameTime(paris('2026-03-22', '00:15')).toISOString()).toBe('2026-03-28T23:15:00.000Z')
    expect(nextWeekSameTime(paris('2026-03-23', '00:15')).toISOString()).toBe('2026-03-29T22:15:00.000Z')
    // robustesse (ancienne donnée hors antenne) : 2 h 30 n'existe pas le 29 mars, la copie tombe à 3 h 30
    expect(nextWeekSameTime(paris('2026-03-22', '02:30')).toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('du 31 décembre au 7 janvier', () => {
    expect(nextWeekSameTime(paris('2026-12-31', '23:30')).toISOString()).toBe(paris('2027-01-07', '23:30'))
  })
})

describe('journées TV de la grille et changements d’heure', () => {
  it('rangeWhere et tvDay rangent chaque instant dans la même journée TV', () => {
    const nights = [
      ['2026-03-28T16:00:00Z', '2026-03-29T06:00:00Z'],
      ['2026-03-29T15:00:00Z', '2026-03-29T23:00:00Z'],
      ['2026-10-24T15:00:00Z', '2026-10-25T06:00:00Z'],
      ['2026-10-25T16:00:00Z', '2026-10-26T00:00:00Z'],
      ['2026-12-31T16:00:00Z', '2027-01-01T06:00:00Z'],
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

describe('uncoveredMinutes : minutes de la soirée (18 h – 0 h 30) sans programme', () => {
  const at = (day: string, time: string, durationMinutes: number) => ({ startsAt: parisDateTime(day, time).toISOString(), durationMinutes })

  it('soirée vide : 390 min ; soirée continue de 18 h à 0 h 30 : 0', () => {
    expect(uncoveredMinutes('2026-10-21', [])).toBe(390)
    const full = [at('2026-10-21', '18:00', 30), at('2026-10-21', '18:30', 300), at('2026-10-21', '23:30', 30), at('2026-10-22', '00:00', 30)]
    expect(uncoveredMinutes('2026-10-21', full)).toBe(0)
  })

  it('trous comptés, chevauchements une seule fois, créneaux d’autres soirées ignorés', () => {
    const slots = [
      at('2026-10-21', '18:00', 60),
      at('2026-10-21', '18:30', 60),
      at('2026-10-21', '21:00', 120),
      at('2026-10-20', '20:00', 60),
      at('2026-10-22', '18:00', 60),
    ]
    // couverts : 18 h – 19 h 30 et 21 h – 23 h, soit 210 min ; il en manque 180
    expect(uncoveredMinutes('2026-10-21', slots)).toBe(180)
  })

  it('anciens créneaux rognés aux horaires d’antenne : 17 h 30 – 18 h 30 couvre 30 min, 6 h rien, 23 h 45 + 60 min jusqu’à 0 h 30', () => {
    expect(uncoveredMinutes('2026-10-21', [at('2026-10-21', '17:30', 60)])).toBe(360)
    expect(uncoveredMinutes('2026-10-21', [at('2026-10-21', '06:00', 600)])).toBe(390)
    expect(uncoveredMinutes('2026-10-21', [at('2026-10-21', '23:45', 60)])).toBe(345)
    expect(uncoveredMinutes('2026-10-21', [at('2026-10-22', '00:30', 30)])).toBe(390)
  })

  it('soirées des changements d’heure : toujours 390 min (aucun changement entre 18 h et 0 h 30)', () => {
    const pairs = [
      ['2026-10-24', '2026-10-25'],
      ['2026-10-25', '2026-10-26'],
      ['2026-03-28', '2026-03-29'],
      ['2026-03-29', '2026-03-30'],
    ]
    for (const [day, next] of pairs) {
      expect(uncoveredMinutes(day, []), day).toBe(390)
      expect(uncoveredMinutes(day, [at(day, '18:00', 360), at(next, '00:00', 30)]), day).toBe(0)
    }
  })
})

describe('slotWhen : date et heure d’un créneau dans son titre de fiche', () => {
  it('« 21/10/2026 20:30 » en heure de Paris', () => {
    expect(slotWhen(parisDateTime('2026-10-21', '20:30'))).toBe('21/10/2026 20:30')
    expect(slotWhen('2026-11-05T17:00:00.000Z')).toBe('05/11/2026 18:00')
  })

  it('après minuit, rattaché à sa soirée : « Soirée du 20/10/2026, 00:15 »', () => {
    expect(slotWhen(parisDateTime('2026-10-21', '00:15'))).toBe('Soirée du 20/10/2026, 00:15')
    expect(slotWhen(parisDateTime('2026-10-21', '00:00'))).toBe('Soirée du 20/10/2026, 00:00')
    expect(slotWhen(parisDateTime('2027-01-01', '00:25'))).toBe('Soirée du 31/12/2026, 00:25')
  })

  it('ancien créneau hors antenne (0 h 30, 6 h) : sa date et son heure ; date illisible : rien', () => {
    expect(slotWhen(parisDateTime('2026-10-21', '00:30'))).toBe('21/10/2026 00:30')
    expect(slotWhen(parisDateTime('2026-10-21', '06:00'))).toBe('21/10/2026 06:00')
    expect(slotWhen('pas une date')).toBe('')
  })
})
