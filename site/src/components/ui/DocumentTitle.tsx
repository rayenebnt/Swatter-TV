'use client'

import { useEffect } from 'react'
import { pageTitle } from '@/lib/site'

/**
 * Titre de l'onglet d'une page dont le titre dépend des paramètres de l'adresse (filtres, page suivante, jour). Next 16 ne
 * garde qu'une tête de page par chemin dans son cache de navigation : après un clic sur un filtre, le titre resterait celui
 * de la première adresse préchargée (« Agenda des sorties… » au lieu de « Agenda « Fête »… »). `title` : le titre de la
 * page, sans le nom du site (le même que celui de generateMetadata).
 */
export function DocumentTitle({ title }: { title: string }) {
  const full = pageTitle(title)
  useEffect(() => {
    if (document.title !== full) document.title = full
  }, [full])
  return null
}
