// Replays : requêtes partagées (accueil, page Replay, fiche d'un replay).
import type { Where } from 'payload'
import { cache } from 'react'
import type { Program, Replay } from '@/payload-types'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'

/** Champs utiles aux cartes et rails (sans la source vidéo). L'émission est chargée (depth 1). */
export type ReplayListItem = Pick<Replay, 'id' | 'title' | 'slug' | 'program' | 'thumbnail' | 'broadcastAt' | 'duration' | 'description'>

export type ReplaysPage = { docs: ReplayListItem[]; page: number; totalPages: number; totalDocs: number }

const LIST_SELECT = {
  title: true,
  slug: true,
  program: true,
  thumbnail: true,
  broadcastAt: true,
  duration: true,
  description: true,
} as const

/** Émission liée, si elle est chargée. */
export const programOf = (r: Pick<Replay, 'program'>): Program | null => (typeof r.program === 'object' && r.program ? r.program : null)

async function findReplays(where: Where | undefined, limit: number): Promise<ReplayListItem[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'replays', where, sort: '-broadcastAt', limit, depth: 1, pagination: false, select: LIST_SELECT })
  return res.docs
}

/** Derniers replays diffusés. */
export async function getLatestReplays(limit = 12): Promise<ReplayListItem[]> {
  return safe(() => findReplays(undefined, limit), [], 'derniers replays')
}

/** Page de la liste des replays (filtre facultatif par émission). */
export async function getReplaysPage({ programId, page = 1, limit = 24 }: { programId?: number | null; page?: number; limit?: number }): Promise<ReplaysPage> {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'replays',
        where: programId ? { program: { equals: programId } } : undefined,
        sort: '-broadcastAt',
        limit,
        page,
        depth: 1,
        select: LIST_SELECT,
      })
      return { docs: res.docs, page: res.page ?? page, totalPages: res.totalPages, totalDocs: res.totalDocs }
    },
    { docs: [], page, totalPages: 0, totalDocs: 0 },
    'liste des replays',
  )
}

/** Émissions qui ont au moins un replay, par ordre alphabétique. */
export const getReplayPrograms = cache(async (): Promise<Program[]> =>
  safe(
    async () => {
      const payload = await getPayloadClient()
      const distinct = await payload.findDistinct({ collection: 'replays', field: 'program', depth: 0 })
      const ids = distinct.values
        .map((v) => {
          const p: unknown = v.program
          return typeof p === 'number' ? p : typeof p === 'object' && p !== null && 'id' in p ? Number((p as { id: unknown }).id) : null
        })
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      if (!ids.length) return []
      const res = await payload.find({ collection: 'programs', where: { id: { in: ids } }, sort: 'title', depth: 0, limit: ids.length, pagination: false })
      return res.docs
    },
    [],
    'émissions en replay',
  ),
)

/** Replay complet (source comprise) d'après son adresse. Mis en cache pour la durée d'un rendu. */
export const getReplayBySlug = cache(async (slug: string): Promise<Replay | null> =>
  safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({ collection: 'replays', where: { slug: { equals: slug } }, depth: 1, limit: 1, pagination: false })
      return res.docs[0] ?? null
    },
    null,
    'replay',
  ),
)

/** Autres épisodes de la même émission (hors replay courant). */
export async function getOtherEpisodes(replay: Pick<Replay, 'id' | 'program'>, limit = 12): Promise<ReplayListItem[]> {
  const program = programOf(replay)?.id ?? (typeof replay.program === 'number' ? replay.program : null)
  if (!program) return []
  return safe(() => findReplays({ and: [{ program: { equals: program } }, { id: { not_equals: replay.id } }] }, limit), [], 'autres épisodes')
}

/** Derniers replays hors replay courant (repli quand l'émission n'a pas d'autre épisode). */
export async function getOtherReplays(excludeId: number, limit = 12): Promise<ReplayListItem[]> {
  return safe(() => findReplays({ id: { not_equals: excludeId } }, limit), [], 'autres replays')
}
