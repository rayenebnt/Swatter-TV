/**
 * Ne garde dans « Vidéos » que les vidéos de la chaîne YouTube : importe la chaîne (global « youtube »), puis supprime
 * toutes les autres vidéos (jeu de démonstration, vidéos ajoutées à la main). Les replays ne sont pas touchés.
 * Usage : npm run payload run src/scripts/videos-chaine-seulement.ts
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { importYoutube } from '@/lib/import/youtube'

const payload = await getPayload({ config })
const result = await importYoutube(payload, { force: true })
if (!result.ok) {
  // sans import réussi, on ne supprime rien (le site resterait sans vidéos)
  payload.logger.error(`Import YouTube impossible, aucune vidéo supprimée : ${result.error}`)
  process.exit(1)
}
payload.logger.info(`YouTube : ${result.created} vidéo(s) ajoutée(s), ${result.total} sur la chaîne.`)

const { importedIds } = await payload.findGlobal({ slug: 'youtube', depth: 0 })
const channel = new Set(Array.isArray(importedIds) ? importedIds : [])
const { docs } = await payload.find({ collection: 'videos', draft: true, pagination: false, depth: 0, select: { title: true, source: true } })
let deleted = 0
for (const video of docs) {
  const id = video.source?.provider === 'youtube' ? video.source.youtubeUrl?.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1] : null
  if (id && channel.has(id)) continue
  await payload.delete({ collection: 'videos', id: video.id, context: { disableRevalidate: true, top10Reorder: true } })
  deleted++
}
payload.logger.info(`${deleted} vidéo(s) hors chaîne supprimée(s).`)
process.exit(0)
