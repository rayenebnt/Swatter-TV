// Agenda par défaut : quelques modèles marqués « Exemple » (dates relatives au jour du lancement du script).
import type { DepartmentSlug } from '@/lib/departments'
import type { Event } from '@/payload-types'

/** Jour relatif : `from` = 'saturday' (samedi qui vient) ou 'today', plus `days` jours. */
export type RelDay = { from: 'saturday' | 'today'; days: number }

export type SeedEvent = {
  title: string
  city: string
  department: DepartmentSlug
  place?: string
  category: NonNullable<Event['category']>
  poster: string
  description: string
  start: RelDay & { time: string }
  end?: RelDay & { time: string }
  program?: { time: string; label: string }[]
  isWeekendPick?: boolean
}

const sat = (days: number, time: string) => ({ from: 'saturday' as const, days, time })
const today = (days: number, time: string) => ({ from: 'today' as const, days, time })

export const EVENTS: SeedEvent[] = [
  {
    title: 'Exemple — Votre sortie du week-end',
    city: 'Annecy',
    department: 'haute-savoie',
    place: 'Lieu à préciser',
    category: 'fete',
    poster: 'hero-matin',
    isWeekendPick: true,
    start: sat(0, '10:30'),
    end: sat(0, '18:00'),
    description:
      'Événement d’exemple : remplacez le titre, la date, la commune, le lieu, l’affiche et ce texte. « Sortie du week-end » cochée : il est mis en avant sur l’accueil et dans le carrousel.',
    program: [
      { time: '10h30', label: 'Exemple : premier temps fort de la journée' },
      { time: '12h00', label: 'Exemple : deuxième temps fort' },
      { time: 'Toute la journée', label: 'Exemple : animations (ce programme est facultatif)' },
    ],
  },
  {
    title: 'Exemple — Un marché ou une fête de village',
    city: 'Lyon',
    department: 'rhone',
    place: 'Lieu à préciser',
    category: 'marche',
    poster: 't-ete-b',
    start: sat(1, '08:00'),
    end: sat(1, '13:00'),
    description: 'Événement d’exemple : il apparaît dans l’agenda à la date choisie, puis disparaît tout seul une fois passé. Remplacez-le ou supprimez-le.',
  },
  {
    title: 'Exemple — Une soirée à annoncer',
    city: 'Grenoble',
    department: 'isere',
    place: 'Lieu à préciser',
    category: 'musique',
    poster: 't-nuit-b',
    start: today(3, '20:30'),
    end: today(3, '23:00'),
    description: 'Événement d’exemple : remplacez-le par un concert, un spectacle ou une rencontre de votre agenda.',
  },
]
