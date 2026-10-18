'use client'

import { RefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'
import '@/styles/preview.css'

const noSubscription = () => () => {}

/**
 * Mode aperçu, côté navigateur :
 * - dans l'aperçu en direct de l'administration (iframe) : la page se rafraîchit à chaque enregistrement automatique ;
 * - dans un onglet normal : bandeau « Aperçu » avec un lien pour revenir au site tel que le voient les visiteurs.
 */
export function PreviewClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // côté navigateur seulement : page affichée dans l'aperçu de l'administration (iframe) ou dans un onglet
  const frame = useSyncExternalStore(
    noSubscription,
    () => (window.self !== window.top ? 'embedded' : 'tab'),
    () => null,
  )

  useEffect(() => {
    // le bandeau cookies n'a pas sa place dans un aperçu
    document.documentElement.dataset.preview = ''
    return () => {
      delete document.documentElement.dataset.preview
    }
  }, [])

  if (!frame) return null
  if (frame === 'embedded') return <RefreshRouteOnSave refresh={() => router.refresh()} serverURL={window.location.origin} />

  const query = searchParams.toString()
  const here = `${pathname}${query ? `?${query}` : ''}`
  return (
    <div className="preview-bar" role="status">
      <span className="preview-bar__dot" aria-hidden="true" />
      <span>
        <strong>Aperçu</strong> : vous voyez aussi les modifications pas encore publiées.
      </span>
      <a href={`/apercu/quitter?chemin=${encodeURIComponent(here)}`}>Voir le site comme les visiteurs</a>
    </div>
  )
}
