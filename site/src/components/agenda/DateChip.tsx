import type { Event } from '@/payload-types'
import { chipOf } from './utils'

/** Pastille de date de la maquette (jour de début, heure de Paris), avec la date complète pour les lecteurs d'écran. */
export function DateChip({ event, className }: { event: Pick<Event, 'startDate' | 'endDate'>; className?: string }) {
  const chip = chipOf(event)
  return (
    <time className={className ? `datechip ${className}` : 'datechip'} dateTime={chip.iso}>
      <span aria-hidden="true">
        <small>{chip.weekday}</small>
        <b>{chip.day}</b>
        <small>{chip.month}</small>
      </span>
      <span className="sr-only">{chip.spoken}</span>
    </time>
  )
}
