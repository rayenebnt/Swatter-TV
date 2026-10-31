'use client'

import { Link, useConfig } from '@payloadcms/ui'
import type { DefaultCellComponentProps } from 'payload'
import { broadcastEvening, slotOutsideBroadcast } from '@/lib/broadcast'
import { dateChip, parisDateTime, parisDay } from '@/lib/format'

// heure de Paris, comme la grille du site ; Intl plutôt que date-fns : toujours en français, dès le premier affichage
const format = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Début d'un créneau dans la liste de la grille : « mer. 21/10/2026 20:30 », avec le jour de la semaine (lien vers la
 * fiche). Après minuit (0 h à 0 h 30), la date saisie est celle du lendemain : la soirée de rattachement est rappelée
 * (« soirée du lun. 20 »), pour qu'un créneau daté du mardi dans la liste du lundi ne passe pas pour une erreur.
 * Un ancien créneau hors des horaires d'antenne est marqué « hors antenne » (ou « finit après 0 h 30 »), la raison en
 * infobulle.
 */
export function SlotTimeCell({ cellData, link, linkURL, rowData, collectionSlug }: DefaultCellComponentProps) {
  const {
    config: { routes },
  } = useConfig()
  const value = cellData as unknown
  const start = typeof value === 'string' && value ? new Date(value) : null
  const text = start ? format.format(start) : '—'
  const evening = start ? broadcastEvening(start) : null
  const afterMidnight = start && evening && evening !== parisDay(start) ? dateChip(parisDateTime(evening, '12:00')) : null
  const duration = (rowData as { durationMinutes?: unknown } | undefined)?.durationMinutes
  const problem = start ? slotOutsideBroadcast(start, typeof duration === 'number' ? duration : 0) : null

  const time = link ? (
    <Link href={linkURL || `${routes.admin}/collections/${collectionSlug}/${encodeURIComponent(String(rowData?.id))}`} prefetch={false}>
      {text}
    </Link>
  ) : (
    <span>{text}</span>
  )
  if (!afterMidnight && !problem) return time
  return (
    <span className={`sw-slot-time${problem ? ' sw-slot-time--off' : ''}`}>
      {time}
      {afterMidnight && (
        <span className="sw-slot-time__evening">
          soirée du {afterMidnight.weekday.toLowerCase()} {afterMidnight.day}
        </span>
      )}
      {problem && (
        <span className="sw-slot-time__off" title={problem}>
          {evening ? 'finit après 0 h 30' : 'hors antenne'}
        </span>
      )}
    </span>
  )
}

export default SlotTimeCell
