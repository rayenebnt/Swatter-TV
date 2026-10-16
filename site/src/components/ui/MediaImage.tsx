import Image from 'next/image'
import { mediaAlt, mediaFocal, mediaSize, mediaUrl, type MediaRef, type MediaSize } from '@/lib/media'

/**
 * Image d'un média Payload via next/image (AVIF/WebP, tailles adaptées).
 * `fill` : l'image remplit son parent (qui doit être positionné).
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
}: {
  media: MediaRef
  size?: MediaSize
  alt?: string
  fill?: boolean
  sizes?: string
  priority?: boolean
  className?: string
  /** `priority` : image principale de la page (préchargée) */
  /** URL utilisée si le média est absent (ex. image externe importée par RSS) */
  fallbackSrc?: string | null
}) {
  const src = mediaUrl(media, size) || fallbackSrc
  if (!src) return null
  const external = /^https?:\/\//.test(src) && !src.includes('i.ytimg.com')
  const { width, height } = mediaSize(media, size)
  const common = {
    src,
    className,
    preload: priority,
    fetchPriority: priority ? ('high' as const) : undefined,
    sizes,
    unoptimized: external,
    style: { objectPosition: mediaFocal(media) },
  }
  const altText = alt ?? mediaAlt(media)
  return fill ? <Image {...common} alt={altText} fill /> : <Image {...common} alt={altText} width={width} height={height} />
}
