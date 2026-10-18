const BUILD = () => process.env.NEXT_PHASE === 'phase-production-build'

/** Base injoignable ou saturée (connexion refusée, coupée, délai dépassé, arrêt du serveur PostgreSQL…). */
function isConnectionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; cause?: unknown } | null
  const codes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P02', '57P03', '53300']
  if (e?.code && codes.includes(e.code)) return true
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|Connection terminated|connection timeout|terminating connection|too many clients/i.test(e?.message ?? '')) return true
  return e?.cause ? isConnectionError(e.cause) : false
}

type SafeOptions = {
  /** Panne de la base : « fallback » renvoie le repli au lieu de relancer l'erreur (requêtes de la mise en page commune :
   * en-tête et pied de page restent affichés, et la page d'erreur du site peut s'afficher à l'intérieur). */
  outage?: 'throw' | 'fallback'
}

/**
 * Exécute une requête de données et renvoie `fallback` en cas d'erreur, pour qu'une section en échec
 * disparaisse sans casser la page.
 * - Pendant `next build` (ex. Docker, sans base), toujours le repli : la page est régénérée avec les vraies
 *   données dès les premières visites (ISR).
 * - En fonctionnement, une panne de la base est relancée : Next garde alors la dernière version en cache de la
 *   page au lieu de la remplacer par une version vide (et affiche la page d'erreur si rien n'est en cache).
 */
export async function safe<T>(fn: () => Promise<T>, fallback: T, label = 'requête', options: SafeOptions = {}): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (BUILD()) return fallback
    if (isConnectionError(error) && options.outage !== 'fallback') throw error
    console.error(`[swatter] Échec ${label} :`, error instanceof Error ? error.message : error)
    return fallback
  }
}
