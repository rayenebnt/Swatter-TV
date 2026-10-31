// Programme TV : constantes, types et calculs partagés par le serveur et le client (aucune dépendance serveur).
// La chaîne n'est à l'antenne que le soir (src/lib/broadcast.ts) : le programme se lit soirée par soirée, de 18 h à
// 0 h 30. La frise, la vue liste et le JSON-LD montrent exactement les mêmes créneaux (slotsOfEvening).
import { dateChip, formatDayLong, parisDateTime, parisDay } from '@/lib/format'
import { BROADCAST_END, BROADCAST_MINUTES, BROADCAST_START, currentEvening, eveningOf, eveningWindow, shiftDay } from '@/lib/broadcast'
import type { Slot } from '@/lib/queries/schedule'

/**
 * Frise horaire d'une soirée : de 18 h à 0 h 30 du lendemain (heure de Paris), soit 390 minutes réelles tous les jours
 * (les changements d'heure ont lieu à 2 h / 3 h, hors de l'antenne).
 */
export const GRID_START = BROADCAST_START
export const GRID_MINUTES = BROADCAST_MINUTES
/** Largeur de la frise, en heures (6,5) : sert au calcul CSS, pas au nombre de graduations. */
export const GRID_HOURS = GRID_MINUTES / 60
/** Graduations, une par heure pleine : 18:00, 19:00… 00:00 (7) ; la dernière demi-heure finit au bord droit. */
export const RULER_HOURS = Math.ceil(GRID_HOURS)
/** Soirées proposées : celle en cours (ou à venir) et les six suivantes. */
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

/**
 * Créneau placé sur la frise d'une soirée : `start` / `end` rognés aux bornes de l'antenne (voir slotsOfEvening),
 * `from` / `to` en minutes depuis 18 h.
 */
export type GridSlot = {
  id: number
  title: string
  start: string
  end: string
  /** indice dans GridData.programs */
  prog: number
  from: number
  to: number
  /** commençait avant 18 h / finissait après 0 h 30 (ancienne donnée) : rogné, bord découpé */
  cutL?: true
  cutR?: true
  /**
   * vignette chargée tout de suite : autour de l'heure du rendu serveur (visible dès le défilement initial vers
   * « maintenant ») ; rendu hors antenne : les trois premières heures de la soirée à venir (la frise s'ouvre à 18 h)
   */
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

/** Les soirées proposées à partir de celle d'aujourd'hui (journée TV en cours). */
export const programmeDays = (today: string) => Array.from({ length: PROGRAMME_DAYS }, (_, i) => shiftDay(today, i))

/** Midi du jour : instant sûr pour formater la date (loin des changements d'heure). */
const noon = (day: string) => parisDateTime(day, '12:00')

/** « Ce soir », « Demain soir », « Hier soir », sinon « Sam. 18 » (la soirée qui commence ce jour-là). */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Ce soir'
  if (day === shiftDay(today, 1)) return 'Demain soir'
  if (day === shiftDay(today, -1)) return 'Hier soir'
  const { weekday, day: n } = dateChip(noon(day))
  return `${weekday} ${n}`
}

/** « samedi 18 octobre » */
export const dayLong = (day: string) => formatDayLong(noon(day))

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Adresse de la page Programme TV pour une soirée (ce soir : adresse canonique sans paramètre). */
export const programmeDayUrl = (day: string, today: string) => (day === today ? '/programme-tv' : `/programme-tv?jour=${day}`)

/** Créneau d'une soirée, rogné à l'antenne : `cutL` / `cutR` s'il commençait avant 18 h / finissait après 0 h 30. */
export type EveningSlot = Slot & { cutL?: true; cutR?: true }

/**
 * Créneaux de la soirée `day` (de 18 h à 0 h 30 le lendemain) : ceux qui chevauchent l'antenne, rognés à ses bornes
 * (début, fin et durée) ; un créneau entièrement hors antenne (ancienne donnée à 10 h…), vide, à l'envers ou illisible
 * est ignoré. Règle unique de la frise, de la vue liste et du JSON-LD. Deux soirées sont séparées de 17 h 30, plus que
 * la durée maximale d'un créneau : un créneau n'appartient jamais à deux soirées.
 */
export function slotsOfEvening(slots: Slot[], day: string): EveningSlot[] {
  const { start, end } = eveningWindow(day)
  const from = start.getTime()
  const to = end.getTime()
  const out: EveningSlot[] = []
  for (const s of slots) {
    const a = Date.parse(s.start)
    const b = Date.parse(s.end)
    if (!(b > a) || b <= from || a >= to) continue
    if (a >= from && b <= to) {
      out.push(s)
      continue
    }
    const a2 = Math.max(a, from)
    const b2 = Math.min(b, to)
    out.push({
      ...s,
      start: new Date(a2).toISOString(),
      end: new Date(b2).toISOString(),
      durationMinutes: Math.round((b2 - a2) / 60_000),
      ...(a < from ? { cutL: true as const } : {}),
      ...(b > to ? { cutR: true as const } : {}),
    })
  }
  return out
}

/** Fenêtre autour de « maintenant » dont les vignettes sont chargées d'emblée (le reste est chargé au défilement). */
const EAGER_BEFORE = 60 * 60_000
const EAGER_AFTER = 3 * 60 * 60_000

/** Répartit les créneaux sur les frises des soirées proposées (créneaux qui débordent rognés aux bords). */
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
  // Hors antenne, la frise s'ouvre au début de la soirée à venir : c'est autour de 18 h qu'il faut charger les vignettes
  const evening = currentEvening(new Date(now))
  const focus = evening.onAir ? now : evening.start.getTime()
  const days = programmeDays(today).map((key): GridDay => {
    const start = eveningWindow(key).start.getTime()
    const daySlots = slotsOfEvening(slots, key).map((s): GridSlot => {
      const a = Date.parse(s.start)
      const b = Date.parse(s.end)
      return {
        id: s.id,
        title: s.title,
        start: s.start,
        end: s.end,
        prog: progOf(s),
        from: (a - start) / 60_000,
        to: (b - start) / 60_000,
        ...(s.cutL ? { cutL: true as const } : {}),
        ...(s.cutR ? { cutR: true as const } : {}),
        ...(b > focus - EAGER_BEFORE && a < focus + EAGER_AFTER ? { eager: true as const } : {}),
      }
    })
    return { key, start: new Date(start).toISOString(), slots: daySlots }
  })
  return { today, days, programs }
}

/** Le créneau commence après minuit : il garde son heure (00:15) mais appartient à la soirée de la veille `day`. */
export const isAfterMidnight = (start: string, day: string) => parisDay(start) > day

/** Heure de Paris qui sépare les deux parties d'une soirée. */
const LATE_FROM = '21:00'

/**
 * Partie de la soirée `day` d'après l'heure de début : « Début de soirée » de 18 h à 21 h, « Soirée » ensuite, après
 * minuit compris (comparaison d'instants : un créneau de 00:15 reste en fin de soirée, jamais en tête).
 */
export function eveningPart(start: string, day: string): 'debut' | 'soiree' {
  return Date.parse(start) < parisDateTime(day, LATE_FROM).getTime() ? 'debut' : 'soiree'
}

export const EVENING_PARTS = [
  { value: 'debut', label: 'Début de soirée' },
  { value: 'soiree', label: 'Soirée' },
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
