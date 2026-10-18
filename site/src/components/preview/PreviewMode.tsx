import { Suspense } from 'react'
import { isPreview } from '@/lib/payload'
import { PreviewClient } from './PreviewClient'

/** Outils du mode aperçu (rafraîchissement de l'aperçu en direct, bandeau), rendus seulement quand il est actif. */
export async function PreviewMode() {
  if (!(await isPreview())) return null
  return (
    <Suspense fallback={null}>
      <PreviewClient />
    </Suspense>
  )
}
