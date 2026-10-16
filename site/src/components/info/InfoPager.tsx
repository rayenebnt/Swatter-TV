import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

/** Pagination des pages Info : précédente / suivante (liens rendus côté serveur) et position. */
export function InfoPager({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null
  const prev = page > 1 ? hrefFor(page - 1) : null
  const next = page < totalPages ? hrefFor(page + 1) : null
  return (
    <nav className="info-pager" aria-label="Pages de l’actualité">
      {prev ? (
        <Link className="btn btn--ghost btn--sm" href={prev} rel="prev">
          <Icon name="left" />
          Plus récentes
        </Link>
      ) : (
        <span className="btn btn--ghost btn--sm is-off" aria-hidden="true">
          <Icon name="left" />
          Plus récentes
        </span>
      )}
      <p className="info-pager__info">
        Page {page} sur {totalPages}
      </p>
      {next ? (
        <Link className="btn btn--ghost btn--sm" href={next} rel="next">
          Plus anciennes
          <Icon name="right" />
        </Link>
      ) : (
        <span className="btn btn--ghost btn--sm is-off" aria-hidden="true">
          Plus anciennes
          <Icon name="right" />
        </span>
      )}
    </nav>
  )
}
