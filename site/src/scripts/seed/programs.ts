// Émissions et grille des programmes par défaut : quatre émissions « (exemple) » et une soirée type (18 h – 0 h 30, les
// horaires d'antenne) répétée sur 8 jours, pour que le programme TV et l'accueil soient remplis en attendant la vraie
// grille du client.
import { eveningWindow, shiftDay, slotOutsideBroadcast } from '@/lib/broadcast'
import { parisDateTime } from '@/lib/format'
import type { Program } from '@/payload-types'

export type SeedProgram = {
  key: string
  title: string
  genre: Program['genre']
  image: string
  synopsis: string
  isPremiere?: boolean
}

const EDIT = 'Émission d’exemple : remplacez le nom, le genre, l’image et ce texte dans « Émissions », ou supprimez-la.'

export const PROGRAMS: SeedProgram[] = [
  { key: 'journal', title: 'Le journal (exemple)', genre: 'info', image: 't-crepuscule-c', synopsis: `${EDIT} Ici : votre journal d’information.` },
  { key: 'meteo', title: 'La météo (exemple)', genre: 'meteo', image: 't-nuages-b', synopsis: `${EDIT} Ici : votre bulletin météo.` },
  { key: 'magazine', title: 'Votre magazine (exemple)', genre: 'magazine', image: 't-ete-a', synopsis: `${EDIT} Ici : un magazine ou une émission de plateau.` },
  { key: 'documentaire', title: 'Votre documentaire (exemple)', genre: 'documentaire', image: 'hero-crepuscule', synopsis: `${EDIT} Ici : le programme de la soirée.` },
]

/** Un créneau de la soirée : heure locale (Paris), le lendemain si `nextDay` (après minuit), émission, titre facultatif. */
export type EveningSlot = { time: string; nextDay?: true; program: string; title?: string }

/**
 * Créneaux d'une soirée type (heure de Paris), de 18 h à 0 h 30 (horaires d'antenne, src/lib/broadcast.ts), du plus tôt
 * au plus tard. La durée de chaque créneau est calculée jusqu'au début du suivant, le dernier jusqu'à 0 h 30 : la soirée
 * est continue, sans trou ni chevauchement (aucun changement d'heure entre 18 h et 0 h 30).
 */
export function eveningSlots(): EveningSlot[] {
  return [
    { time: '18:00', program: 'journal' },
    { time: '18:30', program: 'magazine' },
    { time: '19:45', program: 'journal' },
    { time: '20:30', program: 'meteo' },
    { time: '20:45', program: 'documentaire' },
    { time: '22:30', program: 'magazine', title: 'Votre magazine (exemple) — rediffusion' },
    { time: '23:30', program: 'journal', title: 'Le journal (exemple) — dernière édition' },
    { time: '00:00', nextDay: true, program: 'documentaire', title: 'Votre documentaire (exemple) — rediffusion' },
  ]
}

/**
 * Créneaux à créer pour la soirée type du jour `day` (AAAA-MM-JJ) : chacun dure jusqu'au début du suivant, le dernier
 * jusqu'à 0 h 30. `programId` : numéro de l'émission d'exemple (clé de PROGRAMS). Vérifiés avec les règles de la saisie.
 */
export function eveningScheduleData(day: string, programId: (key: string) => number) {
  const evening = eveningSlots().map((s) => ({ ...s, start: parisDateTime(s.nextDay ? shiftDay(day, 1) : day, s.time) }))
  const close = eveningWindow(day).end
  return evening.map((s, j) => {
    const end = j + 1 < evening.length ? evening[j + 1].start : close
    const durationMinutes = Math.round((end.getTime() - s.start.getTime()) / 60_000)
    if (slotOutsideBroadcast(s.start, durationMinutes) || durationMinutes <= 0) throw new Error(`Créneau invalide à ${s.start.toISOString()} (${durationMinutes} min)`)
    return { _status: 'published' as const, startsAt: s.start.toISOString(), durationMinutes, program: programId(s.program), titleOverride: s.title }
  })
}
