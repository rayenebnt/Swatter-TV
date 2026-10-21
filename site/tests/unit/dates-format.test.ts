// Tests unitaires de src/lib/format.ts : jours et heures affichés en heure de Paris (changements d’heure du dernier
// dimanche de mars et d’octobre, minuit, passage à la nouvelle année), dates relatives et nombres au format français.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateChip, formatDate, formatDayLong, formatNumber, formatTime, parisDateTime, parisDay, timeAgo } from '@/lib/format'

const iso = (d: Date) => d.toISOString()
const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000)

afterEach(() => {
  vi.useRealTimers()
})

describe('parisDateTime : jour et heure de Paris → instant', () => {
  it('heure d’hiver (UTC+1) et heure d’été (UTC+2)', () => {
    expect(iso(parisDateTime('2026-01-15', '20:30'))).toBe('2026-01-15T19:30:00.000Z')
    expect(iso(parisDateTime('2026-07-14', '20:30'))).toBe('2026-07-14T18:30:00.000Z')
  })

  it('sans heure : minuit à Paris', () => {
    expect(iso(parisDateTime('2026-10-21'))).toBe('2026-10-20T22:00:00.000Z')
    expect(iso(parisDateTime('2026-12-21'))).toBe('2026-12-20T23:00:00.000Z')
  })

  it('passage à l’heure d’été (dimanche 29 mars 2026, 2 h → 3 h) : heures existantes de part et d’autre', () => {
    expect(iso(parisDateTime('2026-03-29', '00:00'))).toBe('2026-03-28T23:00:00.000Z')
    expect(iso(parisDateTime('2026-03-29', '01:59'))).toBe('2026-03-29T00:59:00.000Z')
    expect(iso(parisDateTime('2026-03-29', '03:00'))).toBe('2026-03-29T01:00:00.000Z')
    expect(iso(parisDateTime('2026-03-29', '12:00'))).toBe('2026-03-29T10:00:00.000Z')
    expect(iso(parisDateTime('2026-03-29', '23:59'))).toBe('2026-03-29T21:59:00.000Z')
  })

  it('passage à l’heure d’été : une heure qui n’existe pas (2 h 30) est reportée d’une heure', () => {
    const t = parisDateTime('2026-03-29', '02:30')
    expect(iso(t)).toBe('2026-03-29T01:30:00.000Z')
    expect(formatTime(t)).toBe('03:30')
    expect(parisDay(t)).toBe('2026-03-29')
  })

  it('retour à l’heure d’hiver (dimanche 25 octobre 2026, 3 h → 2 h)', () => {
    expect(iso(parisDateTime('2026-10-25', '00:00'))).toBe('2026-10-24T22:00:00.000Z')
    expect(iso(parisDateTime('2026-10-25', '01:59'))).toBe('2026-10-24T23:59:00.000Z')
    expect(iso(parisDateTime('2026-10-25', '03:00'))).toBe('2026-10-25T02:00:00.000Z')
    expect(iso(parisDateTime('2026-10-25', '12:00'))).toBe('2026-10-25T11:00:00.000Z')
  })

  it('retour à l’heure d’hiver : 2 h 30, qui a lieu deux fois, donne un instant affiché 2 h 30 ce jour-là', () => {
    const t = parisDateTime('2026-10-25', '02:30')
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(iso(t))
    expect(formatTime(t)).toBe('02:30')
    expect(parisDay(t)).toBe('2026-10-25')
  })

  it('les changements d’heure d’une autre année (2027 : 28 mars et 31 octobre)', () => {
    expect(iso(parisDateTime('2027-03-27', '20:00'))).toBe('2027-03-27T19:00:00.000Z')
    expect(iso(parisDateTime('2027-03-28', '20:00'))).toBe('2027-03-28T18:00:00.000Z')
    expect(iso(parisDateTime('2027-10-30', '20:00'))).toBe('2027-10-30T18:00:00.000Z')
    expect(iso(parisDateTime('2027-10-31', '20:00'))).toBe('2027-10-31T19:00:00.000Z')
  })

  it('31 décembre, nouvel an et 29 février', () => {
    expect(iso(parisDateTime('2026-12-31', '23:59'))).toBe('2026-12-31T22:59:00.000Z')
    expect(iso(parisDateTime('2027-01-01', '00:00'))).toBe('2026-12-31T23:00:00.000Z')
    expect(iso(parisDateTime('2028-02-29', '12:00'))).toBe('2028-02-29T11:00:00.000Z')
  })

  it('aller-retour : parisDay et formatTime retrouvent le jour et l’heure saisis, toutes les 15 minutes', () => {
    const days = ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26', '2026-12-31', '2027-01-01', '2028-02-29']
    for (const day of days) {
      for (let m = 0; m < 24 * 60; m += 15) {
        const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        // heure inexistante le jour du passage à l’heure d’été
        if (day === '2026-03-29' && time >= '02:00' && time < '03:00') continue
        const t = parisDateTime(day, time)
        expect(parisDay(t), `${day} ${time}`).toBe(day)
        expect(formatTime(t), `${day} ${time}`).toBe(time)
      }
    }
  })

  it('le fuseau horaire du serveur n’a aucune influence', () => {
    const before = process.env.TZ
    try {
      for (const tz of ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Europe/Paris']) {
        process.env.TZ = tz
        expect(iso(parisDateTime('2026-10-25', '03:00')), tz).toBe('2026-10-25T02:00:00.000Z')
        expect(iso(parisDateTime('2026-03-29', '12:00')), tz).toBe('2026-03-29T10:00:00.000Z')
        expect(parisDay('2026-10-24T22:30:00Z'), tz).toBe('2026-10-25')
        expect(formatTime('2026-10-24T22:30:00Z'), tz).toBe('00:30')
        expect(formatDayLong('2026-10-24T22:30:00Z'), tz).toBe('dimanche 25 octobre')
      }
    } finally {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    }
  })
})

describe('parisDay : jour civil à Paris (AAAA-MM-JJ)', () => {
  it('minuit à Paris, en hiver et en été', () => {
    expect(parisDay('2026-01-14T22:59:59Z')).toBe('2026-01-14')
    expect(parisDay('2026-01-14T23:00:00Z')).toBe('2026-01-15')
    expect(parisDay('2026-06-30T21:59:59Z')).toBe('2026-06-30')
    expect(parisDay('2026-06-30T22:00:00Z')).toBe('2026-07-01')
  })

  it('31 décembre → 1er janvier', () => {
    expect(parisDay('2026-12-31T22:59:59Z')).toBe('2026-12-31')
    expect(parisDay('2026-12-31T23:00:00Z')).toBe('2027-01-01')
  })

  it('nuits des changements d’heure', () => {
    expect(parisDay('2026-03-28T22:59:00Z')).toBe('2026-03-28')
    expect(parisDay('2026-03-28T23:00:00Z')).toBe('2026-03-29')
    expect(parisDay('2026-10-24T21:59:00Z')).toBe('2026-10-24')
    expect(parisDay('2026-10-24T22:00:00Z')).toBe('2026-10-25')
    expect(parisDay('2026-10-25T22:59:00Z')).toBe('2026-10-25')
    expect(parisDay('2026-10-25T23:00:00Z')).toBe('2026-10-26')
  })

  it('accepte une date ou une chaîne ISO ; sans argument, le jour en cours à Paris', () => {
    expect(parisDay(new Date('2026-10-21T10:00:00Z'))).toBe('2026-10-21')
    expect(parisDay('2026-10-21T10:00:00+02:00')).toBe('2026-10-21')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'))
    expect(parisDay()).toBe('2027-01-01')
  })
})

describe('formatTime : heure de Paris sur 24 h', () => {
  it('« 20:30 », sur deux chiffres, minuit en « 00:00 »', () => {
    expect(formatTime('2026-10-17T18:30:00Z')).toBe('20:30')
    expect(formatTime('2026-10-17T07:05:00Z')).toBe('09:05')
    expect(formatTime('2026-10-16T22:00:00Z')).toBe('00:00')
    expect(formatTime(new Date('2026-01-17T22:59:00Z'))).toBe('23:59')
  })

  it('autour des changements d’heure', () => {
    expect(formatTime('2026-03-29T00:59:00Z')).toBe('01:59')
    expect(formatTime('2026-03-29T01:00:00Z')).toBe('03:00')
    // 2 h 30 deux fois de suite, à une heure d'intervalle
    expect(formatTime('2026-10-25T00:30:00Z')).toBe('02:30')
    expect(formatTime('2026-10-25T01:30:00Z')).toBe('02:30')
    expect(formatTime('2026-10-25T02:00:00Z')).toBe('03:00')
  })
})

describe('formatDayLong, formatDate et dateChip : dates en français', () => {
  it('« samedi 17 octobre » et « 17 octobre 2026 »', () => {
    expect(formatDayLong('2026-10-17T18:30:00Z')).toBe('samedi 17 octobre')
    expect(formatDate('2026-10-17T18:30:00Z')).toBe('17 octobre 2026')
    expect(formatDayLong(new Date('2026-03-29T10:00:00Z'))).toBe('dimanche 29 mars')
    expect(formatDate(new Date('2026-08-15T10:00:00Z'))).toBe('15 août 2026')
  })

  it('le jour suit l’heure de Paris (fin de soirée en UTC = lendemain à Paris)', () => {
    expect(formatDayLong('2026-10-24T21:59:00Z')).toBe('samedi 24 octobre')
    expect(formatDayLong('2026-10-24T22:00:00Z')).toBe('dimanche 25 octobre')
    expect(formatDayLong('2026-12-31T22:59:00Z')).toBe('jeudi 31 décembre')
    expect(formatDayLong('2026-12-31T23:30:00Z')).toBe('vendredi 1er janvier')
    expect(formatDate('2026-12-31T23:30:00Z')).toBe('1er janvier 2027')
  })

  it('pastille de date : jour et mois abrégés avec une majuscule', () => {
    expect(dateChip('2026-10-17T18:30:00Z')).toEqual({ weekday: 'Sam.', day: '17', month: 'Oct.' })
    expect(dateChip('2026-06-03T10:00:00Z')).toEqual({ weekday: 'Mer.', day: '3', month: 'Juin' })
    expect(dateChip('2026-12-25T10:00:00Z')).toEqual({ weekday: 'Ven.', day: '25', month: 'Déc.' })
    expect(dateChip(new Date('2026-12-31T23:30:00Z'))).toEqual({ weekday: 'Ven.', day: '1', month: 'Janv.' })
  })
})

describe('timeAgo : dates relatives', () => {
  const now = new Date('2026-10-21T12:00:00Z')

  it('moins d’une minute, ou date à venir : « À l’instant »', () => {
    expect(timeAgo(now, now)).toBe('À l’instant')
    expect(timeAgo(minutesAgo(now, 0.99), now)).toBe('À l’instant')
    expect(timeAgo(minutesAgo(now, -30), now)).toBe('À l’instant')
  })

  it('minutes, puis heures', () => {
    expect(timeAgo(minutesAgo(now, 1), now)).toBe('Il y a 1 min')
    expect(timeAgo(minutesAgo(now, 42), now)).toBe('Il y a 42 min')
    expect(timeAgo(minutesAgo(now, 59), now)).toBe('Il y a 59 min')
    expect(timeAgo(minutesAgo(now, 60), now)).toBe('Il y a 1 h')
    expect(timeAgo(minutesAgo(now, 3 * 60), now)).toBe('Il y a 3 h')
    expect(timeAgo(minutesAgo(now, 23 * 60), now)).toBe('Il y a 23 h')
  })

  it('« Hier » de 24 h à 48 h, puis jours, semaines et date complète au-delà de 30 jours', () => {
    expect(timeAgo(minutesAgo(now, 24 * 60), now)).toBe('Hier')
    expect(timeAgo(minutesAgo(now, 48 * 60 - 1), now)).toBe('Hier')
    expect(timeAgo(minutesAgo(now, 48 * 60), now)).toBe('Il y a 2 j')
    expect(timeAgo(minutesAgo(now, 6 * 1440), now)).toBe('Il y a 6 j')
    expect(timeAgo(minutesAgo(now, 7 * 1440), now)).toBe('Il y a 1 sem.')
    expect(timeAgo(minutesAgo(now, 13 * 1440), now)).toBe('Il y a 1 sem.')
    expect(timeAgo(minutesAgo(now, 14 * 1440), now)).toBe('Il y a 2 sem.')
    expect(timeAgo(minutesAgo(now, 29 * 1440), now)).toBe('Il y a 4 sem.')
    expect(timeAgo(minutesAgo(now, 30 * 1440), now)).toBe('21 septembre 2026')
    expect(timeAgo('2025-12-31T23:30:00Z', now)).toBe('1er janvier 2026')
  })

  it('accepte une chaîne ISO ; sans « now », l’heure courante', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(timeAgo('2026-10-21T09:00:00Z')).toBe('Il y a 3 h')
    expect(timeAgo(new Date('2026-10-21T11:55:00Z'))).toBe('Il y a 5 min')
  })

  it('l’arrondi ne déborde pas sur l’unité suivante : jamais « Il y a 60 min » ni « Il y a 24 h »', () => {
    // 59 min 40 s et 23 h 40 : « 59 min » ou « 1 h », « 23 h » ou « Hier », mais pas une valeur égale au seuil
    expect(['Il y a 59 min', 'Il y a 1 h']).toContain(timeAgo(minutesAgo(now, 59 + 40 / 60), now))
    expect(['Il y a 23 h', 'Hier']).toContain(timeAgo(minutesAgo(now, 23 * 60 + 40), now))
  })
})

describe('formatNumber : nombres au format français', () => {
  it('séparateur de milliers : une espace simple (ni insécable ni fine)', () => {
    expect(formatNumber(995349)).toBe('995 349')
    expect(formatNumber(1234567)).toBe('1 234 567')
    expect(formatNumber(12)).toBe('12')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(1234567)).not.toMatch(/[\u00a0\u202f]/)
  })

  it('décimales avec une virgule', () => {
    expect(formatNumber(1234.5)).toBe('1 234,5')
  })
})
