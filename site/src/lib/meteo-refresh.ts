// Météo toujours à jour, même sans tâche planifiée (poste de développement, hébergement sans cron) : quand une page
// affiche des prévisions vieilles de plus d'une heure, celles de démonstration ou d'anciennes villes, Open-Meteo est
// interrogé en arrière-plan, après l'envoi de la page. La tâche planifiée (GET /api/cron/import) reste la voie normale en production.
import config from '@payload-config'
import { after } from 'next/server'
import { getPayload } from 'payload'
import { importMeteo } from '@/lib/import/meteo'
import { OPEN_METEO_SOURCE } from '@/lib/meteo'

const STALE_MS = 60 * 60 * 1000
/** Pas plus d'une tentative toutes les 10 minutes (Open-Meteo injoignable, réseau coupé…). */
const RETRY_MS = 10 * 60 * 1000
let lastAttempt = 0

/** `complete` : faux quand les prévisions enregistrées ne couvrent pas toutes les villes suivies (liste changée depuis). */
export function refreshMeteoIfStale(state: { autoUpdate: boolean; source: string | null; updatedAt: string | null; complete: boolean }): void {
  if (!state.autoUpdate || process.env.NEXT_PHASE === 'phase-production-build') return
  const age = state.updatedAt ? Date.now() - Date.parse(state.updatedAt) : Number.POSITIVE_INFINITY
  if (state.source === OPEN_METEO_SOURCE && age < STALE_MS && state.complete) return
  if (Date.now() - lastAttempt < RETRY_MS) return
  lastAttempt = Date.now()
  try {
    after(async () => {
      // (pas de getPayloadClient : il lit le mode aperçu, interdit dans after())
      const result = await importMeteo(await getPayload({ config }))
      if (!result.ok) {
        if (!result.skipped) console.warn(`[swatter] Météo non mise à jour : ${result.error}`)
        return
      }
      try {
        const { revalidatePath } = await import('next/cache')
        revalidatePath('/', 'layout')
      } catch {
        // les pages se régénèrent de toute façon (revalidate = 60)
      }
    })
  } catch {
    // hors rendu Next.js (scripts) : rien à faire
  }
}
