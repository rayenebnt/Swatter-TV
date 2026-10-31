// L'antenne hors de la page Programme TV (accueil, page Direct, navigation) : soirée en cours ou à venir, programme « en
// cours » et « à suivre », libellés « Ce soir » / « Demain soir ». Logique pure (serveur et navigateur), sur les horaires
// fixes de src/lib/broadcast.ts : le serveur fournit les créneaux de deux soirées et l'instant de son rendu, le navigateur
// refait le même calcul avec sa propre heure (page servie depuis le cache, onglet resté ouvert : bascule à 18 h et à 0 h 30).
import { currentEvening, eveningOf, eveningWindow, shiftDay } from './broadcast'
import { dateChip, formatDayLong, parisDateTime, parisDay } from './format'

/** Soirée d'antenne sérialisable : jour où elle commence (AAAA-MM-JJ), début (18 h) et fin (0 h 30 le lendemain) en ISO. */
export type EveningSpan = { day: string; start: string; end: string }

/** Ce dont les calculs ont besoin d'un créneau (Slot du programme, LiveSlot du carrousel…). */
type Timed = { start: string; end: string }

/**
 * Programme de l'antenne préparé par le serveur (getOnAirData) pour les composants client : `at`, l'instant du rendu (le
 * premier rendu du navigateur le reprend, sans écart d'hydratation) ; `evening`, la soirée en cours ou à venir à cet
 * instant ; `slots`, les créneaux de cette soirée et de la suivante, rognés aux bornes de l'antenne (hors antenne ignorés).
 */
export type OnAirData<S extends Timed = Timed> = { at: string; evening: EveningSpan; slots: S[] }

/** « Fin des programmes à 0 h 30 » : heure de fin d'antenne affichée aux visiteurs. */
export const BROADCAST_END_LABEL = '0 h 30'
/** Hors antenne (de 0 h 30 à 18 h), la soirée qui vient commence toujours le jour même. */
export const RESUME_TONIGHT = 'Reprise ce soir à 18 h'
export const TONIGHT_FROM = 'Ce soir dès 18 h'
export const ON_AIR_UNTIL_END = `À l’antenne jusqu’à ${BROADCAST_END_LABEL}`

const ms = (iso: string) => Date.parse(iso)

/** Soirée d'antenne `day`, sérialisable. */
export function eveningSpan(day: string): EveningSpan {
  const { start, end } = eveningWindow(day)
  return { day, start: start.toISOString(), end: end.toISOString() }
}

/**
 * Créneau ramené aux bornes de la soirée `span` (une ancienne donnée qui commence avant 18 h ou finit après 0 h 30 n'en
 * garde que la partie à l'antenne, durée recalculée si elle est fournie) ; null s'il est entièrement hors de la soirée.
 */
export function clipToEvening<S extends Timed & { durationMinutes?: number }>(slot: S, span: EveningSpan): S | null {
  const a = Math.max(ms(slot.start), ms(span.start))
  const b = Math.min(ms(slot.end), ms(span.end))
  if (!(b > a)) return null
  if (a === ms(slot.start) && b === ms(slot.end)) return slot
  const clipped = { ...slot, start: new Date(a).toISOString(), end: new Date(b).toISOString() }
  if (typeof slot.durationMinutes === 'number') clipped.durationMinutes = Math.round((b - a) / 60_000)
  return clipped
}

/** Créneaux des soirées `days`, rognés à leur soirée, triés ; un créneau entièrement hors antenne est ignoré. */
export function eveningSlots<S extends Timed & { durationMinutes?: number }>(slots: S[], days: string[]): S[] {
  const spans = days.map(eveningSpan)
  const kept: S[] = []
  for (const s of slots) {
    for (const span of spans) {
      const c = clipToEvening(s, span)
      if (c) {
        kept.push(c)
        break
      }
    }
  }
  return kept.sort((x, y) => ms(x.start) - ms(y.start))
}

/** Soirée d'un créneau déjà rogné (il commence pendant l'antenne). */
const eveningOfSlot = (s: Timed) => eveningOf(new Date(s.start))

export type OnAirState<S extends Timed> = {
  /** Soirée en cours, ou la prochaine hors antenne */
  evening: EveningSpan
  /** La chaîne est à l'antenne (fenêtre horaire seule : elle diffuse même si la grille n'est pas saisie) */
  onAir: boolean
  /** Programme en cours : seulement à l'antenne, dans la soirée en cours */
  current: S | null
  /** Créneaux qui commencent après `now` (soirée en cours ou à venir, puis la suivante) */
  upcoming: S[]
}

/** État de l'antenne à l'instant `now` (ms), d'après des créneaux déjà rognés (OnAirData.slots). */
export function onAirState<S extends Timed>(slots: S[], now: number): OnAirState<S> {
  const ev = currentEvening(new Date(now))
  const evening = { day: ev.day, start: ev.start.toISOString(), end: ev.end.toISOString() }
  const inEvening = (s: S) => ms(s.start) >= ev.start.getTime() && ms(s.end) <= ev.end.getTime()
  const current = ev.onAir ? (slots.find((s) => ms(s.start) <= now && now < ms(s.end) && inEvening(s)) ?? null) : null
  const upcoming = slots.filter((s) => ms(s.start) > now)
  return { evening, onAir: ev.onAir, current, upcoming }
}

/** Midi du jour : instant sûr pour formater la date (loin des changements d'heure). */
const noon = (day: string) => parisDateTime(day, '12:00')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Nom d'une soirée vue à l'instant `now` : « Ce soir » (la soirée en cours, ou celle qui vient hors antenne), « Demain
 * soir », « Hier soir », sinon « Sam. 18 ». De 0 h à 0 h 30, « ce soir » est encore la soirée de la veille et « demain »
 * serait ambigu : la soirée suivante porte le nom de son jour (« Samedi soir »).
 */
export function eveningLabel(day: string, now: number): string {
  const d = new Date(now)
  const ev = eveningOf(d)
  if (day === ev) return 'Ce soir'
  if (day === shiftDay(ev, 1)) return parisDay(d) === ev ? 'Demain soir' : `${cap(formatDayLong(noon(day)).split(' ')[0])} soir`
  if (day === shiftDay(ev, -1)) return 'Hier soir'
  const { weekday, day: n } = dateChip(noon(day))
  return `${weekday} ${n}`
}

/** Le même nom en milieu de phrase : « ce soir », « demain soir », « samedi soir », « le sam. 18 ». */
export function eveningPhrase(day: string, now: number): string {
  const label = eveningLabel(day, now)
  return /soir$/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : `le ${label.toLowerCase()}`
}

/** Groupe de « À suivre » : créneaux d'une même soirée. */
export type UpcomingGroup<S extends Timed> = {
  day: string
  /** « Fin des programmes à 0 h 30 » avant ce groupe (la soirée précédente se termine) */
  endBefore: boolean
  /** « Demain soir », « Ce soir »… avant ce groupe ; null pour la soirée en cours ou à venir (déjà annoncée) */
  heading: string | null
  slots: S[]
}

/**
 * « À suivre » découpé par soirée (au plus `max` créneaux) : la fin de l'antenne est annoncée avant les créneaux d'une
 * autre soirée dès que quelque chose la précède (programme en cours, créneaux de la soirée en cours, ou antenne ouverte).
 */
export function upcomingGroups<S extends Timed>(state: OnAirState<S>, now: number, max: number): UpcomingGroup<S>[] {
  const groups: UpcomingGroup<S>[] = []
  for (const s of state.upcoming.slice(0, Math.max(0, max))) {
    const day = eveningOfSlot(s)
    const last = groups[groups.length - 1]
    if (last?.day === day) {
      last.slots.push(s)
      continue
    }
    const other = day !== state.evening.day
    groups.push({
      day,
      endBefore: other && (groups.length > 0 || state.onAir),
      heading: other ? eveningLabel(day, now) : null,
      slots: [s],
    })
  }
  return groups
}

/**
 * Soirée d'un créneau à écrire devant son heure : null pour la soirée qui vient (« à 18:00 » suffit), sinon « demain
 * soir », « samedi soir »… ; `always` : la soirée qui vient aussi (« ce soir »).
 */
export function slotEvening(s: Timed, state: OnAirState<Timed>, now: number, always = false): string | null {
  const day = eveningOfSlot(s)
  return day === state.evening.day && !always ? null : eveningPhrase(day, now)
}
