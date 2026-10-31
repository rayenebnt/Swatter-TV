'use client'
// Préférences de l'internaute qui interdisent les lectures automatiques (aperçus animés, direct sans le son) :
// « réduire les animations » et économie de données. Valeur « serveur » toujours neutre (false) : aucune différence
// d'hydratation, la vraie valeur arrive juste après. Aussi : capacités de l'appareil qui fixent le nombre d'aperçus
// lus en même temps (previewLimit de preview-director.ts).
import { useSyncExternalStore } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'
/** Petit écran (téléphone, point de rupture mobile du site) : moins d'aperçus lus en même temps. */
export const SMALL_SCREEN = '(max-width: 760px)'

type Connection = EventTarget & { saveData?: boolean }
const connection = (): Connection | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Connection }).connection)

/** Économie de données demandée (navigator.connection.saveData, Chrome et Android). */
export const saveData = () => connection()?.saveData === true

/** Mémoire de l'appareil en Go (navigator.deviceMemory, Chrome : 0,25 à 8), inconnue ailleurs. */
export const deviceMemory = (): number | undefined => {
  const value = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof value === 'number' && value > 0 ? value : undefined
}

/** Lecture automatique permise : ni « réduire les animations », ni économie de données (lecture ponctuelle, hors rendu). */
export const autoplayAllowed = () => !window.matchMedia(REDUCED).matches && !saveData()

/** Abonnement aux changements de ces préférences ; renvoie la fonction de désabonnement. */
export function onAutoplayPrefsChange(cb: () => void): () => void {
  const mq = window.matchMedia(REDUCED)
  const conn = connection()
  mq.addEventListener('change', cb)
  conn?.addEventListener?.('change', cb)
  return () => {
    mq.removeEventListener('change', cb)
    conn?.removeEventListener?.('change', cb)
  }
}

const serverFalse = () => false

/** Lecture automatique permise, mise à jour si les préférences changent. */
export const useAutoplayAllowed = () => useSyncExternalStore(onAutoplayPrefsChange, autoplayAllowed, serverFalse)
