import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { RUBRIQUES, type Rubrique } from './rubriques'

/** Grille de liens vers les rubriques du site (page 404, recherche sans résultat ou sans requête). */
export function QuickLinks({ items = RUBRIQUES, label = 'Rubriques du site' }: { items?: Rubrique[]; label?: string }) {
  return (
    <nav aria-label={label}>
      <ul className="qlinks">
        {items.map((r, i) => (
          <li key={r.href} data-reveal style={{ '--d': i % 4 } as CSSProperties}>
            <Link className="card qlink" href={r.href}>
              <span className="qlink__ico">
                <Icon name={r.icon} />
              </span>
              <span className="qlink__txt">
                <b>{r.label}</b>
                <small>{r.hint}</small>
              </span>
              <Icon name="right" className="qlink__chev" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
