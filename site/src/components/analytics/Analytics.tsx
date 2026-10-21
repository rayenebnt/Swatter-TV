'use client'

import { useEffect } from 'react'
import { onConsentChange, readConsent, type ConsentChoice } from '@/components/layout/consent'
import { clearGaCookies, initGtag, loadGtag, setMeasurement, type GtagWindow } from './gtag'

/**
 * Google Analytics : chargé seulement si le visiteur accepte la « Mesure d'audience » (bandeau cookies), et coupé, cookies
 * effacés, s'il retire son accord ou si son choix a expiré. Le choix est lu au montage dans le stockage, pas par
 * useConsent() : celui-ci vaut null pendant l'hydratation, ce qui effacerait à chaque page les cookies d'un visiteur
 * qui a accepté (et en ferait un nouveau visiteur à chaque page).
 */
export function Analytics({ measurementId }: { measurementId: string }) {
  useEffect(() => {
    const win = window as unknown as GtagWindow
    const apply = (choice: ConsentChoice | null) => {
      if (choice?.audience) {
        initGtag(win, measurementId)
        setMeasurement(win, measurementId, true)
        loadGtag(document, measurementId)
        return
      }
      // aucun choix, refus, retrait ou choix expiré : rien n'est envoyé, et les cookies déjà déposés sont effacés
      setMeasurement(win, measurementId, false)
      clearGaCookies(document, window.location.hostname)
    }
    apply(readConsent())
    return onConsentChange(apply)
  }, [measurementId])
  return null
}
