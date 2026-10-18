import type { CollectionConfig } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { draftVersions } from '@/fields/drafts'
import { revalidateHooks } from '@/hooks/revalidate'
import { copyWeekEndpoint } from '@/lib/schedule-copy'

/** Grille de diffusion : une ligne = une émission à une date et une heure. */
export const Schedule: CollectionConfig = {
  slug: 'schedule',
  labels: { singular: 'Créneau', plural: 'Grille des programmes' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['startsAt', 'program', 'titleOverride', 'durationMinutes'],
    description: 'Une ligne par émission diffusée : le jour et l’heure, l’émission, la durée.',
    // une semaine de programmes tient sur une seule page
    pagination: { defaultLimit: 300, limits: [50, 100, 300, 500] },
    components: { beforeListTable: ['/components/admin/ScheduleTools#ScheduleTools'] },
  },
  access: { read: publishedStatusOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  defaultSort: 'startsAt',
  endpoints: [copyWeekEndpoint],
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
        {
          name: 'startsAt',
          label: 'Jour et heure de début',
          type: 'date',
          required: true,
          index: true,
          // dans la liste : « mer. 21/10/2026 20:30 », jour de la semaine compris
          admin: { date: dateTimePicker(5), components: { Cell: '/components/admin/SlotTimeCell#SlotTimeCell' } },
        },
        { name: 'durationMinutes', label: 'Durée (minutes)', type: 'number', required: true, min: 1, max: 600, defaultValue: 30 },
      ],
    },
    { name: 'program', label: 'Émission', type: 'relationship', relationTo: 'programs', required: true },
    { name: 'titleOverride', label: 'Titre spécifique (facultatif)', type: 'text', admin: { description: 'Par ex. « Le journal des Alpes — Soir ». Sinon, le titre de l’émission est utilisé.' } },
    // « 18/10/2026 20:30 — Titre » : titre de la fiche et recherche de la liste
    { name: 'label', label: 'Titre de l’émission', type: 'text', admin: { hidden: true } },
  ],
}
