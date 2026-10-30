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

/** Proportions (largeur / hauteur) de l'image affichée : taille demandée si elle existe, sinon le fichier d'origine. */
export function mediaRatio(m: MediaRef, size?: MediaSize): number {
  const { width, height } = mediaSize(m, size)
  return width / height
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const percent = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`

/**
 * Position (fraction) du point focal dans une découpe autour de lui : l'image est ramenée à `scaled` pixels sur cet axe,
 * puis `kept` pixels sont gardés, centrés sur le point, mais sans sortir de l'image (calcul de Payload à l'envoi).
 */
function inCrop(focal: number, scaled: number, kept: number): number {
  const start = clamp(focal * scaled - kept / 2, 0, scaled - kept)
  return (focal * scaled - start) / kept
}

/** Point focal (fractions 0-1) dans le fichier affiché : une déclinaison à proportions fixes (card, poster, og) est découpée autour de lui. */
function focalIn(m: Media, size?: MediaSize): { x: number; y: number } {
  const x = (m.focalX ?? 50) / 100
  const y = (m.focalY ?? 50) / 100
  const s = size ? m.sizes?.[size] : null
  if (!s?.url || !s.width || !s.height || !m.width || !m.height) return { x, y }
  const ratio = m.width / m.height
  const target = s.width / s.height
  // Même proportions (hero, ou image déjà au bon format) : rien n'a été coupé
  if (Math.abs(target - ratio) < 0.01) return { x, y }
  // Déclinaison plus étroite : image ramenée à sa hauteur, puis coupée en largeur ; sinon l'inverse
  return target < ratio ? { x: inCrop(x, s.height * ratio, s.width), y } : { x, y: inCrop(y, s.width / ratio, s.height) }
}

const hasFocal = (m: MediaRef): m is Media => isMedia(m) && m.focalX != null && m.focalY != null && !(m.focalX === 50 && m.focalY === 50)

/**
 * Point focal choisi dans l'administration (pour object-position) ; rien si c'est le centre par défaut, pour laisser le CSS cadrer.
 * Avec `size`, position du point dans la déclinaison affichée (découpée autour de lui à l'envoi).
 */
export function mediaFocal(m: MediaRef, size?: MediaSize): string | undefined {
  if (!hasFocal(m)) return undefined
  const { x, y } = focalIn(m, size)
  return `${percent(x)} ${percent(y)}`
}

/** Largeur affichée d'une image de proportions `ratio` qui couvre un cadre (object-fit: cover) : pour l'attribut sizes. */
export const coverWidth = (frameWidth: number, frameHeight: number, ratio: number) => Math.max(frameWidth, frameHeight * ratio)

/**
 * Cadrage (object-position) qui place le point focal au centre d'un cadre de proportions `frameRatio` (object-fit: cover),
 * contre le bord quand le point en est trop près (jamais de vide). Rien pour le centre par défaut, pour laisser le CSS cadrer.
 */
export function focalCover(m: MediaRef, frameRatio: number, size?: MediaSize): string | undefined {
  if (!hasFocal(m)) return undefined
  const { x, y } = focalIn(m, size)
  const ratio = mediaRatio(m, size)
  // Part visible de l'image sur chaque axe ; object-position p place la fenêtre visible à p × (1 - visible)
  const center = (focal: number, visible: number) => (visible >= 1 ? 0.5 : clamp((focal - visible / 2) / (1 - visible), 0, 1))
  return `${percent(center(x, frameRatio / ratio))} ${percent(center(y, ratio / frameRatio))}`
}
