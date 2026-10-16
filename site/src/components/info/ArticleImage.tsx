import Image from 'next/image'
import type { ImageData } from './utils'

/**
 * Image d'article via next/image (utilisable côté serveur et client).
 * Par défaut l'image remplit son parent positionné (`.media`) ; avec `width`/`height`, taille fixe (vignettes).
 */
export function ArticleImage({
  image,
  sizes,
  alt,
  width,
  height,
  priority = false,
}: {
  image: ImageData
  sizes?: string
  /** Remplace le texte alternatif du média (ex. "" pour une vignette décorative) */
  alt?: string
  width?: number
  height?: number
  /** Image principale de la page (préchargée) */
  priority?: boolean
}) {
  const common = {
    src: image.src,
    alt: alt ?? image.alt,
    unoptimized: image.unoptimized,
    // Next 16 : preload seul pour l'image principale (ne pas le combiner avec fetchPriority ni loading)
    preload: priority,
    style: image.position ? { objectPosition: image.position } : undefined,
  }
  return width && height ? <Image {...common} width={width} height={height} sizes={sizes} /> : <Image {...common} fill sizes={sizes} />
}
