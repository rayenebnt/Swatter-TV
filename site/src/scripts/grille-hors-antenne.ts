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
 * Un créneau à raccourcir dont des modifications attendent d'être publiées (brouillon plus récent) n'est pas touché :
 * l'enregistrer mettrait ces modifications en ligne. Il est signalé, à corriger dans l'administration. Une erreur sur
 * un créneau n'arrête pas le nettoyage des autres : les créneaux non traités sont listés à la fin (code de sortie 1).
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

type Row = {
  id: number
  startsAt: string
  durationMinutes: number
  label: string
  status: string
  /** valeurs de la fiche publiée, renvoyées telles quelles quand on la raccourcit */
  keep: { program: unknown; titleOverride: string | null; _status: 'draft' | 'published' }
  fix: { delete: true } | { minutes: number }
}

const { docs } = await payload.find({
  collection: 'schedule',
  where: { startsAt: { exists: true } },
  sort: 'startsAt',
  pagination: false,
  depth: 0,
  overrideAccess: true,
  select: { startsAt: true, durationMinutes: true, label: true, titleOverride: true, program: true, _status: true },
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
    keep: { program: doc.program, titleOverride: doc.titleOverride ?? null, _status: doc._status === 'published' ? 'published' : 'draft' },
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

/** Des modifications attendent d'être publiées : la dernière version enregistrée est un brouillon plus récent. */
async function pendingDraft(id: number): Promise<boolean> {
  const { docs: versions } = await payload.findVersions({
    collection: 'schedule',
    where: { and: [{ parent: { equals: id } }, { latest: { equals: true } }, { 'version._status': { equals: 'draft' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return versions.length > 0
}

const reason = (e: unknown) => {
  const errors = (e as { data?: { errors?: { message?: string }[] } })?.data?.errors
  return errors?.length ? errors.map((x) => x.message).join(' ; ') : e instanceof Error ? e.message : String(e)
}

let deleted = 0
let shortened = 0
const left: { row: Row; why: string }[] = []
for (const r of rows) {
  try {
    if ('delete' in r.fix) {
      await payload.delete({ collection: 'schedule', id: r.id, overrideAccess: true, context })
      deleted++
    } else if (r.keep._status === 'published' && (await pendingDraft(r.id))) {
      left.push({ row: r, why: 'des modifications attendent d’être publiées : corrigez la durée dans l’administration' })
    } else {
      // valeurs de la fiche reprises telles quelles : seule la durée change, le statut reste celui de la fiche
      await payload.update({
        collection: 'schedule',
        id: r.id,
        data: { startsAt: r.startsAt, program: r.keep.program as number, titleOverride: r.keep.titleOverride, _status: r.keep._status, durationMinutes: r.fix.minutes },
        overrideAccess: true,
        context,
      })
      shortened++
    }
  } catch (e) {
    left.push({ row: r, why: reason(e) })
  }
}
console.log(`\n${deleted} créneau(x) supprimé(s), ${shortened} raccourci(s) pour finir à 0 h 30.`)
if (left.length) {
  console.log(`\n${left.length} créneau(x) non traité(s), à corriger dans l’administration (Programme TV) :`)
  for (const { row, why } of left) console.log(`  ${when.format(new Date(row.startsAt))} · « ${row.label} » · n° ${row.id} : ${why}`)
  process.exit(1)
}
process.exit(0)
