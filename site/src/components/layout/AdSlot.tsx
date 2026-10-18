import { getImageProps } from 'next/image'
import type { CSSProperties } from 'react'
import { runningAdsWhere } from '@/access'
import { Icon } from '@/components/ui/Icon'
import { mediaAlt, mediaSize, mediaUrl, type MediaRef } from '@/lib/media'
import { getPayloadClient } from '@/lib/payload'
import { getSettings } from '@/lib/queries/settings'
import { safe } from '@/lib/safe'
import type { Ad } from '@/payload-types'
import '@/styles/shell.css'

type Placement = Ad['placement']

/** Publicité active pour l'emplacement : cochée active, dans sa période de diffusion (jours de Paris) ; la plus récente. */
async function getActiveAd(placement: Placement): Promise<Ad | null> {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'ads',
        where: { and: [{ placement: { equals: placement } }, runningAdsWhere()] },
        sort: '-createdAt',
        depth: 1,
        limit: 1,
        pagination: false,
      })
      return res.docs[0] ?? null
    },
    null,
    'publicité',
  )
}

/** Lien saisi dans l'administration : http(s), mailto, tel ou adresse interne uniquement. */
const safeHref = (href?: string | null) => {
  const h = href?.trim()
  return h && /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(h) ? h : null
}

/** Propriétés d'image optimisées (next/image) pour un visuel publicitaire. */
function adImage(media: MediaRef, alt: string, sizes: string) {
  const src = mediaUrl(media)
  if (!src) return null
  const { width, height } = mediaSize(media)
  const unoptimized = /^https?:\/\//.test(src) && !src.includes('i.ytimg.com')
  const { props } = getImageProps({ src, alt, width, height, sizes, unoptimized })
  return { props, width, height }
}

/**
 * Emplacement publicitaire. La hauteur est réservée d'après les proportions du visuel (aucun décalage
 * de mise en page) ; sans campagne active, encart « Espace partenaire » avec contact par e-mail.
 */
export async function AdSlot({ placement }: { placement: Placement }) {
  const ad = await getActiveAd(placement)
  const alt = ad ? mediaAlt(ad.image, ad.name) : ''
  const desktop = ad ? adImage(ad.image, alt, '(max-width: 1360px) 92vw, 1272px') : null

  if (!ad || !desktop) {
    const settings = await getSettings()
    const email = settings?.contact?.email?.trim()
    return (
      <aside className="ad" aria-label="Publicité">
        <small>Publicité</small>
        <p className="ad__empty">
          <b>Espace partenaire</b>
          <span>Faites connaître votre activité auprès des téléspectateurs de Swatter TV.</span>
          {email && (
            <a href={`mailto:${email}?subject=${encodeURIComponent('Publicité sur Swatter TV')}`}>
              Devenir partenaire
              <Icon name="arrow" />
            </a>
          )}
        </p>
      </aside>
    )
  }

  const mobile = adImage(ad.imageMobile, alt, '92vw')
  const style = {
    '--ad-ratio': `${desktop.width} / ${desktop.height}`,
    ...(mobile ? { '--ad-ratio-m': `${mobile.width} / ${mobile.height}` } : {}),
  } as CSSProperties
  // Art direction : visuel mobile sous 760 px, propriétés optimisées par getImageProps
  const picture = (
    <picture>
      {mobile && <source media="(max-width: 760px)" srcSet={mobile.props.srcSet ?? mobile.props.src} sizes={mobile.props.sizes} width={mobile.width} height={mobile.height} />}
      <img {...desktop.props} alt={alt} />
    </picture>
  )
  const href = safeHref(ad.link)

  return (
    <aside className="ad ad--campaign" aria-label="Publicité" style={style}>
      <small>Publicité</small>
      {href ? (
        <a className="ad__media" href={href} target="_blank" rel="sponsored noopener">
          {picture}
          <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
        </a>
      ) : (
        <div className="ad__media">{picture}</div>
      )}
    </aside>
  )
}
