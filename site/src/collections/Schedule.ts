import { validations, type CollectionConfig, type Validate } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { draftVersions } from '@/fields/drafts'
import { revalidateHooks } from '@/hooks/revalidate'
import { BROADCAST_MINUTES, broadcastEvening, slotOutsideBroadcast } from '@/lib/broadcast'
import { copyWeekEndpoint } from '@/lib/schedule-copy'
import { offlineProgramMessage, programIdOf } from '@/lib/schedule-programs'
import { slotWhen } from '@/lib/schedule-week'

/** Règle d'antenne affichée à l'équipe (en tête de la liste de la grille et sous « Jour et heure de début »). */
const BROADCAST_RULE =
  'Diffusion tous les jours de 18 h à 0 h 30 (heure de Paris). Un créneau entre 0 h et 0 h 30 se saisit à la date du lendemain (ex. mardi 00:15) : il apparaît dans la soirée du lundi.'

/**
 * Début : contrôles habituels de Payload (obligatoire, date lisible), puis à l'antenne, de 18:00 à 00:25 heure de Paris
 * (broadcastEvening raisonne en heure de Paris, quel que soit le fuseau du navigateur de l'équipe).
 */
const validateStart: Validate = (value, options) => {
  const base = validations.date(value as Date, options as Parameters<typeof validations.date>[1])
  if (base !== true || !value) return base
  const start = new Date(value as string | Date)
  return broadcastEvening(start) ? true : (slotOutsideBroadcast(start, 0) ?? true)
}

/**
 * Durée : contrôles habituels (de 1 à 390 min), puis fin à 0 h 30 au plus tard. Contrôle croisé avec le début lu dans
 * `siblingData`, que Payload complète par la fiche enregistrée quand seule la durée change (PATCH { durationMinutes }) :
 * allonger un créneau de 23 h 45 au-delà de 45 min est refusé. Un début hors antenne est signalé sur son propre champ,
 * pas une deuxième fois ici.
 */
const validateDuration: Validate = (value, options) => {
  const base = validations.number(value as number, options as Parameters<typeof validations.number>[1])
  if (base !== true || typeof value !== 'number') return base
  const startsAt = (options.siblingData as { startsAt?: string | Date | null } | undefined)?.startsAt
  const start = startsAt ? new Date(startsAt) : null
  if (!start || !broadcastEvening(start)) return true
  return slotOutsideBroadcast(start, value) ?? true
}

/**
 * Émission : contrôles habituels (obligatoire, existante), puis en ligne. Une émission seulement enregistrée en brouillon
 * (« Ajouter » puis saisie, sans « Publier les modifications ») a une fiche principale vide : le site afficherait le
 * créneau sans son nom (« Programme »). Une émission retirée du site est refusée de même. Comme tous les contrôles, il
 * s'applique à la publication (pas aux brouillons) et dans le formulaire, où le message, avec le nom saisi, s'affiche sous
 * le champ (contrôle de champ plutôt que hook : le formulaire de Payload recalcule ses erreurs avec les contrôles des
 * champs, et effacerait celle d'un hook).
 */
const validateProgram: Validate = async (value, options) => {
  const base = await validations.relationship(value as never, options as Parameters<typeof validations.relationship>[1])
  const id = programIdOf(value)
  if (base !== true || id === null) return base
  const { req } = options
  const program = await req.payload.findByID({ collection: 'programs', id, depth: 0, req, disableErrors: true, select: { _status: true } })
  if (program?._status !== 'draft') return true
  const latest = await req.payload.findByID({ collection: 'programs', id, depth: 0, draft: true, req, disableErrors: true, select: { title: true } })
  return offlineProgramMessage(latest?.title)
}

/** Grille de diffusion : une ligne = une émission à une date et une heure, pendant l'antenne (18 h – 0 h 30). */
export const Schedule: CollectionConfig = {
  slug: 'schedule',
  labels: { singular: 'Créneau', plural: 'Grille des programmes' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['startsAt', 'program', 'titleOverride', 'durationMinutes'],
    description: `Une ligne par émission diffusée : le jour et l’heure, l’émission, la durée. ${BROADCAST_RULE}`,
    // une semaine de programmes tient sur une seule page
    pagination: { defaultLimit: 300, limits: [50, 100, 300, 500] },
    components: { beforeListTable: ['/components/admin/ScheduleTools#ScheduleTools'] },
  },
  access: { read: publishedStatusOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, sans contrôle (comme partout), publiés au clic sur « Publier les
  // modifications » : c'est là qu'un créneau hors antenne est refusé, avec le message des contrôles ci-dessus
  versions: draftVersions,
  defaultSort: 'startsAt',
  endpoints: [copyWeekEndpoint],
  hooks: {
    ...revalidateHooks,
    beforeChange: [
      ...revalidateHooks.beforeChange,
      async ({ data, req }) => {
        let title = data.titleOverride as string | undefined
        if (!title && data.program) {
          const id = typeof data.program === 'object' ? data.program.id : data.program
          const program = await req.payload.findByID({ collection: 'programs', id, depth: 0, req }).catch(() => null)
          title = program?.title
        }
        // « 21/10/2026 20:30 — Titre » ; après minuit, rattaché à sa soirée : « Soirée du 20/10/2026, 00:15 — Titre »
        const when = data.startsAt ? slotWhen(data.startsAt) : ''
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
          validate: validateStart,
          // dans la liste : « mer. 21/10/2026 20:30 », jour de la semaine compris ; après minuit, la soirée de rattachement
          admin: { date: dateTimePicker(5), description: BROADCAST_RULE, components: { Cell: '/components/admin/SlotTimeCell#SlotTimeCell' } },
        },
        {
          name: 'durationMinutes',
          label: 'Durée (minutes)',
          type: 'number',
          required: true,
          min: 1,
          // une soirée entière au plus : 18 h → 0 h 30
          max: BROADCAST_MINUTES,
          defaultValue: 30,
          validate: validateDuration,
          admin: { description: 'Le créneau finit à 0 h 30 au plus tard.' },
        },
      ],
    },
    {
      name: 'program',
      label: 'Émission',
      type: 'relationship',
      relationTo: 'programs',
      required: true,
      validate: validateProgram,
      admin: { description: 'L’émission doit être publiée (Programme TV › Émissions › « Publier les modifications ») pour que son nom apparaisse sur le site.' },
    },
    { name: 'titleOverride', label: 'Titre spécifique (facultatif)', type: 'text', admin: { description: 'Par ex. « Le journal des Alpes — Soir ». Sinon, le titre de l’émission est utilisé.' } },
    // « 18/10/2026 20:30 — Titre » : titre de la fiche et recherche de la liste
    { name: 'label', label: 'Titre de l’émission', type: 'text', admin: { hidden: true } },
  ],
}
