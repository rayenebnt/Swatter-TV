'use client'

import { openCookieSettings } from './consent'

/** Bouton « Gestion des cookies » : rouvre le bandeau sur le panneau « Personnaliser ». */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} aria-haspopup="dialog" onClick={(e) => openCookieSettings(e.currentTarget)}>
      Gestion des cookies
    </button>
  )
}
