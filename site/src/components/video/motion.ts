'use client'
// Préférences de l'internaute qui interdisent les lectures automatiques (aperçus animés, direct sans le son) :
// « réduire les animations » et économie de données ; pour les aperçus seulement, la commande « Arrêter les aperçus
// animés » du pied de page (WCAG 2.2.2), mémorisée dans le navigateur. Valeur « serveur » toujours neutre : aucune
// différence d'hydratation, la vraie valeur arrive juste après. Aussi : capacités de l'appareil qui fixent le nombre
// d'aperçus lus en même temps (previewLimit de preview-director.ts).
import { useSyncExternalStore } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'
/**
 * Petit écran (téléphone, point de rupture mobile du site, ou téléphone en paysage : 500 px de haut au plus) : moins
 * d'aperçus lus en même temps.
 */
export const SMALL_SCREEN = '(max-width: 760px), (max-height: 500px)'

/** Aperçus arrêtés par l'internaute : clé du stockage local (valeur « arretes », absente sinon). */
export const PREVIEWS_KEY = 'swatter-apercus'
/** Événement window émis à chaque changement de ce choix sur la page (la commande du pied de page). */
export const PREVIEWS_EVENT = 'swatter:apercus'
const STOPPED = 'arretes'

type Connection = EventTarget & { saveData?: boolean }
const connection = (): Connection | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Connection }).connection)

/** Économie de données demandée (navigator.connection.saveData, Chrome et Android). */
export const saveData = () => connection()?.saveData === true

/** Mémoire de l'appareil en Go (navigator.deviceMemory, Chrome : 0,25 à 8), inconnue ailleurs. */
export const deviceMemory = (): number | undefined => {
  const value = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof value === 'number' && value > 0 ? value : undefined
}

/**
 * Lecture automatique permise : ni « réduire les animations », ni économie de données (lecture ponctuelle, hors rendu).
 * Vaut pour le direct lancé seul (VideoPlayer) comme pour les aperçus.
 */
export const autoplayAllowed = () => !window.matchMedia(REDUCED).matches && !saveData()

/**
 * Choix fait sur la page alors que le stockage le refuse (navigation privée stricte, stockage plein) : il l'emporte sur
 * le choix enregistré jusqu'au prochain chargement.
 */
let stoppedHere: boolean | null = null

/** Aperçus animés arrêtés par l'internaute (commande du pied de page) ; false sans choix ou si le stockage est illisible. */
export function previewsStopped(): boolean {
  if (stoppedHere !== null) return stoppedHere
  try {
    return window.localStorage.getItem(PREVIEWS_KEY) === STOPPED
  } catch {
    return false
  }
}

/** Arrête (true) ou relance (false) les aperçus animés de tout le site : choix mémorisé, page prévenue aussitôt. */
export function setPreviewsStopped(stopped: boolean) {
  try {
    if (stopped) window.localStorage.setItem(PREVIEWS_KEY, STOPPED)
    else window.localStorage.removeItem(PREVIEWS_KEY)
    stoppedHere = null
  } catch {
    // stockage bloqué ou plein : le choix vaut pour la page en cours
    stoppedHere = stopped
  }
  window.dispatchEvent(new Event(PREVIEWS_EVENT))
}

/** Aperçus animés permis : lecture automatique permise (autoplayAllowed) et aperçus non arrêtés par l'internaute. */
export const previewsAllowed = () => autoplayAllowed() && !previewsStopped()

/**
 * Abonnement aux changements de ces préférences (système, économie de données, commande du pied de page, y compris
 * depuis un autre onglet) ; renvoie la fonction de désabonnement.
 */
export function onAutoplayPrefsChange(cb: () => void): () => void {
  const mq = window.matchMedia(REDUCED)
  const conn = connection()
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PREVIEWS_KEY && e.key !== null) return
    // choix changé dans un autre onglet : plus récent que celui gardé pour cette page
    stoppedHere = null
    cb()
  }
  mq.addEventListener('change', cb)
  conn?.addEventListener?.('change', cb)
  window.addEventListener(PREVIEWS_EVENT, cb)
  window.addEventListener('storage', onStorage)
  return () => {
    mq.removeEventListener('change', cb)
    conn?.removeEventListener?.('change', cb)
    window.removeEventListener(PREVIEWS_EVENT, cb)
    window.removeEventListener('storage', onStorage)
  }
}

const serverFalse = () => false

/** Lecture automatique permise, mise à jour si les préférences changent. */
export const useAutoplayAllowed = () => useSyncExternalStore(onAutoplayPrefsChange, autoplayAllowed, serverFalse)

/** Aperçus arrêtés par l'internaute, mis à jour aussitôt ; false au premier rendu (serveur et hydratation). */
export const usePreviewsStopped = () => useSyncExternalStore(onAutoplayPrefsChange, previewsStopped, serverFalse)
