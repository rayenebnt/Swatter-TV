/**
 * Anciens créneaux de la grille en dehors des horaires d'antenne (tous les jours de 18 h à 0 h 30, heure de Paris),
 * saisis avant l'arrivée de ces horaires (contenus de départ de l'époque à 6 h, 12 h…) : le site ne les montre plus, la
 * recopie de semaine les laisse de côté et le tableau de bord les signale. Ce script les liste, puis les supprime.
 *
 * Usage : npm run grille:hors-antenne                    liste les créneaux concernés, sans rien modifier
 *         npm run grille:hors-antenne -- --supprimer     supprime les créneaux qui commencent hors antenne (avant 18 h ou
 *                                                       à partir de 0 h 30) et raccourcit ceux qui finissent après
 *                                                       0 h 30 pour qu'ils s'arrêtent à 0 h 30 (ce que le site en montre)
 *
 * Seules les fiches enregistrées sont examinées (les brouillons jamais publiés n'ont pas encore de date en base). Les
 * créneaux supprimés restent dans la sauvegarde de la nuit. Le site se met à jour de lui-même dans la minute.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { broadcastEvening, BROADCAST_HOURS_LABEL, eveningWindow, slotOutsideBroadcast } from '@/lib/broadcast'

const remove = process.argv.slice(2).includes('--supprimer')
const payload = await getPayload({ config })
const context = { disableRevalidate: true }

const when = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

type Row = { id: number; startsAt: string; durationMinutes: number; label: string; status: string; fix: { delete: true } | { minutes: number } }

const { docs } = await payload.find({
  collection: 'schedule',
  where: { startsAt: { exists: true } },
  sort: 'startsAt',
  pagination: false,
  depth: 0,
  overrideAccess: true,
  select: { startsAt: true, durationMinutes: true, label: true, titleOverride: true, _status: true },
})

const rows: Row[] = []
for (const doc of docs) {
  const start = new Date(doc.startsAt)
  if (!slotOutsideBroadcast(start, doc.durationMinutes)) continue
  const evening = broadcastEvening(start)
  // début à l'antenne, fin après 0 h 30 : ramené à 0 h 30 ; sinon, créneau entièrement hors des horaires : supprimé
  const fix = evening ? { minutes: Math.floor((eveningWindow(evening).end.getTime() - start.getTime()) / 60_000) } : { delete: true as const }
  rows.push({
    id: doc.id,
    startsAt: doc.startsAt,
    durationMinutes: doc.durationMinutes,
    label: doc.label || doc.titleOverride || 'Sans titre',
    status: doc._status === 'published' ? 'en ligne' : 'brouillon',
    fix,
  })
}

if (!rows.length) {
  console.log(`Aucun créneau en dehors des horaires d'antenne (${BROADCAST_HOURS_LABEL}) : rien à faire.`)
  process.exit(0)
}

console.log(`${rows.length} créneau(x) en dehors des horaires d'antenne (${BROADCAST_HOURS_LABEL}, heure de Paris) :`)
for (const r of rows) {
  const action = 'delete' in r.fix ? 'commence hors antenne' : `finit après 0 h 30 (${r.fix.minutes} min au plus)`
  console.log(`  ${when.format(new Date(r.startsAt))} · ${r.durationMinutes} min · « ${r.label} » · n° ${r.id} · ${r.status} · ${action}`)
}

if (!remove) {
  console.log('\nRien n’a été modifié. Pour supprimer ces créneaux (et raccourcir ceux qui finissent après 0 h 30) :')
  console.log('  npm run grille:hors-antenne -- --supprimer')
  process.exit(0)
}

let deleted = 0
let shortened = 0
for (const r of rows) {
  if ('delete' in r.fix) {
    await payload.delete({ collection: 'schedule', id: r.id, overrideAccess: true, context })
    deleted++
  } else {
    await payload.update({ collection: 'schedule', id: r.id, data: { durationMinutes: r.fix.minutes }, overrideAccess: true, context })
    shortened++
  }
}
console.log(`\n${deleted} créneau(x) supprimé(s), ${shortened} raccourci(s) pour finir à 0 h 30.`)
process.exit(0)
