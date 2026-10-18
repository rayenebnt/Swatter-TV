'use client'

import { useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import '@/styles/pages.css'
import '@/styles/error.css'

/**
 * Page d'erreur des pages publiques (exception pendant le rendu d'une page, côté client ou serveur) :
 * message sobre, « Réessayer » et retour à l'accueil. L'en-tête et le pied de page du layout restent affichés.
 */
export default function FrontendError({ error, retry }: { error: Error & { digest?: string }; retry: () => void; reset: () => void }) {
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    console.error(error)
  }, [error])

  // Le contenu de la page a disparu : le focus passe sur le titre (lecteurs d'écran, clavier)
  useEffect(() => {
    title.current?.focus()
  }, [])

  return (
    <section className="nf" aria-labelledby="error-title">
      <div className="container">
        <div className="nf__hero">
          <p className="eyebrow">Erreur</p>
          <h1 id="error-title" className="error__title" ref={title} tabIndex={-1}>
            Cette page n’a pas pu s’afficher
          </h1>
          <p className="nf__text">Un incident technique a interrompu son affichage. Réessayez dans un instant&nbsp;; si le problème persiste, revenez à l’accueil.</p>
          <div className="nf__actions">
            {/* retry() (Next 16) : données de la page rechargées depuis le serveur, puis reset() et nouveau rendu */}
            <button className="btn btn--gold" type="button" onClick={() => retry()}>
              <Icon name="replay" />
              Réessayer
            </button>
            {/* Lien classique : rechargement complet depuis un état sain (un <Link> vers « / » ne ferait rien si l'erreur vient de l'accueil) */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- rechargement complet voulu */}
            <a className="btn btn--ghost" href="/">
              <Icon name="home" />
              Retour à l’accueil
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
