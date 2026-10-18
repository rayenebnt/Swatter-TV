/**
 * À lancer une fois sur une base créée avant l'arrivée des brouillons : les contenus déjà présents reçoivent le statut
 * « brouillon » par défaut et disparaîtraient du site. Ce script publie ceux qui n'ont encore aucune version
 * (donc antérieurs aux brouillons) ; un vrai brouillon enregistré depuis n'est pas touché.
 * Usage : npm run payload run src/scripts/publish-existing.ts
 */
import config from '@payload-config'
import { getPayload, type CollectionSlug } from 'payload'

const payload = await getPayload({ config })
const context = { disableRevalidate: true, top10Reorder: true }
const collections: CollectionSlug[] = ['videos', 'articles', 'events', 'replays', 'pages', 'schedule', 'programs', 'webcams', 'ads']

for (const collection of collections) {
  const { docs } = await payload.find({ collection, where: { _status: { not_equals: 'published' } }, pagination: false, depth: 0, select: {} })
  let published = 0
  for (const doc of docs) {
    const { totalDocs } = await payload.countVersions({ collection, where: { parent: { equals: doc.id } } })
    if (totalDocs > 0) continue
    await payload.update({ collection, id: doc.id, data: { _status: 'published' }, context })
    published++
  }
  payload.logger.info(`${collection} : ${published} contenu(s) publié(s)`)
}

for (const slug of ['settings', 'meteo'] as const) {
  const doc = await payload.findGlobal({ slug, depth: 0 })
  const { totalDocs } = await payload.countGlobalVersions({ global: slug })
  if (doc._status !== 'published' && totalDocs === 0) {
    await payload.updateGlobal({ slug, data: { _status: 'published' }, context })
    payload.logger.info(slug === 'settings' ? 'Réglages (accueil, direct, flash info) publiés' : 'Météo publiée')
  }
}
process.exit(0)
