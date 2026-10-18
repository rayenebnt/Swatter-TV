/**
 * Ne garde dans « Vidéos » et « Replays » que les vidéos de la chaîne YouTube : synchronise la chaîne (global « youtube »),
 * puis supprime toutes les autres fiches (jeu de démonstration, vidéos ajoutées à la main, vidéos plus anciennes que
 * celles lues sur la chaîne). Usage : npm run payload run src/scripts/videos-chaine-seulement.ts
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { importSummary, importYoutube } from '@/lib/import/youtube'

const payload = await getPayload({ config })
const result = await importYoutube(payload, { force: true })
if (!result.ok || !result.ids.length) {
  // sans import réussi, on ne supprime rien (le site resterait vide)
  payload.logger.error(`Import YouTube impossible, rien n’est supprimé : ${result.error ?? 'aucune vidéo lue sur la chaîne'}`)
  process.exit(1)
}
payload.logger.info(`YouTube : ${importSummary(result)}`)

const channel = new Set(result.ids)
for (const collection of ['videos', 'replays'] as const) {
  const { docs } = await payload.find({ collection, draft: true, pagination: false, depth: 0, select: { source: true } })
  let deleted = 0
  for (const doc of docs) {
    const id = doc.source?.provider === 'youtube' ? doc.source.youtubeUrl?.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1] : null
    if (id && channel.has(id)) continue
    await payload.delete({ collection, id: doc.id, context: { disableRevalidate: true, top10Reorder: true } })
    deleted++
  }
  payload.logger.info(`${collection === 'videos' ? 'Vidéos' : 'Replays'} : ${deleted} fiche(s) hors chaîne supprimée(s).`)
}
process.exit(0)
