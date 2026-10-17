'use client'

import { useNow } from './hooks'

/** État d'un créneau de la vue liste (« En cours », « Terminé »), calculé après montage : la liste rendue par le serveur reste neutre. */
export function SlotStatus({ start, end }: { start: string; end: string }) {
  const now = useNow()
  if (now === null) return null
  if (now >= Date.parse(end)) return <span className="tvl__past">Terminé</span>
  if (now < Date.parse(start)) return null
  return (
    <span className="badge badge--live badge--sm">
      <i aria-hidden="true" />
      En cours
    </span>
  )
}
