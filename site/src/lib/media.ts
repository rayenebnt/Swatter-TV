import type { Media } from '@/payload-types'

export type MediaRef = Media | number | string | null | undefined
export type MediaSize = 'thumb' | 'card' | 'poster' | 'hero' | 'og'

const isMedia = (m: MediaRef): m is Media => typeof m === 'object' && m !== null

/**
 * Payload renvoie des URL absolues (serverURL) : on garde le chemin pour les fichiers qu'il sert lui-même,
 * afin que next/image les optimise (localPatterns /api/media/file/**). Pour une URL absolue (JSON-LD), passer par absoluteUrl().
 */
function toLocalPath(url: string): string {
  if (url.startsWith('/')) return url
  try {
    const u = new URL(url)
    if (u.pathname.startsWith('/api/media/file/')) return `${u.pathname}${u.search}`
  } catch {
    // URL non analysable : renvoyée telle quelle
  }
  return url
}

/** URL d'un média Payload (taille optimisée si disponible), en chemin local. Les relations doivent être chargées (depth ≥ 1). */
export function mediaUrl(m: MediaRef, size?: MediaSize): string | null {
  if (!isMedia(m)) return null
  const url = (size ? m.sizes?.[size]?.url : null) || m.url
  return url ? toLocalPath(url) : null
}

export function mediaAlt(m: MediaRef, fallback = ''): string {
  return isMedia(m) ? m.alt || fallback : fallback
}

export function mediaSize(m: MediaRef, size?: MediaSize): { width: number; height: number } {
  if (!isMedia(m)) return { width: 1600, height: 900 }
  const s = size ? m.sizes?.[size] : null
  return { width: s?.width || m.width || 1600, height: s?.height || m.height || 900 }
}

/** Point focal choisi dans l'administration (pour object-position) ; rien si c'est le centre par défaut, pour laisser le CSS cadrer. */
export function mediaFocal(m: MediaRef): string | undefined {
  if (!isMedia(m) || m.focalX == null || m.focalY == null) return undefined
  if (m.focalX === 50 && m.focalY === 50) return undefined
  return `${m.focalX}% ${m.focalY}%`
}
