// Webcams : requêtes partagées (section de l'accueil, page Webcams).
import { cache } from 'react'
import type { Webcam } from '@/payload-types'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'

export type WebcamItem = Pick<Webcam, 'id' | 'name' | 'place' | 'slug' | 'provider' | 'embedUrl' | 'image' | 'temperature'>

const SELECT = { name: true, place: true, slug: true, provider: true, embedUrl: true, image: true, temperature: true } as const

/** Webcams actives, dans l'ordre choisi dans l'administration (toutes si `limit` est omis). */
export const getActiveWebcams = cache(
  async (limit?: number): Promise<WebcamItem[]> =>
    safe(
      async () => {
        const payload = await getPayloadClient()
        const res = await payload.find({
          collection: 'webcams',
          // « Active » est cochée par défaut : une valeur absente compte comme active
          where: { or: [{ active: { equals: true } }, { active: { exists: false } }] },
          sort: ['order', 'name'],
          limit: limit ?? 100,
          depth: 1,
          pagination: false,
          select: SELECT,
        })
        return res.docs
      },
      [],
      'webcams',
    ),
)
