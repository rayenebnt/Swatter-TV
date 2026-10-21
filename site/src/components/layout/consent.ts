// Consentement aux cookies (CNIL) : stockage, lecture et événements partagés entre rubriques.
//
// CONTRAT
// - Stockage : localStorage « swatter-consent » = { v: 1, audience, externes, date } (date ISO 8601).
//   Un choix plus vieux que 6 mois, ou d'une autre version, est ignoré : le bandeau est alors reproposé.
// - Événement window « swatter:consent » (CustomEvent<ConsentChoice>) : émis à chaque enregistrement
//   d'un choix (Accepter, Refuser, Enregistrer). `detail` contient le choix complet.
//   Écoute : window.addEventListener(CONSENT_EVENT, (e) => (e as CustomEvent<ConsentChoice>).detail)
//   ou plus simplement le hook useConsent() / la fonction onConsentChange().
// - Événement window « swatter:cookies » (CustomEvent<{ trigger?: HTMLElement | null }>) : rouvre le
//   bandeau sur le panneau « Personnaliser » (bouton « Gestion des cookies » du pied de page, page Vie privée…).
//   Utiliser openCookieSettings(bouton) pour que le focus revienne au bouton à la fermeture.
// - Les contenus externes (YouTube, Twitch, Bunny) ne doivent être chargés que si `externes` est vrai ;
//   la mesure d'audience uniquement si `audience` est vrai. Sans choix enregistré : tout est refusé.
// À importer uniquement depuis un composant client ('use client') : le choix n'existe que dans le navigateur.
import { useSyncExternalStore } from 'react'

export type ConsentChoice = {
  v: 1
  /** Mesure d'audience */
  audience: boolean
  /** Contenus externes : vidéos YouTube, Twitch et Bunny */
  externes: boolean
  /** Date du choix (ISO 8601) */
  date: string
}

export type CookiesEventDetail = { trigger?: HTMLElement | null }

export const CONSENT_KEY = 'swatter-consent'
export const CONSENT_EVENT = 'swatter:consent'
export const COOKIES_EVENT = 'swatter:cookies'

/**
 * Durée de validité d'un choix, accord comme refus : 6 mois (recommandation de la CNIL, durée annoncée sur la page Vie
 * privée). Les cookies de mesure d'audience, eux, vivent 13 mois au plus.
 */
const MAX_AGE_MS = 183 * 24 * 60 * 60 * 1000

/**
 * Choix fait sur la page en cours que le stockage a refusé (navigation privée stricte, stockage plein…). Il l'emporte sur
 * le choix enregistré, plus ancien : un refus ne doit jamais laisser s'appliquer un ancien accord.
 */
let memory: ConsentChoice | null = null

function parse(raw: string | null): ConsentChoice | null {
  if (!raw) return null
  try {
    const c: unknown = JSON.parse(raw)
    if (typeof c !== 'object' || c === null) return null
    const { v, audience, externes, date } = c as Record<string, unknown>
    if (v !== 1 || typeof audience !== 'boolean' || typeof externes !== 'boolean' || typeof date !== 'string') return null
    const t = Date.parse(date)
    if (Number.isNaN(t) || Date.now() - t > MAX_AGE_MS) return null
    return { v: 1, audience, externes, date }
  } catch {
    return null
  }
}

function readRaw(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}

/** Choix enregistré, ou null (aucun choix, expiré, stockage indisponible, rendu serveur). */
export function readConsent(): ConsentChoice | null {
  return memory ?? parse(readRaw())
}

/** Enregistre un choix et prévient toutes les rubriques (événement « swatter:consent »). */
export function writeConsent(choice: { audience: boolean; externes: boolean }): ConsentChoice {
  const c: ConsentChoice = { v: 1, audience: choice.audience, externes: choice.externes, date: new Date().toISOString() }
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(c))
    memory = null
  } catch {
    // stockage bloqué ou plein : le choix vaut pour la page en cours, et l'ancien choix enregistré est effacé si possible
    // (sinon il reviendrait à la page suivante)
    memory = c
    try {
      window.localStorage.removeItem(CONSENT_KEY)
    } catch {
      /* stockage illisible : rien d'enregistré à effacer */
    }
  }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_EVENT, { detail: c }))
  return c
}

/** Rouvre le bandeau cookies sur le panneau « Personnaliser ». */
export function openCookieSettings(trigger?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent<CookiesEventDetail>(COOKIES_EVENT, { detail: { trigger } }))
}

/** Abonnement aux changements de choix (y compris depuis un autre onglet). Renvoie la fonction de désabonnement. */
export function onConsentChange(cb: (choice: ConsentChoice | null) => void): () => void {
  const onEvent = (e: Event) => cb((e as CustomEvent<ConsentChoice>).detail ?? readConsent())
  const onStorage = (e: StorageEvent) => {
    if (e.key !== CONSENT_KEY && e.key !== null) return
    // choix changé dans un autre onglet : plus récent que celui gardé en mémoire sur cette page
    memory = null
    cb(readConsent())
  }
  window.addEventListener(CONSENT_EVENT, onEvent)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CONSENT_EVENT, onEvent)
    window.removeEventListener('storage', onStorage)
  }
}

// Instantané stable pour useSyncExternalStore (même objet tant que le stockage ne change pas).
let lastRaw: string | null | undefined
let lastValue: ConsentChoice | null = null
function snapshot(): ConsentChoice | null {
  const raw = readRaw()
  if (raw !== lastRaw) {
    lastRaw = raw
    lastValue = parse(raw)
  }
  return memory ?? lastValue
}
const subscribe = (notify: () => void) => onConsentChange(() => notify())

/**
 * Choix de l'internaute dans un composant client. Vaut null au premier rendu (serveur et hydratation),
 * puis le choix enregistré : aucun décalage d'hydratation.
 */
export function useConsent(): ConsentChoice | null {
  return useSyncExternalStore(subscribe, snapshot, () => null)
}
