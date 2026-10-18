'use client'

import { useLivePreviewContext } from '@payloadcms/ui'
import { AdminIcon } from './icons'

/**
 * Bouton « Voir sur le site » des fiches (admin.components.edit.PreviewButton) : remplace l'icône seule de Payload,
 * peu parlante. Ouvre la page publique du contenu (adresse donnée par admin.preview) dans un nouvel onglet.
 */
export function ViewOnSiteButton() {
  const { previewURL } = useLivePreviewContext()
  if (!previewURL) return null
  return (
    <a className="sw-view-site" href={previewURL} target="_blank" rel="noopener noreferrer">
      <AdminIcon name="external" />
      Voir sur le site
    </a>
  )
}

export default ViewOnSiteButton
