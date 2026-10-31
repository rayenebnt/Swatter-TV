// Programme TV : constantes, types et calculs partagés par le serveur et le client (aucune dépendance serveur).
import { dateChip, formatDayLong, formatTime, parisDateTime, parisDay } from '@/lib/format'
import { BROADCAST_END, eveningOf, shiftDay } from '@/lib/broadcast'
import type { Slot } from '@/lib/queries/schedule'

/** Frise horaire : de 6 h à 2 h du lendemain (heure de Paris). Aucun changement d'heure ne tombe dans cet intervalle. */
export const GRID_START = '06:00'
export const GRID_HOURS = 20
export const GRID_MINUTES = GRID_HOURS * 60
/** Jours proposés : aujourd'hui et les six suivants. */
export const PROGRAMME_DAYS = 7

/** Infos d'une émission, partagées par tous ses créneaux (évite de répéter résumé et image dans les données envoyées au client). */
export type GridProgram = {
  slug: string | null
  genre: string | null
  genreLabel: string
  synopsis: string | null
  image: string | null
  isPremiere: boolean
}

/** Créneau placé sur la frise d'un jour : `from` / `to` en minutes depuis 6 h, bornés à la frise. */
export type GridSlot = {
  id: number
  title: string
  start: string
  end: string
  /** indice dans GridData.programs */
  prog: number
  from: number
  to: number
  /** commence avant 6 h / finit après 2 h : bord découpé */
  cutL?: true
  cutR?: true
  /** autour de l'heure du rendu serveur : vignette chargée tout de suite (visible dès le défilement initial vers « maintenant ») */
  eager?: true
}

export type GridDay = { key: string; start: string; slots: GridSlot[] }
export type GridData = { today: string; days: GridDay[]; programs: GridProgram[] }

export { shiftDay }

/**
 * Journée TV en cours (AAAA-MM-JJ) : la soirée d'antenne en cours ou à venir (eveningOf de src/lib/broadcast.ts). De 0 h
 * à 0 h 30, la soirée de la veille est encore à l'antenne ; à partir de 0 h 30, « aujourd'hui » est la soirée de 18 h.
 */
export const tvDay = (d: Date = new Date()) => eveningOf(d)

/**
 * Début de la journée TV `day` : 0 h 30 ce jour-là (fin de la soirée de la veille), heure jamais ambiguë (les
 * changements d'heure ont lieu à 2 h / 3 h). Une journée TV va de 0 h 30 à 0 h 30 le lendemain et contient la soirée.
 */
export const tvDayStart = (day: string) => parisDateTime(day, BROADCAST_END)

/** Les jours proposés à partir d'aujourd'hui (journée TV en cours). */
export const programmeDays = (today: string) => Array.from({ length: PROGRAMME_DAYS }, (_, i) => shiftDay(today, i))

/** Midi du jour : instant sûr pour formater la date (loin des changements d'heure). */
const noon = (day: string) => parisDateTime(day, '12:00')

/** « Aujourd’hui », « Demain », « Hier » ou « Sam. 18 ». */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Aujourd’hui'
  if (day === shiftDay(today, 1)) return 'Demain'
  if (day === shiftDay(today, -1)) return 'Hier'
  const { weekday, day: n } = dateChip(noon(day))
  return `${weekday} ${n}`
}

/** « samedi 18 octobre » */
export const dayLong = (day: string) => formatDayLong(noon(day))

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Adresse de la page Programme TV pour un jour (aujourd'hui : adresse canonique sans paramètre). */
export const programmeDayUrl = (day: string, today: string) => (day === today ? '/programme-tv' : `/programme-tv?jour=${day}`)

/** Fenêtre autour de « maintenant » dont les vignettes sont chargées d'emblée (le reste est chargé au défilement). */
const EAGER_BEFORE = 60 * 60_000
const EAGER_AFTER = 3 * 60 * 60_000

/** Répartit les créneaux sur les frises des jours proposés (créneaux à cheval découpés aux bords). */
export function buildGridData(slots: Slot[], today: string, now: number = Date.now()): GridData {
  const programs: GridProgram[] = []
  const index = new Map<string, number>()
  const progOf = (s: Slot) => {
    const key = s.programSlug ?? `#${s.id}`
    let i = index.get(key)
    if (i === undefined) {
      i = programs.push({ slug: s.programSlug, genre: s.genre, genreLabel: s.genreLabel, synopsis: s.synopsis, image: s.image, isPremiere: s.isPremiere }) - 1
      index.set(key, i)
    }
    return i
  }
  const days = programmeDays(today).map((key): GridDay => {
    const start = parisDateTime(key, GRID_START).getTime()
    const end = start + GRID_MINUTES * 60_000
    const daySlots: GridSlot[] = []
    for (const s of slots) {
      const a = Date.parse(s.start)
      const b = Date.parse(s.end)
      if (!(b > a) || b <= start || a >= end) continue
      daySlots.push({
        id: s.id,
        title: s.title,
        start: s.start,
        end: s.end,
        prog: progOf(s),
        from: Math.max(0, (a - start) / 60_000),
        to: Math.min(GRID_MINUTES, (b - start) / 60_000),
        ...(a < start ? { cutL: true as const } : {}),
        ...(b > end ? { cutR: true as const } : {}),
        ...(b > now - EAGER_BEFORE && a < now + EAGER_AFTER ? { eager: true as const } : {}),
      })
    }
    return { key, start: new Date(start).toISOString(), slots: daySlots }
  })
  return { today, days, programs }
}

/** Créneaux de la journée TV d'un jour (de 6 h à 6 h le lendemain), d'après leur heure de début : vue liste et JSON-LD. */
export function slotsOfTvDay(slots: Slot[], day: string): Slot[] {
  const from = parisDateTime(day, GRID_START).getTime()
  const to = parisDateTime(shiftDay(day, 1), GRID_START).getTime()
  return slots.filter((s) => {
    const t = Date.parse(s.start)
    return t >= from && t < to
  })
}

/** Moment de la journée d'après l'heure de début (heure de Paris). */
export function dayPart(start: string): 'matin' | 'apres-midi' | 'soir' | 'nuit' {
  const h = Number(formatTime(start).slice(0, 2))
  if (h >= 6 && h < 12) return 'matin'
  if (h >= 12 && h < 18) return 'apres-midi'
  if (h >= 18) return 'soir'
  return 'nuit'
}

export const DAY_PARTS = [
  { value: 'matin', label: 'Matinée' },
  { value: 'apres-midi', label: 'Après-midi' },
  { value: 'soir', label: 'Soirée' },
  { value: 'nuit', label: 'Nuit' },
] as const

/** Durée en minutes entre deux dates ISO. */
export const minutesBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 60_000)

/** « 45 min », « 1 h 15 », « 2 h » (espaces insécables). */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** Ligne d'infos d'un bloc : « Documentaire · Inédit · 75 min » (format de la maquette). */
export function slotMeta(p: GridProgram | undefined, minutes: number): string {
  return [p?.genreLabel, p?.isPremiere ? 'Inédit' : null, `${minutes} min`].filter(Boolean).join(' · ')
}

const VISUALS: Record<string, string> = {
  info: 't-crepuscule-c',
  meteo: 't-nuages-b',
  documentaire: 't-alpenglow-a',
  magazine: 't-matin-a',
  agenda: 't-crepuscule-a',
  divertissement: 't-crepuscule-b',
  sport: 't-orage-a',
  serie: 't-orage-b',
  cinema: 't-nuit-b',
}

/** Image d'une émission, ou visuel de la maquette assorti à son genre. */
export const programImage = (p: Pick<GridProgram, 'image' | 'genre'> | undefined) =>
  p?.image || `/visuels/${VISUALS[p?.genre ?? ''] ?? 't-nuit-a'}.webp`

/** Prochaine diffusion (en cours ou à venir) d'une émission d'après son adresse, sinon la première de la semaine. */
export function findAiring(data: GridData, slug: string, now: number): { day: string; slot: GridSlot } | null {
  let first: { day: string; slot: GridSlot } | null = null
  for (const d of data.days) {
    for (const s of d.slots) {
      if (data.programs[s.prog]?.slug !== slug) continue
      if (Date.parse(s.end) > now) return { day: d.key, slot: s }
      first ??= { day: d.key, slot: s }
    }
  }
  return first
}
