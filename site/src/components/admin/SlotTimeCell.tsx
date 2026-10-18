'use client'

import { Link, useConfig } from '@payloadcms/ui'
import type { DefaultCellComponentProps } from 'payload'

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

/** Début d'un créneau dans la liste de la grille : « mer. 21/10/2026 20:30 », avec le jour de la semaine (lien vers la fiche). */
export function SlotTimeCell({ cellData, link, linkURL, rowData, collectionSlug }: DefaultCellComponentProps) {
  const {
    config: { routes },
  } = useConfig()
  const value = cellData as unknown
  const text = typeof value === 'string' && value ? format.format(new Date(value)) : '—'
  if (!link) return <span>{text}</span>
  return (
    <Link href={linkURL || `${routes.admin}/collections/${collectionSlug}/${encodeURIComponent(String(rowData?.id))}`} prefetch={false}>
      {text}
    </Link>
  )
}

export default SlotTimeCell
