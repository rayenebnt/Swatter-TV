'use client'

import type { ReactNode } from 'react'
import { onAirState, type OnAirData } from '@/lib/on-air'
import type { Slot } from '@/lib/queries/schedule'
import { LiveOff } from './LiveOff'
import { useAirNow } from './useOnAir'
import { VideoPlayer, type VideoPlayerProps } from './VideoPlayer'

/**
 * Scène de la page Direct : le lecteur pendant l'antenne (18 h – 0 h 30), l'écran « Le direct reprend ce soir à 18 h »
 * en dehors. Décidé dans le navigateur (page en cache, onglet resté ouvert) : à 0 h 30 le lecteur laisse place à l'écran
 * hors antenne, à 18 h il apparaît (lecture automatique sans le son, selon les règles du lecteur). Premier rendu : l'état
 * du rendu serveur (OnAirData.at). `player` null : direct coupé dans les réglages ou sans flux, « Le direct reprend bientôt »
 * à toute heure.
 */
export function DirectStage({
  data,
  player,
  poster,
}: {
  data: OnAirData<Slot>
  player: Omit<VideoPlayerProps, 'title' | 'live' | 'autoPlay'> | null
  /** Image de fond de l'écran sans lecteur (rendue côté serveur) */
  poster: ReactNode
}) {
  const now = useAirNow(data.at)
  const state = onAirState(data.slots, now)
  if (player && state.onAir) {
    const title = state.current ? `Swatter TV Info en direct : ${state.current.title}` : 'Swatter TV Info en direct'
    // autoPlay : le direct démarre seul, sans le son, quand il est visible (lecteurs tiers : contenus externes acceptés)
    return <VideoPlayer {...player} title={title} live autoPlay />
  }
  return <LiveOff poster={poster} state={state} now={now} cut={!player} />
}
