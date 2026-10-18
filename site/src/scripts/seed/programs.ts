// Émissions et grille des programmes par défaut : quatre émissions « (exemple) » et une journée type répétée sur 8 jours,
// pour que le programme TV et l'accueil soient remplis en attendant la vraie grille du client.
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

/** Un créneau de la grille : heure locale (Paris), émission, titre spécifique facultatif. */
export type DaySlot = { time: string; program: string; title?: string }

/**
 * Créneaux d'une journée type (heure de Paris), du plus tôt au plus tard. La durée de chaque créneau
 * est calculée jusqu'au début du suivant : la grille est continue, sans trou ni chevauchement,
 * y compris les jours de changement d'heure (aucun créneau ne commence entre 2 h et 3 h).
 */
export function daySlots(): DaySlot[] {
  return [
    { time: '00:00', program: 'documentaire', title: 'Votre documentaire (exemple) — rediffusion' },
    { time: '06:00', program: 'journal' },
    { time: '06:30', program: 'meteo' },
    { time: '06:40', program: 'magazine' },
    { time: '12:00', program: 'journal' },
    { time: '12:30', program: 'meteo' },
    { time: '12:40', program: 'magazine' },
    { time: '18:00', program: 'journal' },
    { time: '18:30', program: 'magazine' },
    { time: '19:45', program: 'journal' },
    { time: '20:30', program: 'meteo' },
    { time: '20:45', program: 'documentaire' },
    { time: '22:30', program: 'magazine', title: 'Votre magazine (exemple) — rediffusion' },
  ]
}
