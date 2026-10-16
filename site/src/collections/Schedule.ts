import type { CollectionConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { revalidateHooks } from '@/hooks/revalidate'

/** Grille de diffusion : une ligne = une émission à une date et une heure. */
export const Schedule: CollectionConfig = {
  slug: 'schedule',
  labels: { singular: 'Créneau', plural: 'Grille des programmes' },
  admin: {
    useAsTitle: 'label',
    group: 'Programme TV',
    defaultColumns: ['startsAt', 'program', 'durationMinutes'],
    description: 'Ajoutez un créneau par émission diffusée (date, heure de début, durée).',
  },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  defaultSort: 'startsAt',
  hooks: {
    ...revalidateHooks,
    beforeChange: [
      async ({ data, req }) => {
        let title = data.titleOverride as string | undefined
        if (!title && data.program) {
          const id = typeof data.program === 'object' ? data.program.id : data.program
          const program = await req.payload.findByID({ collection: 'programs', id, depth: 0, req }).catch(() => null)
          title = program?.title
        }
        const when = data.startsAt
          ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.startsAt))
          : ''
        data.label = [when, title].filter(Boolean).join(' — ')
        return data
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'startsAt', label: 'Début', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayAndTime', timeIntervals: 5, displayFormat: 'dd/MM/yyyy HH:mm' } } },
        { name: 'durationMinutes', label: 'Durée (minutes)', type: 'number', required: true, min: 1, max: 600, defaultValue: 30 },
      ],
    },
    { name: 'program', label: 'Émission', type: 'relationship', relationTo: 'programs', required: true },
    { name: 'titleOverride', label: 'Titre spécifique (facultatif)', type: 'text', admin: { description: 'Par ex. « Le journal des Alpes — Soir ». Sinon, le titre de l’émission est utilisé.' } },
    { name: 'label', type: 'text', admin: { hidden: true } },
  ],
}
