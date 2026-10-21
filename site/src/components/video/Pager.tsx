import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

/** Pagination précédent / suivant (liens, rendu serveur). */
export function Pager({ page, totalPages, hrefFor, label }: { page: number; totalPages: number; hrefFor: (page: number) => string; label: string }) {
  if (totalPages <= 1) return null
  const prev = page > 1 ? hrefFor(page - 1) : null
  const next = page < totalPages ? hrefFor(page + 1) : null
  return (
    <nav className="pager" aria-label={label}>
      {prev ? (
        <Link className="btn btn--ghost btn--sm" href={prev} rel="prev">
          <Icon name="left" />
          Précédent
        </Link>
      ) : (
        <span className="btn btn--ghost btn--sm is-disabled" aria-hidden="true">
          <Icon name="left" />
          Précédent
        </span>
      )}
      <p className="pager__info">
        Page {page} sur {totalPages}
      </p>
      {next ? (
        <Link className="btn btn--ghost btn--sm" href={next} rel="next">
          Suivant
          <Icon name="right" />
        </Link>
      ) : (
        <span className="btn btn--ghost btn--sm is-disabled" aria-hidden="true">
          Suivant
          <Icon name="right" />
        </span>
      )}
    </nav>
  )
}
