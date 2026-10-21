'use client'
// Espace membres côté navigateur : état « connecté » (cookie témoin) et appels à l'API /api/compte.
import { useSyncExternalStore } from 'react'
import { HINT_COOKIE } from './shared'

const subscribers = new Set<() => void>()
const readHint = () => typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c === `${HINT_COOKIE}=1`)

/** À appeler après une connexion ou une déconnexion faite dans la page : met à jour les composants abonnés. */
export function notifyMemberChange() {
  for (const fn of subscribers) fn()
}

/**
 * Vrai si un membre semble connecté (cookie témoin) ; faux au rendu serveur et à l'hydratation, puis lu dans le navigateur.
 * Simple indication pour l'affichage : chaque action est vérifiée par le serveur (session signée).
 */
export function useMemberHint(): boolean {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
    readHint,
    () => false,
  )
}
export const hasMemberHint = readHint

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; errors?: Record<string, string>; code?: string }

/** Appel JSON à l'API de l'espace membres, erreurs en français. */
export async function memberApi<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/compte${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as (T & { error?: string; errors?: Record<string, string>; code?: string }) | null
    if (res.status === 401) notifyMemberChange()
    if (res.ok) return { ok: true, data: (json ?? {}) as T }
    return { ok: false, status: res.status, error: json?.error ?? 'Une erreur est survenue. Réessayez dans un instant.', errors: json?.errors, code: json?.code }
  } catch {
    return { ok: false, status: 0, error: 'Connexion interrompue. Vérifiez votre réseau et réessayez.' }
  }
}
