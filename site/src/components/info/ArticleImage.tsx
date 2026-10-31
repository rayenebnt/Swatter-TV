import Image, { getImageProps } from 'next/image'
import type { CSSProperties } from 'react'
import { WholeFrame } from '@/components/ui/MediaImage'
import { ratioOrientation } from '@/lib/media'
import type { ImageData } from './utils'

/**
 * Image d'article via next/image (utilisable côté serveur et client).
 * Par défaut l'image remplit son parent positionné (`.media`) ; avec `width`/`height`, taille fixe (vignettes).
 * `whole` : photo entière sur fond flou quand le cadre en couperait trop (WholeFrame, cadres aux proportions variables) ;
 * l'image doit garder les proportions de la photo (« hero », pas la découpe « card »). Le visuel de repli couvre toujours
 * son cadre.
 */
export function ArticleImage({
  image,
  sizes,
  alt,
  width,
  height,
  priority = false,
  whole = false,
}: {
  image: ImageData
  sizes?: string
  /** Remplace le texte alternatif du média (ex. "" pour une vignette décorative) */
  alt?: string
  width?: number
  height?: number
  /** Image principale de la page (préchargée) */
  priority?: boolean
  whole?: boolean
}) {
  const common = {
    src: image.src,
    unoptimized: image.unoptimized,
    // Next 16 : preload seul pour l'image principale (ne pas le combiner avec fetchPriority ni loading)
    preload: priority,
    style: image.position ? { objectPosition: image.position } : undefined,
  }
  const text = alt ?? image.alt
  if (whole && !image.fallback && !(width && height)) {
    // Deux images aux mêmes sources : chargement immédiat et prioritaire plutôt qu'un préchargement
    const urgency = priority ? ({ loading: 'eager', fetchPriority: 'high' } as const) : {}
    const img = getImageProps({ src: image.src, unoptimized: image.unoptimized, alt: text, fill: true, sizes, ...urgency }).props
    return <WholeFrame img={img} orientation={ratioOrientation(image.width / image.height)} style={{ '--focal': image.position } as CSSProperties} />
  }
  return width && height ? <Image {...common} alt={text} width={width} height={height} sizes={sizes} /> : <Image {...common} alt={text} fill sizes={sizes} />
}
