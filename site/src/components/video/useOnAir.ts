'use client'

import { isOnAir } from '@/lib/broadcast'
import { useNow } from './useNow'

// L'antenne vue du navigateur : les pages sont mises en cache (revalidate 60) et les onglets restent ouverts, donc la
// bascule de 18 h et de 0 h 30 se décide aussi ici, sur l'horloge partagée de useNow (pas de 15 s).

/**
 * La chaîne est à l'antenne (18 h – 0 h 30, heure de Paris) ; null au rendu serveur et à l'hydratation : ce qui n'en
 * dépend que dans le navigateur (point rouge de la navigation) n'apparaît qu'après.
 */
export function useOnAir(): boolean | null {
  const now = useNow()
  return now === null ? null : isOnAir(new Date(now))
}

/**
 * Heure (ms) des calculs de l'antenne : `at` (instant du rendu serveur, OnAirData.at) au premier rendu, pour un rendu
 * identique à celui du serveur, puis l'heure du navigateur.
 */
export function useAirNow(at: string): number {
  const now = useNow()
  return now ?? Date.parse(at)
}
