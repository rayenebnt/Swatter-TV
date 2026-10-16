import Link from 'next/link'

export type FilterLink = { href: string; label: string; current: boolean }

/** Filtres sous forme de liens (rendu serveur, adresses partageables) avec le style du contrôle segmenté. */
export function FilterLinks({ label, links }: { label: string; links: FilterLink[] }) {
  if (links.length < 2) return null
  return (
    <nav className="vfilters" aria-label={label} data-reveal>
      <div className="seg seg--links seg--bleed">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined} scroll={false}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
