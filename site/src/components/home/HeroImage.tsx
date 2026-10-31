import { getImageProps } from 'next/image'
import type { CSSProperties } from 'react'
import { isExternal, MOBILE_MEDIA } from '@/components/ui/MediaImage'
import { mediaFocal, mediaRatio, mediaUrl, type MediaRef } from '@/lib/media'
import { HERO_SIZES, heroMobileSource, heroWhole } from './heroMedia'

type ImgProps = ReturnType<typeof getImageProps>['props']

/**
 * Image de fond d'une diapositive (composant serveur) : photo `.slide__photo`, précédée de son fond flou `.slide__backdrop`
 * quand elle s'affiche entière (data-whole de la diapositive, hero.css). Les deux images ont les mêmes sources : un seul
 * fichier téléchargé, quelle que soit la taille de l'écran. Balise <picture> seulement si le téléphone affiche un autre
 * fichier, ou le même à une autre largeur (photo qui couvre le cadre portrait).
 * Géométrie entièrement en CSS : proportions des images (--ratio, --ratio-m) et cadrage de chaque source (--focal, --focal-m).
 */
export function HeroImage({ background, phone, fallbackSrc, priority }: { background: MediaRef; phone: MediaRef; fallbackSrc: string; priority: boolean }) {
  const src = mediaUrl(background, 'hero') || fallbackSrc
  const mobile = heroMobileSource(background, phone, fallbackSrc)
  const mobileSrc = mediaUrl(mobile.media, mobile.size) || mobile.fallbackSrc || src
  // Première diapositive : chargement immédiat et prioritaire, sans préchargement (il ne connaîtrait qu'une des sources)
  const urgency = priority ? ({ loading: 'eager', fetchPriority: 'high' } as const) : {}
  const img = getImageProps({ src, alt: '', sizes: HERO_SIZES, fill: true, unoptimized: isExternal(src), ...urgency }).props
  const source =
    mobileSrc !== src || mobile.sizes !== HERO_SIZES ? getImageProps({ src: mobileSrc, alt: '', sizes: mobile.sizes, fill: true, unoptimized: isExternal(mobileSrc) }).props : null
  const vars = {
    '--focal': mediaFocal(background, 'hero'),
    '--focal-m': mobile.position,
    '--ratio': mediaRatio(background, 'hero').toFixed(4),
    '--ratio-m': mediaRatio(mobile.media, mobile.size).toFixed(4),
  } as CSSProperties

  const pic = ({ style: _fill, ...props }: ImgProps, className: string, style?: CSSProperties) => {
    // eslint-disable-next-line @next/next/no-img-element -- propriétés optimisées de getImageProps, reprises par les deux images
    const image = <img {...props} alt="" className={className} style={style} />
    return source ? (
      <picture>
        <source media={MOBILE_MEDIA} srcSet={source.srcSet ?? source.src} sizes={source.sizes} />
        {image}
      </picture>
    ) : (
      image
    )
  }
  return (
    <>
      {heroWhole(background, phone) && pic({ ...img, loading: 'lazy', fetchPriority: undefined, 'aria-hidden': true } as ImgProps, 'slide__backdrop')}
      {pic(img, 'slide__photo', vars)}
    </>
  )
}
