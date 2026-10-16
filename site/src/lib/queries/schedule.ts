// Grille des programmes : requêtes partagées (héros « en ce moment », page Direct, grille TV).
// L'agent « programme » peut AJOUTER des fonctions ici, sans modifier la signature de celles-ci.
import type { Program, Schedule } from '@/payload-types'
import { labelOf, PROGRAM_GENRES } from '../categories'
import { mediaUrl } from '../media'
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

/** Programme en cours et suivants. */
export async function getOnAir(now = new Date(), nextCount = 3): Promise<{ current: Slot | null; next: Slot[] }> {
  const slots = await getScheduleBetween(now, new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const t = now.getTime()
  const current = slots.find((s) => new Date(s.start).getTime() <= t && new Date(s.end).getTime() > t) ?? null
  const next = slots.filter((s) => new Date(s.start).getTime() > t).slice(0, nextCount)
  return { current, next }
}
