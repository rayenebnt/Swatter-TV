'use client'
// Préférences de l'internaute qui interdisent les lectures automatiques (aperçus animés, direct sans le son) :
// « réduire les animations » et économie de données. Valeur « serveur » toujours neutre (false) : aucune différence
// d'hydratation, la vraie valeur arrive juste après.
import { useSyncExternalStore } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'
/** Souris ou pavé tactile : le survol existe (sinon, écran tactile). */
export const FINE_POINTER = '(hover: hover) and (pointer: fine)'

type Connection = EventTarget & { saveData?: boolean }
const connection = (): Connection | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Connection }).connection)

/** Économie de données demandée (navigator.connection.saveData, Chrome et Android). */
export const saveData = () => connection()?.saveData === true

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
