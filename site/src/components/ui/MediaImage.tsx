import Image, { getImageProps } from 'next/image'
import type { CSSProperties } from 'react'
import { mediaAlt, mediaFocal, mediaSize, mediaUrl, type MediaRef, type MediaSize } from '@/lib/media'

/** Écrans où s'applique la source mobile (même seuil que les feuilles de style). */
export const MOBILE_MEDIA = '(max-width: 760px)'

/** Source « téléphone » d'une image (direction artistique) : autre média, ou le même dans une autre taille et un autre cadrage. */
export type MobileSource = {
  media: MediaRef
  size?: MediaSize
  /** Largeur affichée sur téléphone (attribut sizes) */
  sizes: string
  /** URL utilisée si le média est absent */
  fallbackSrc?: string | null
  /** Cadrage sur téléphone (object-position) ; par défaut, le point focal du média */
  position?: string
}

// Images servies par un autre site (stockage S3 direct) : pas d'optimisation ; vignettes YouTube : optimisées (remotePatterns)
const isExternal = (src: string) => /^https?:\/\//.test(src) && !src.includes('i.ytimg.com')

/**
 * Image d'un média Payload via next/image (AVIF/WebP, tailles adaptées).
 * `fill` : l'image remplit son parent (qui doit être positionné).
 * `mobile` : autre source sous 760 px (<picture>) ; le cadrage de chaque source passe par les variables CSS --focal et
 * --focal-m (classe .img-mobile de globals.css), un style en ligne valant pour les deux.
 */
export function MediaImage({
  media,
  size,
  alt,
  fill = false,
  sizes = '(max-width: 760px) 90vw, 400px',
  priority = false,
  className,
  fallbackSrc,
  mobile,
}: {
  media: MediaRef
  size?: MediaSize
  alt?: string
  fill?: boolean
  sizes?: string
  /** `priority` : image principale de la page (préchargée) */
  priority?: boolean
  className?: string
  /** URL utilisée si le média est absent (visuel de repli) */
  fallbackSrc?: string | null
  mobile?: MobileSource
}) {
  const src = mediaUrl(media, size) || fallbackSrc
  if (!src) return null
  const altText = alt ?? mediaAlt(media)
  const mobileSrc = mobile ? mediaUrl(mobile.media, mobile.size) || mobile.fallbackSrc : null

  if (mobile && mobileSrc) {
    const box = (m: MediaRef, s?: MediaSize) => (fill ? { fill: true } : mediaSize(m, s))
    // Une seule image téléchargée, celle de la source retenue : chargement immédiat et prioritaire sans risque de doublon,
    // mais pas de préchargement (<link> dans <head>), qui ne connaîtrait que l'image bureau
    const urgency = priority ? ({ loading: 'eager', fetchPriority: 'high' } as const) : {}
    const desktop = getImageProps({ src, alt: altText, sizes, unoptimized: isExternal(src), ...box(media, size), ...urgency }).props
    const phone = getImageProps({ src: mobileSrc, alt: altText, sizes: mobile.sizes, unoptimized: isExternal(mobileSrc), ...box(mobile.media, mobile.size) }).props
    const style = { ...desktop.style, '--focal': mediaFocal(media, size), '--focal-m': mobile.position ?? mediaFocal(mobile.media, mobile.size) } as CSSProperties
    return (
      <picture>
        <source media={MOBILE_MEDIA} srcSet={phone.srcSet ?? phone.src} sizes={phone.sizes} width={phone.width} height={phone.height} />
        <img {...desktop} alt={altText} className={['img-mobile', className].filter(Boolean).join(' ')} style={style} />
      </picture>
    )
  }

  const { width, height } = mediaSize(media, size)
  const common = {
    src,
    className,
    // Next 16 : preload seul pour l'image principale (ne pas le combiner avec fetchPriority ni loading)
    preload: priority,
    sizes,
    unoptimized: isExternal(src),
    style: { objectPosition: mediaFocal(media, size) },
  }
  return fill ? <Image {...common} alt={altText} fill /> : <Image {...common} alt={altText} width={width} height={height} />
}
