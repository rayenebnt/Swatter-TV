import { describe, expect, it } from 'vitest'
import {
  BROADCAST_MINUTES,
  broadcastEvening,
  currentEvening,
  eveningOf,
  eveningWindow,
  isOnAir,
  slotOutsideBroadcast,
} from '@/lib/broadcast'
import { tvDay, tvDayStart } from '@/components/programme/model'

/** Instant à Paris (heure d'hiver, UTC+1, sauf mention). */
const paris = (iso: string) => new Date(iso)

describe('horaires d’antenne : tous les jours de 18 h à 0 h 30 (heure de Paris)', () => {
  it('soirée d’un instant : la veille jusqu’à 0 h 30, puis la soirée du jour', () => {
    expect(eveningOf(paris('2026-11-10T00:00:00+01:00'))).toBe('2026-11-09')
    expect(eveningOf(paris('2026-11-10T00:29:59+01:00'))).toBe('2026-11-09')
    expect(eveningOf(paris('2026-11-10T00:30:00+01:00'))).toBe('2026-11-10')
    expect(eveningOf(paris('2026-11-10T10:00:00+01:00'))).toBe('2026-11-10')
    expect(eveningOf(paris('2026-11-10T23:59:00+01:00'))).toBe('2026-11-10')
    // tvDay de la grille suit la même règle
    expect(tvDay(paris('2026-11-10T00:15:00+01:00'))).toBe('2026-11-09')
    expect(tvDay(paris('2026-11-10T03:00:00+01:00'))).toBe('2026-11-10')
  })

  it('soirée de 18 h à 0 h 30 le lendemain, 6 h 30 réelles même les nuits de changement d’heure', () => {
    const w = eveningWindow('2026-11-10')
    expect(w.start.toISOString()).toBe('2026-11-10T17:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-11-10T23:30:00.000Z')
    // heure d'été, veille du passage à l'heure d'hiver (25/10/2026 à 3 h) et du passage à l'heure d'été (29/03/2026 à 2 h)
    for (const day of ['2026-07-14', '2026-10-24', '2026-10-25', '2026-03-28', '2026-03-29']) {
      const { start, end } = eveningWindow(day)
      expect((end.getTime() - start.getTime()) / 60_000, day).toBe(BROADCAST_MINUTES)
    }
    expect(eveningWindow('2026-07-14').start.toISOString()).toBe('2026-07-14T16:00:00.000Z')
  })

  it('à l’antenne de 18 h inclus à 0 h 30 exclu, soirée en cours ou à venir', () => {
    expect(isOnAir(paris('2026-11-10T17:59:59+01:00'))).toBe(false)
    expect(isOnAir(paris('2026-11-10T18:00:00+01:00'))).toBe(true)
    expect(isOnAir(paris('2026-11-10T23:59:00+01:00'))).toBe(true)
    expect(isOnAir(paris('2026-11-11T00:29:00+01:00'))).toBe(true)
    expect(isOnAir(paris('2026-11-11T00:30:00+01:00'))).toBe(false)
    expect(isOnAir(paris('2026-11-11T10:00:00+01:00'))).toBe(false)
    // hors antenne : la prochaine soirée, ce soir à 18 h
    const next = currentEvening(paris('2026-11-11T10:00:00+01:00'))
    expect(next).toMatchObject({ day: '2026-11-11', onAir: false })
    expect(next.start.toISOString()).toBe('2026-11-11T17:00:00.000Z')
    // à 0 h 15 : la soirée de la veille, en cours
    expect(currentEvening(paris('2026-11-11T00:15:00+01:00'))).toMatchObject({ day: '2026-11-10', onAir: true })
  })

  it('créneau : début entre 18 h et 0 h 30 exclu, fin à 0 h 30 au plus tard', () => {
    expect(broadcastEvening(paris('2026-11-10T18:00:00+01:00'))).toBe('2026-11-10')
    expect(broadcastEvening(paris('2026-11-11T00:25:00+01:00'))).toBe('2026-11-10')
    expect(broadcastEvening(paris('2026-11-11T00:30:00+01:00'))).toBeNull()
    expect(broadcastEvening(paris('2026-11-10T17:55:00+01:00'))).toBeNull()
    expect(broadcastEvening(paris('2026-11-10T10:00:00+01:00'))).toBeNull()
    expect(broadcastEvening(new Date('nope'))).toBeNull()

    expect(slotOutsideBroadcast(paris('2026-11-10T18:00:00+01:00'), 390)).toBeNull()
    expect(slotOutsideBroadcast(paris('2026-11-10T23:45:00+01:00'), 45)).toBeNull()
    expect(slotOutsideBroadcast(paris('2026-11-11T00:25:00+01:00'), 5)).toBeNull()
    expect(slotOutsideBroadcast(paris('2026-11-10T18:00:00+01:00'), 391)).toMatch(/après la fin de l'antenne.*390 min au plus/)
    expect(slotOutsideBroadcast(paris('2026-11-10T23:45:00+01:00'), 60)).toBe(
      "Ce créneau finirait à 00:45, après la fin de l'antenne (0 h 30) : 45 min au plus à partir de 23:45.",
    )
    expect(slotOutsideBroadcast(paris('2026-11-10T17:50:00+01:00'), 30)).toMatch(/^La chaîne diffuse tous les jours de 18 h – 0 h 30/)
    expect(slotOutsideBroadcast(paris('2026-11-11T00:30:00+01:00'), 10)).toMatch(/date du lendemain/)
  })

  it('journée TV de la grille et de l’administration : de 0 h 30 à 0 h 30 le lendemain', () => {
    expect(tvDayStart('2026-11-10').toISOString()).toBe('2026-11-09T23:30:00.000Z')
    // nuit du passage à l'heure d'hiver : 0 h 30 n'est jamais ambiguë
    expect(tvDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:30:00.000Z')
    expect(tvDayStart('2026-10-26').toISOString()).toBe('2026-10-25T23:30:00.000Z')
  })
})
