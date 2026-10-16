import type { Media } from '@/payload-types'

export type MediaRef = Media | number | string | null | undefined
export type MediaSize = 'thumb' | 'card' | 'poster' | 'hero'

const isMedia = (m: MediaRef): m is Media => typeof m === 'object' && m !== null

/** URL d'un média Payload (taille optimisée si disponible). Les relations doivent être chargées (depth ≥ 1). */
export function mediaUrl(m: MediaRef, size?: MediaSize): string | null {
  if (!isMedia(m)) return null
  const sized = size ? m.sizes?.[size]?.url : null
  return sized || m.url || null
}

export function mediaAlt(m: MediaRef, fallback = ''): string {
  return isMedia(m) ? m.alt || fallback : fallback
}

export function mediaSize(m: MediaRef, size?: MediaSize): { width: number; height: number } {
  if (!isMedia(m)) return { width: 1600, height: 900 }
  const s = size ? m.sizes?.[size] : null
  return { width: s?.width || m.width || 1600, height: s?.height || m.height || 900 }
}

/** Point focal (pour object-position). */
export function mediaFocal(m: MediaRef): string | undefined {
  if (!isMedia(m) || m.focalX == null || m.focalY == null) return undefined
  return `${m.focalX}% ${m.focalY}%`
}
