import Link from 'next/link'
import type { ReactNode } from 'react'
import { absoluteUrl } from '@/lib/site'
import { JsonLd } from './JsonLd'

export type Crumb = { label: string; href?: string }

/** En-tête des pages intérieures, avec fil d'Ariane (et son balisage BreadcrumbList). */
export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs = [],
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  crumbs?: Crumb[]
  children?: ReactNode
}) {
  const all: Crumb[] = [{ label: 'Accueil', href: '/' }, ...crumbs]
  return (
    <header className="page-header">
      <div className="container">
        <nav aria-label="Fil d’Ariane">
          <ol className="crumbs">
            {all.map((c, i) => (
              <li key={i}>{c.href && i < all.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
            ))}
          </ol>
        </nav>
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
