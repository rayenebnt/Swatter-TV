import { cache } from 'react'
import type { Meteo, Setting } from '@/payload-types'
import { getPayloadClient } from '../payload'
import { safe } from '../safe'

/** Réglages du site (mis en cache pour la durée d'un rendu). */
export const getSettings = cache(async (): Promise<Setting | null> =>
  safe(async () => (await getPayloadClient()).findGlobal({ slug: 'settings', depth: 1 }), null, 'réglages', { outage: 'fallback' }),
)

export const getMeteoGlobal = cache(async (): Promise<Meteo | null> =>
  safe(async () => (await getPayloadClient()).findGlobal({ slug: 'meteo', depth: 0 }), null, 'météo'),
)
