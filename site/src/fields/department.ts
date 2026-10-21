import type { Field } from 'payload'
import { DEPARTMENTS } from '@/lib/departments'

/** Département d'Auvergne-Rhône-Alpes (Info, Agenda, Webcams) : range le contenu dans la page de son département. */
export const departmentField = (description = 'Range ce contenu dans la page de son département.'): Field => ({
  name: 'department',
  label: 'Département',
  type: 'select',
  required: true,
  options: DEPARTMENTS.map(({ value, label }) => ({ value, label })),
  defaultValue: 'haute-savoie',
  index: true,
  admin: { description },
})
