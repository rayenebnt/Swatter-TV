'use client'

import { useSyncExternalStore } from 'react'

// Horloge partagée : null au premier rendu (serveur et hydratation), puis l'heure courante arrondie au pas choisi.
// Mise à jour suspendue quand l'onglet est caché, relancée (et rafraîchie) à son retour.
const STEP = 15_000
let now = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

const round = () => Math.floor(Date.now() / STEP) * STEP

function tick() {
  const next = round()
  if (next === now) return
  now = next
  listeners.forEach((l) => l())
}

function start() {
  if (timer === undefined && !document.hidden) timer = setInterval(tick, STEP / 3)
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
  if (!now) now = round()
  return now
}

/** Heure courante (ms) rafraîchie toutes les 15 s, ou null tant que le composant n'est pas hydraté. */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, () => null)
}
