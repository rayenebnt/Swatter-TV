// CONTRACT (agent « météo ») : récupère les prévisions (Open-Meteo, sans clé) et met à jour le global « meteo ».
import type { Payload } from 'payload'

export async function importMeteo(_payload: Payload): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'importMeteo non implémenté' }
}
