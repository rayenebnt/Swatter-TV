import type { Metadata } from 'next'
import Link from 'next/link'
import { QuickLinks } from '@/components/search/QuickLinks'
import { Icon } from '@/components/ui/Icon'
import '@/styles/pages.css'

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: true },
  alternates: { canonical: null },
}

/** Page 404 du site (adresse inconnue, ou notFound() d'une rubrique) : recherche, accueil et rubriques. */
export default function NotFound() {
  return (
    <section className="nf" aria-labelledby="nf-title">
      <div className="container">
        <div className="nf__hero">
          <p className="nf__code" aria-hidden="true">
            404
          </p>
          <p className="eyebrow">Erreur 404</p>
          <h1 id="nf-title">Cette page est introuvable</h1>
          <p className="nf__text">L’adresse est peut-être mal saisie, ou la page a été déplacée ou supprimée. Lancez une recherche ou choisissez une rubrique ci-dessous.</p>
          <div className="nf__actions">
            {/* Ouvre la recherche instantanée ; sans JavaScript, mène à la page de recherche */}
            <Link className="btn btn--gold" href="/recherche" data-open-search aria-haspopup="dialog">
              <Icon name="search" />
              Rechercher
            </Link>
            <Link className="btn btn--ghost" href="/">
              <Icon name="home" />
              Retour à l’accueil
            </Link>
          </div>
        </div>
        <QuickLinks />
      </div>
    </section>
  )
}
