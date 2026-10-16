// CONTRACT (agent « info ») : importe les articles des flux RSS actifs (collection rss-feeds)
// dans la collection articles, sans doublon (champ guid). Renvoie un résumé.
import type { Payload } from 'payload'

export type ImportResult = { created: number; skipped: number; errors: string[] }

export async function importRss(_payload: Payload): Promise<ImportResult> {
  return { created: 0, skipped: 0, errors: ['importRss non implémenté'] }
}
