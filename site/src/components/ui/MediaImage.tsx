import Image, { getImageProps } from 'next/image'
import type { CSSProperties } from 'react'
import { mediaAlt, mediaFocal, mediaOrientation, mediaSize, mediaUrl, type MediaRef, type MediaSize, type Orientation } from '@/lib/media'

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

/**
 * Photo entière sur fond flou : `true` partout, `'phone'` sous 760 px seulement (avec une source `mobile`, c'est elle
 * qui est comparée au cadre).
 */
export type Whole = boolean | 'phone'

// Images servies par un autre site (stockage S3 direct) : pas d'optimisation ; vignettes YouTube : optimisées (remotePatterns)
export const isExternal = (src: string) => /^https?:\/\//.test(src) && !src.includes('i.ytimg.com')

type ImgProps = ReturnType<typeof getImageProps>['props']

/**
 * Cadre « photo entière sur fond flou » (classes .whole de globals.css) : deux images aux mêmes sources, donc un seul
 * fichier téléchargé, dans un conteneur qui couvre son cadre. Tant que le cadre garde l'essentiel de la photo, elle le
 * couvre (cadrage `--focal`) ; quand il en couperait trop (orientation `data-o` comparée aux proportions du cadre par des
 * requêtes de conteneur), elle s'affiche entière sur une version floutée et assombrie d'elle-même.
 * `source` : <source> d'une balise <picture>, reprise à l'identique dans les deux images.
 */
export function WholeFrame({
  img,
  source,
  orientation,
  phone = false,
  className,
  style,
}: {
  img: ImgProps
  source?: ImgProps & { media: string }
  orientation: Orientation
  /** Photo entière sous 760 px seulement (au-delà, elle couvre toujours le cadre) */
  phone?: boolean
  className?: string
  style?: CSSProperties
}) {
  // Fond : décoratif, différé (il ne se charge que s'il s'affiche, et c'est alors le fichier déjà demandé par la photo)
  const backdrop = { ...img, alt: '', 'aria-hidden': true, loading: 'lazy', fetchPriority: undefined, className: 'whole__bg' } as const
  const front = { ...img, className: ['whole__fg', className].filter(Boolean).join(' '), style: { ...img.style, ...style } }
  const pic = (props: ImgProps) =>
    source ? (
      <picture>
        <source media={source.media} srcSet={source.srcSet ?? source.src} sizes={source.sizes} width={source.width} height={source.height} />
        <img {...props} alt={props.alt} />
      </picture>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- propriétés optimisées de getImageProps, reprises par les deux images
      <img {...props} alt={props.alt} />
    )
  return (
    <span className="whole" data-o={orientation} data-whole={phone ? 'phone' : undefined}>
      {pic(backdrop)}
      {pic(front)}
    </span>
  )
}

/**
 * Image d'un média Payload via next/image (AVIF/WebP, tailles adaptées).
 * `fill` : l'image remplit son parent (qui doit être positionné).
 * `mobile` : autre source sous 760 px (<picture>) ; le cadrage de chaque source passe par les variables CSS --focal et
 * --focal-m (classe .img-mobile de globals.css), un style en ligne valant pour les deux.
 * `whole` (avec `fill`) : photo entière sur fond flou quand le cadre en couperait trop (WholeFrame) ; utiliser alors une
 * taille qui garde les proportions de la photo (« hero » ou l'original), pas une découpe (card, poster). Le visuel de
 * repli (paysage du site, sans sujet) couvre toujours son cadre.
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
  whole = false,
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
  whole?: Whole
}) {
  const src = mediaUrl(media, size) || fallbackSrc
  if (!src) return null
  const altText = alt ?? mediaAlt(media)
  const mobileSrc = mobile ? mediaUrl(mobile.media, mobile.size) || mobile.fallbackSrc : null
  // Une seule image téléchargée, celle de la source retenue : chargement immédiat et prioritaire sans risque de doublon,
  // mais pas de préchargement (<link> dans <head>), qui ne connaîtrait qu'une des sources
  const urgency = priority ? ({ loading: 'eager', fetchPriority: 'high' } as const) : {}

  if (mobile && mobileSrc) {
    const box = (m: MediaRef, s?: MediaSize) => (fill ? { fill: true } : mediaSize(m, s))
    const desktop = getImageProps({ src, alt: altText, sizes, unoptimized: isExternal(src), ...box(media, size), ...urgency }).props
    const phone = getImageProps({ src: mobileSrc, alt: altText, sizes: mobile.sizes, unoptimized: isExternal(mobileSrc), ...box(mobile.media, mobile.size) }).props
    const style = { ...desktop.style, '--focal': mediaFocal(media, size), '--focal-m': mobile.position ?? mediaFocal(mobile.media, mobile.size) } as CSSProperties
    // Photo entière : pour une vraie photo seulement (les visuels de repli du site, des paysages, couvrent leur cadre)
    if (whole && fill && mediaUrl(mobile.media, mobile.size)) {
      return (
        <WholeFrame
          img={{ ...desktop, alt: altText }}
          source={{ ...phone, media: MOBILE_MEDIA }}
          orientation={mediaOrientation(mobile.media, mobile.size)}
          phone
          className={['img-mobile', className].filter(Boolean).join(' ')}
          style={style}
        />
      )
    }
    return (
      <picture>
        <source media={MOBILE_MEDIA} srcSet={phone.srcSet ?? phone.src} sizes={phone.sizes} width={phone.width} height={phone.height} />
        <img {...desktop} alt={altText} className={['img-mobile', className].filter(Boolean).join(' ')} style={style} />
      </picture>
    )
  }

  if (whole && fill && mediaUrl(media, size)) {
    const img = getImageProps({ src, alt: altText, sizes, unoptimized: isExternal(src), fill: true, ...urgency }).props
    return <WholeFrame img={img} orientation={mediaOrientation(media, size)} phone={whole === 'phone'} className={className} style={{ '--focal': mediaFocal(media, size) } as CSSProperties} />
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
