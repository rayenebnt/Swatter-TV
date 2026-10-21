import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

/**
 * Pagination précédent / suivant de la page Agenda (liens, rendu serveur).
 * Liens sans préchargement : Next 16 réutiliserait la tête de page préchargée (titre, canonique) d'une autre adresse de la
 * même page.
 */
export function AgendaPager({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null
  const prev = page > 1 ? hrefFor(page - 1) : null
  const next = page < totalPages ? hrefFor(page + 1) : null
  return (
    <nav className="agenda-pager" aria-label="Pages de l’agenda">
      {prev ? (
        <Link className="btn btn--ghost btn--sm" href={prev} rel="prev" prefetch={false}>
          <Icon name="left" />
          Précédent
        </Link>
      ) : (
        <span className="btn btn--ghost btn--sm is-off" aria-hidden="true">
          <Icon name="left" />
          Précédent
        </span>
      )}
      <p className="agenda-pager__info">
        Page {page} sur {totalPages}
      </p>
      {next ? (
        <Link className="btn btn--ghost btn--sm" href={next} rel="next" prefetch={false}>
          Suivant
          <Icon name="right" />
        </Link>
      ) : (
        <span className="btn btn--ghost btn--sm is-off" aria-hidden="true">
          Suivant
          <Icon name="right" />
        </span>
      )}
    </nav>
  )
}
