// Grille des programmes : requêtes partagées (héros « en ce moment », page Direct, grille TV). L'antenne (18 h – 0 h 30) :
// getOnAirData / getOnAir, sur la logique pure de src/lib/on-air.ts.
// L'agent « programme » peut AJOUTER des fonctions ici, sans modifier la signature de celles-ci.
import type { Program, Schedule } from '@/payload-types'
import { currentEvening, shiftDay } from '../broadcast'
import { labelOf, PROGRAM_GENRES } from '../categories'
import { mediaUrl } from '../media'
import { eveningSlots, eveningSpan, onAirState, type OnAirData } from '../on-air'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'

/** Créneau sérialisable (peut être passé tel quel à un composant client). Dates en ISO 8601. */
export type Slot = {
  id: number
  title: string
  start: string
  end: string
  durationMinutes: number
  genre: string | null
  genreLabel: string
  synopsis: string | null
  image: string | null
  programSlug: string | null
  isPremiere: boolean
}

const MAX_DURATION_MS = 10 * 60 * 60 * 1000

export function toSlot(s: Schedule): Slot {
  const p: Program | null = typeof s.program === 'object' && s.program ? s.program : null
  const start = new Date(s.startsAt)
  const end = new Date(start.getTime() + (s.durationMinutes || 0) * 60_000)
  return {
    id: s.id,
    title: s.titleOverride || p?.title || 'Programme',
    start: start.toISOString(),
    end: end.toISOString(),
    durationMinutes: s.durationMinutes,
    genre: p?.genre ?? null,
    genreLabel: p?.genre ? labelOf(PROGRAM_GENRES, p.genre) : '',
    synopsis: p?.synopsis ?? null,
    image: mediaUrl(p?.image, 'card'),
    programSlug: p?.slug ?? null,
    isPremiere: Boolean(p?.isPremiere),
  }
}

/** Créneaux qui chevauchent l'intervalle [from, to[, triés par heure de début. */
export async function getScheduleBetween(from: Date, to: Date): Promise<Slot[]> {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'schedule',
        where: {
          and: [
            { startsAt: { greater_than_equal: new Date(from.getTime() - MAX_DURATION_MS).toISOString() } },
            { startsAt: { less_than: to.toISOString() } },
          ],
        },
        sort: 'startsAt',
        depth: 2,
        limit: 1000,
        pagination: false,
      })
      return res.docs.map(toSlot).filter((s) => new Date(s.end) > from)
    },
    [],
    'grille des programmes',
  )
}

/**
 * Programme de l'antenne autour de `now` (accueil, page Direct) : la soirée en cours ou à venir (de 0 h 30 à 18 h, celle
 * qui commence à 18 h le jour même) et la suivante, pour que le navigateur trouve encore ses créneaux après la bascule de
 * 0 h 30 (page servie depuis le cache, onglet resté ouvert). Créneaux rognés aux bornes de leur soirée (fin ramenée à
 * 0 h 30, début à 18 h) ; un ancien créneau entièrement hors antenne (06:00, 12:00…) est ignoré.
 */
export async function getOnAirData(now = new Date()): Promise<OnAirData<Slot>> {
  const { day } = currentEvening(now)
  const following = shiftDay(day, 1)
  const evening = eveningSpan(day)
  const raw = await getScheduleBetween(new Date(evening.start), new Date(eveningSpan(following).end))
  return { at: now.toISOString(), evening, slots: eveningSlots(raw, [day, following]) }
}

/**
 * Programme en cours (seulement pendant l'antenne, de 18 h à 0 h 30) et `nextCount` suivants (soirée en cours ou à venir,
 * puis la suivante), d'après getOnAirData.
 */
export async function getOnAir(now = new Date(), nextCount = 3): Promise<{ current: Slot | null; next: Slot[] }> {
  const { slots } = await getOnAirData(now)
  const { current, upcoming } = onAirState(slots, now.getTime())
  return { current, next: upcoming.slice(0, nextCount) }
}
