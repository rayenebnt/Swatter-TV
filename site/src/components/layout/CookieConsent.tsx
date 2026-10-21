import { Analytics } from '@/components/analytics/Analytics'
import { isMeasurementId } from '@/lib/analytics'
import { isPreview } from '@/lib/payload'
import { getSettings } from '@/lib/queries/settings'
import { CookieBanner } from './CookieBanner'

/**
 * Bandeau cookies et mesure d'audience : Google Analytics si un ID de mesure est saisi dans les réglages (Accueil, direct
 * et flash info › Mesure d'audience), jamais en mode aperçu (l'équipe qui relit un brouillon n'est pas une visite).
 */
export async function CookieConsent() {
  const [settings, preview] = await Promise.all([getSettings(), isPreview()])
  const id = settings?.analytics?.measurementId
  const measurementId = isMeasurementId(id) ? id : null
  return (
    <>
      <CookieBanner analytics={Boolean(measurementId)} />
      {measurementId && !preview && <Analytics measurementId={measurementId} />}
    </>
  )
}
