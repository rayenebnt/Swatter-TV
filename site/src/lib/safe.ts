/**
 * Exécute une requête de données et renvoie `fallback` en cas d'erreur
 * (ex. base indisponible pendant `next build` dans Docker) : la page est alors
 * régénérée avec les vraies données dès la première visite (ISR).
 */
export async function safe<T>(fn: () => Promise<T>, fallback: T, label = 'requête'): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      console.error(`[swatter] Échec ${label} :`, error instanceof Error ? error.message : error)
    }
    return fallback
  }
}
