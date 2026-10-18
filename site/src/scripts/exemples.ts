/**
 * Ajoute les contenus d'exemple qui manquent, SANS RIEN SUPPRIMER (contrairement à npm run seed / npm run reinit).
 * Usage : npm run exemples
 *
 * Pour l'instant : le replay d'exemple, si la rubrique « Replays » est vide (base créée avant son ajout, ou mise à jour
 * avec npm run maj-base). Ses images sont reprises de la médiathèque si elles y sont déjà, sinon importées.
 */
import config from '@payload-config'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { parisDateTime, parisDay } from '@/lib/format'

import { MEDIA } from './seed/media'
import { EXAMPLE_REPLAY } from './seed/replay'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const payload = await getPayload({ config })
const log = (msg: string) => payload.logger.info(msg)

/** Média de la médiathèque portant ce nom de fichier (ou « nom-1.ext »…), sinon importé depuis les fichiers du site. */
async function mediaFor(key: string): Promise<number> {
  const found = await payload.find({ collection: 'media', where: { filename: { like: `${key}` } }, limit: 10, depth: 0, overrideAccess: true })
  const same = found.docs.find((m) => m.filename && new RegExp(`^${key}(-\\d+)?\\.\\w+$`).test(m.filename))
  if (same) return same.id
  const def = MEDIA.find((m) => m.key === key)
  if (!def) throw new Error(`Média inconnu : ${key}`)
  const doc = await payload.create({ collection: 'media', data: { alt: def.alt, credit: def.credit }, filePath: path.join(ROOT, def.file), overrideAccess: true })
  log(`Média importé : ${doc.filename}`)
  return doc.id
}

const { totalDocs: replays } = await payload.count({ collection: 'replays', overrideAccess: true })
if (replays > 0) {
  log(`« Replays » contient déjà ${replays} replay(s) : aucun exemple ajouté.`)
} else {
  const program = (await payload.find({ collection: 'programs', where: { title: { equals: EXAMPLE_REPLAY.programTitle } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await payload.create({
    collection: 'replays',
    data: {
      _status: 'published',
      title: EXAMPLE_REPLAY.title,
      program: program?.id ?? null,
      source: { provider: 'upload', file: await mediaFor(EXAMPLE_REPLAY.clip) },
      thumbnail: await mediaFor(EXAMPLE_REPLAY.image),
      broadcastAt: parisDateTime(parisDay(yesterday), '20:45').toISOString(),
      duration: EXAMPLE_REPLAY.duration,
      description: EXAMPLE_REPLAY.description,
    },
    overrideAccess: true,
  })
  log(`Replay d’exemple ajouté : « ${EXAMPLE_REPLAY.title} ».`)
}
process.exit(0)
