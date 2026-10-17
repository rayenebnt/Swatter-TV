'use client'

import { useRef, type ReactNode } from 'react'
import { usePauseOffscreen } from './usePauseOffscreen'

/** Conteneur (rendu serveur à l'intérieur) dont les icônes météo s'arrêtent hors écran et onglet caché. */
export function PauseOffscreen({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  usePauseOffscreen(ref)
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
