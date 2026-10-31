/**
 * Remet la grille des programmes à zéro avec une semaine d'exemple, pour que le client n'ait plus qu'à modifier les
 * créneaux : supprime TOUS les créneaux de la grille (passés, à venir, brouillons), puis crée la soirée type des
 * contenus de départ (18 h – 0 h 30, src/scripts/seed/programs.ts) du lundi au dimanche. Les émissions d'exemple sont
 * reprises si elles existent encore (même titre), sinon recréées. Rien d'autre n'est touché.
 *
 * Usage : npm run grille:exemple                              montre ce qui sera fait (lundi qui vient), sans rien modifier
 *         npm run grille:exemple -- --confirmer               le fait
 *         npm run grille:exemple -- 2026-11-02 --confirmer    semaine du lundi 2 novembre 2026
 *
 * Les créneaux supprimés restent dans la sauvegarde de la nuit (et dans celle de la mise à jour).
 */
import config from '@payload-config'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { BROADCAST_HOURS_LABEL, shiftDay } from '@/lib/broadcast'
import { formatDayLong, parisDay } from '@/lib/format'

import { MEDIA } from './seed/media'
import { eveningScheduleData, PROGRAMS } from './seed/programs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const confirm = args.includes('--confirmer')
const given = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))

/** Jour de la semaine (0 = dimanche) d'un jour civil AAAA-MM-JJ. */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()
const today = parisDay()
// lundi qui vient (aujourd'hui si l'on est lundi)
const monday = given ?? shiftDay(today, (8 - weekday(today)) % 7)
if (weekday(monday) !== 1) {
  console.error(`✖ ${monday} n'est pas un lundi : donnez la date du lundi, par exemple npm run grille:exemple -- 2026-11-02 --confirmer`)
  process.exit(1)
}
const sunday = shiftDay(monday, 6)
const days = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))
const long = (day: string) => formatDayLong(`${day}T12:00:00Z`)

const payload = await getPayload({ config })
const context = { disableRevalidate: true }

const { totalDocs: existing } = await payload.count({ collection: 'schedule', overrideAccess: true })
const perEvening = eveningScheduleData(monday, () => 0).length
console.log(`Grille actuelle : ${existing} créneau(x), tous supprimés (passés, à venir et brouillons).`)
console.log(
  `Puis ${perEvening * 7} créneaux d'exemple, ${perEvening} par soirée (${BROADCAST_HOURS_LABEL}) : du ${long(monday)} à 18 h au ${long(sunday)} (fin le ${long(shiftDay(sunday, 1))} à 0 h 30).`,
)
if (!confirm) {
  console.log(`\nRien n'a été modifié. Pour le faire :\n  npm run grille:exemple -- ${given ? `${monday} ` : ''}--confirmer`)
  process.exit(0)
}

/** Média de la médiathèque portant ce nom de fichier (ou « nom-1.ext »…), sinon importé depuis les fichiers du site. */
async function mediaFor(key: string): Promise<number | null> {
  const found = await payload.find({ collection: 'media', where: { filename: { like: key } }, limit: 10, depth: 0, overrideAccess: true })
  const same = found.docs.find((m) => m.filename && new RegExp(`^${key}(-\\d+)?\\.\\w+$`).test(m.filename))
  if (same) return same.id
  const def = MEDIA.find((m) => m.key === key)
  if (!def) return null
  const doc = await payload.create({ collection: 'media', data: { alt: def.alt, credit: def.credit }, filePath: path.join(ROOT, def.file), overrideAccess: true })
  return doc.id
}

// émissions d'exemple : reprises par leur titre, recréées si le client les a supprimées ou renommées
const programs = new Map<string, number>()
for (const p of PROGRAMS) {
  const found = (await payload.find({ collection: 'programs', where: { title: { equals: p.title } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (found) {
    programs.set(p.key, found.id)
    continue
  }
  const doc = await payload.create({
    collection: 'programs',
    data: { _status: 'published', title: p.title, genre: p.genre, image: await mediaFor(p.image), synopsis: p.synopsis, isPremiere: Boolean(p.isPremiere) },
    overrideAccess: true,
    context,
  })
  programs.set(p.key, doc.id)
  console.log(`Émission d'exemple recréée : ${p.title}`)
}
const programId = (key: string) => {
  const id = programs.get(key)
  if (id === undefined) throw new Error(`Émission inconnue : ${key}`)
  return id
}
// créneaux préparés (et vérifiés) avant toute suppression : rien n'est effacé si la semaine d'exemple est invalide
const slots = days.flatMap((day) => eveningScheduleData(day, programId))

// tout supprimer puis tout créer, dans une seule transaction : en cas d'erreur, la grille reste telle qu'elle était
const req = { transactionID: (await payload.db.beginTransaction()) ?? undefined }
try {
  const { docs } = await payload.delete({ collection: 'schedule', where: { id: { exists: true } }, overrideAccess: true, context, req, depth: 0 })
  for (const data of slots) await payload.create({ collection: 'schedule', data, overrideAccess: true, context, req })
  if (req.transactionID) await payload.db.commitTransaction(req.transactionID)
  console.log(`\n${docs.length} créneau(x) supprimé(s), ${slots.length} créneaux d'exemple créés (soirées du ${long(monday)} au ${long(sunday)}).`)
  console.log('Le site se met à jour de lui-même dans la minute.')
} catch (e) {
  if (req.transactionID) await payload.db.rollbackTransaction(req.transactionID)
  console.error('✖ Échec, rien n’a été modifié dans la grille :', e instanceof Error ? e.message : e)
  process.exit(1)
}
process.exit(0)
