'use client'

import { useDocumentInfo, useDocumentTitle } from '@payloadcms/ui'
import { useEffect } from 'react'

/**
 * Fiches à brouillons (admin.components.edit.beforeDocumentControls) : « Ajouter » crée aussitôt la fiche, que Payload
 * intitule alors par son numéro (« 201 ») tant qu'aucun titre n'est saisi. On affiche plutôt « Nouvelle fiche : Vidéo ».
 */
export function UntitledTitle() {
  const { id, docConfig } = useDocumentInfo()
  const { title, setDocumentTitle } = useDocumentTitle()
  const singular = docConfig && 'labels' in docConfig ? docConfig.labels?.singular : undefined
  const label = typeof singular === 'string' ? singular : ''

  useEffect(() => {
    if (id == null || title !== String(id)) return
    // après les effets de Payload, qui remettent le numéro au montage et après chaque enregistrement automatique
    const frame = requestAnimationFrame(() => setDocumentTitle(label ? `Nouvelle fiche : ${label}` : 'Nouvelle fiche'))
    return () => cancelAnimationFrame(frame)
  }, [id, title, label, setDocumentTitle])

  return null
}
