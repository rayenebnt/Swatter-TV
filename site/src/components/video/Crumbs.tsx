import Link from 'next/link'
import type { Crumb } from '@/components/ui/PageHeader'
import { JsonLd } from '@/components/ui/JsonLd'
import { absoluteUrl } from '@/lib/site'

/** Fil d'Ariane des fiches (même rendu et même balisage BreadcrumbList que PageHeader). */
export function Crumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: 'Accueil', href: '/' }, ...items]
  return (
    <>
      <nav aria-label="Fil d’Ariane">
        <ol className="crumbs">
          {all.map((c, i) => (
            <li key={i}>{c.href && i < all.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: c.href ? absoluteUrl(c.href) : undefined })),
        }}
      />
    </>
  )
}
