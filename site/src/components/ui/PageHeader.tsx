import { getImageProps } from 'next/image'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { absoluteUrl } from '@/lib/site'
import { HEADER_PHOTOS, type HeaderPhoto } from './headerPhotos'
import { Icon } from './Icon'
import { JsonLd } from './JsonLd'
import { MOBILE_MEDIA } from './MediaImage'

export type Crumb = { label: string; href?: string }

/**
 * En-tête des pages intérieures, avec fil d'Ariane (et son balisage BreadcrumbList), sur une photo de montagne de la
 * chaîne (`photo` : le Bargy par défaut, ou le Môle), assombrie pour les textes et nommée à droite du fil d'Ariane.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs = [],
  photo = 'bargy',
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  crumbs?: Crumb[]
  photo?: HeaderPhoto
  children?: ReactNode
}) {
  const all: Crumb[] = [{ label: 'Accueil', href: '/' }, ...crumbs]
  const bg = HEADER_PHOTOS[photo]
  // Photo décorative, chargée en priorité (haut de page) ; sur téléphone, son autre fichier s'il en a un (<picture>)
  // sans fichier pour téléphone, la photo en largeur couvre l'en-tête presque carré par sa hauteur : bien plus large que l'écran
  const sizes = bg.mobileSrc ? '100vw' : '(max-width: 760px) 180vw, 100vw'
  const { style: _fill, ...img } = getImageProps({ src: bg.src, alt: '', fill: true, sizes, loading: 'eager', fetchPriority: 'high' }).props
  const phone = bg.mobileSrc ? getImageProps({ src: bg.mobileSrc, alt: '', fill: true, sizes: '100vw' }).props : null
  return (
    <header className="page-header" data-photo={photo}>
      {/* cadrage par variables (téléphone : --pos-m) */}
      <div className="page-header__bg" aria-hidden="true" style={{ '--pos': bg.position, '--pos-m': bg.positionMobile } as CSSProperties}>
        <picture>
          {phone && <source media={MOBILE_MEDIA} srcSet={phone.srcSet ?? phone.src} sizes={phone.sizes} />}
          {/* eslint-disable-next-line @next/next/no-img-element -- propriétés optimisées de getImageProps (et source téléphone) */}
          <img {...img} alt="" />
        </picture>
      </div>
      <div className="container">
        <div className="page-header__top">
          <nav aria-label="Fil d’Ariane">
            <ol className="crumbs">
              {all.map((c, i) => (
                <li key={i}>{c.href && i < all.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
              ))}
            </ol>
          </nav>
          {bg.place && (
            <div className="page-header__place">
              <Icon name="pin" />
              <span className="sr-only">Photo : </span>
              {bg.place}
            </div>
          )}
        </div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: c.href ? absoluteUrl(c.href) : undefined })),
        }}
      />
    </header>
  )
}
