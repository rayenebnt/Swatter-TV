// Petits hooks partagés par les composants client du haut de l'accueil.
// Valeur « serveur » toujours neutre (false) : aucune différence d'hydratation, la vraie valeur arrive juste après.
import { useSyncExternalStore } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'

/** Préférence « réduire les animations » (lecture ponctuelle, hors rendu). */
export const prefersReducedMotion = () => window.matchMedia(REDUCED).matches

const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const serverFalse = () => false

/** Préférence « réduire les animations », mise à jour si elle change. */
export const useReducedMotion = () => useSyncExternalStore(subscribeReduced, prefersReducedMotion, serverFalse)

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
const pageHidden = () => document.hidden

/** Onglet masqué (document.hidden). */
export const usePageHidden = () => useSyncExternalStore(subscribeVisibility, pageHidden, serverFalse)

const noSubscribe = () => () => {}
const clientTrue = () => true

/** false au rendu serveur et pendant l'hydratation, true ensuite. */
export const useHydrated = () => useSyncExternalStore(noSubscribe, clientTrue, serverFalse)
