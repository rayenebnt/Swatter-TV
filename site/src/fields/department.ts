import type { Field } from 'payload'
import { DEPARTMENTS } from '@/lib/departments'

type Zone = { readonly value: string; readonly label: string }

/**
 * Département d'Auvergne-Rhône-Alpes (Info, Agenda) : range le contenu dans la page de son département. `zones` : les
 * choix proposés, les 12 départements par défaut ; l'Info passe INFO_ZONES (« Autres régions » en plus).
 */
export const departmentField = (description = 'Range ce contenu dans la page de son département.', zones: readonly Zone[] = DEPARTMENTS): Field => ({
  name: 'department',
  label: 'Département',
  type: 'select',
  required: true,
  options: zones.map(({ value, label }) => ({ value, label })),
  defaultValue: 'haute-savoie',
  index: true,
  admin: { description },
})
