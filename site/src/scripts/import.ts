/**
 * Import manuel des flux RSS, de la météo et des vidéos de la chaîne YouTube (même traitement que la tâche planifiée
 * GET /api/cron/import).
 * Usage : npm run import   (= payload run src/scripts/import.ts)
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { importMeteo } from '@/lib/import/meteo'
import { importRss } from '@/lib/import/rss'
import { importYoutube } from '@/lib/import/youtube'

const payload = await getPayload({ config })
let failed = false

try {
  const rss = await importRss(payload)
  payload.logger.info(`Flux RSS : ${rss.created} article(s) importé(s), ${rss.skipped} déjà présent(s) ou ignoré(s).`)
  for (const error of rss.errors) payload.logger.warn(`Flux RSS : ${error}`)
  if (rss.errors.length) failed = true
} catch (error) {
  failed = true
  payload.logger.error(`Flux RSS : échec de l’import (${error instanceof Error ? error.message : String(error)})`)
}

try {
  const meteo = await importMeteo(payload)
  if (meteo.ok) payload.logger.info('Météo : prévisions mises à jour.')
  // Mise à jour automatique désactivée dans l'administration : ce n'est pas une erreur
  else if (meteo.skipped) payload.logger.info(`Météo : ${meteo.error ?? 'mise à jour ignorée'}`)
  else {
    failed = true
    payload.logger.warn(`Météo : ${meteo.error ?? 'mise à jour non effectuée'}`)
  }
} catch (error) {
  failed = true
  payload.logger.error(`Météo : échec de l’import (${error instanceof Error ? error.message : String(error)})`)
}

const youtube = await importYoutube(payload)
if (youtube.ok) payload.logger.info(`YouTube : ${youtube.created} vidéo(s) ajoutée(s), ${youtube.skipped} déjà importée(s).`)
// chaîne non renseignée ou import automatique désactivé : ce n'est pas une erreur
else if (/aucune chaîne|désactivé/.test(youtube.error ?? '')) payload.logger.info(`YouTube : ${youtube.error}`)
else {
  failed = true
  payload.logger.warn(`YouTube : ${youtube.error ?? 'import non effectué'}`)
}

process.exit(failed ? 1 : 0)
