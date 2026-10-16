'use client'

import { useSyncExternalStore } from 'react'

// Horloge partagée de la rubrique : null au premier rendu (serveur et hydratation), puis l'heure courante à la minute.
// Une seule minuterie pour tous les composants abonnés, suspendue quand l'onglet est caché.
const STEP = 60_000
let now = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

const minute = () => Math.floor(Date.now() / STEP) * STEP

function tick() {
  const next = minute()
  if (next === now) return
  now = next
  listeners.forEach((l) => l())
}

function start() {
  if (timer === undefined && !document.hidden) timer = setInterval(tick, STEP / 4)
}

function stop() {
  clearInterval(timer)
  timer = undefined
}

function onVisibility() {
  if (document.hidden) stop()
  else {
    tick()
    start()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    // premier abonné (ou retour sur une page après une pause) : heure rafraîchie, React relit l'instantané après l'abonnement
    now = minute()
    document.addEventListener('visibilitychange', onVisibility)
    start()
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }
}

function getSnapshot() {
  if (!now) now = minute()
  return now
}

const getServerSnapshot = () => null

/** Heure courante (ms, arrondie à la minute), ou null tant que le composant n'est pas hydraté. */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot)
}
