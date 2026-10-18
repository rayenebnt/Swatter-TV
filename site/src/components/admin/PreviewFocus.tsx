'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { previewFocus, type EditHint } from '@/lib/preview'

/** Message envoyé à l'aperçu (reçu par src/components/preview/PreviewClient.tsx). */
export type PreviewFocusMessage = { type: 'swatter:preview-focus'; path: string; target?: string }

const text = (v: unknown) => (typeof v === 'string' ? v : null)

/**
 * Fiches avec aperçu en direct (admin.components…beforeDocumentControls) : suit l'onglet ouvert et le champ touché, et
 * indique à l'aperçu la page et l'endroit à montrer (ex. : onglet « Flash info » → bandeau de l'accueil, créneau →
 * son jour dans la grille, publicité → sa bannière). Ne rend rien.
 */
export function PreviewFocus() {
  const { id, collectionSlug, globalSlug } = useDocumentInfo()
  const slug = text(useFormFields(([f]) => f.slug?.value))
  const department = text(useFormFields(([f]) => f.department?.value))
  const startsAt = text(useFormFields(([f]) => f.startsAt?.value))
  const placement = text(useFormFields(([f]) => f.placement?.value))
  const [hint, setHint] = useState<EditHint>({})

  // dernier onglet ouvert ou dernier champ touché
  useEffect(() => {
    const activeTab = () => document.querySelector('.tabs-field__tab-button--active')?.textContent?.trim() ?? null
    const frame = requestAnimationFrame(() => setHint({ tab: activeTab() }))
    const onClick = (e: MouseEvent) => {
      const tab = (e.target as Element | null)?.closest?.('.tabs-field__tab-button')
      if (tab) setHint({ tab: tab.textContent?.trim() ?? null })
    }
    const onFocus = (e: FocusEvent) => {
      const field = (e.target as Element | null)?.closest?.('[id^="field-"]')
      // « field-flashItems__0__text » → « flashItems »
      if (field) setHint({ tab: activeTab(), field: field.id.slice('field-'.length).split('__')[0] })
    }
    document.addEventListener('click', onClick)
    document.addEventListener('focusin', onFocus)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('click', onClick)
      document.removeEventListener('focusin', onFocus)
    }
  }, [])

  const { path, target } = previewFocus(collectionSlug, globalSlug, { id, slug, department, startsAt, placement }, hint)

  useEffect(() => {
    const send = () => {
      const frame = document.querySelector<HTMLIFrameElement>('.live-preview-window iframe')
      const message: PreviewFocusMessage = { type: 'swatter:preview-focus', path, target }
      frame?.contentWindow?.postMessage(message, window.location.origin)
    }
    send()
    // l'aperçu se signale à chaque chargement (ouverture de l'aperçu, changement de taille d'écran…)
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string } | null)?.type === 'swatter:preview-ready') send()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [path, target])

  return null
}
