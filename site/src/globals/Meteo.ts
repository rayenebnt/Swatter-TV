import type { GlobalConfig } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { globalDraftVersions } from '@/fields/drafts'
import { revalidateGlobal } from '@/hooks/revalidate'
import { parisDay } from '@/lib/format'

/**
 * Prévisions météo. `forecast` est rempli automatiquement par l'import (Open-Meteo),
 * voir src/lib/import/meteo.ts ; le bulletin peut être réécrit à la main.
 */
export const Meteo: GlobalConfig = {
  slug: 'meteo',
  label: 'Météo',
  admin: {
    description: 'Les prévisions se mettent à jour toutes seules, toutes les heures. Vous pouvez simplement remplacer le texte du jour par votre propre bulletin.',
    // « Retirer du site » n'a pas de sens pour la météo
    components: { elements: { UnpublishButton: '/components/admin/NoUnpublish#NoUnpublish' } },
  },
  // API publique : jamais le brouillon
  access: { read: publishedStatusOrAuthenticated, update: authenticated },
  // bulletin enregistré en brouillon, publié au clic sur « Publier les modifications » (l'import publie les prévisions)
  versions: globalDraftVersions,
  forceSelect: { _status: true },
  hooks: {
    beforeChange: [
      // Enregistrement depuis l'administration : les prévisions viennent toujours de la version en ligne (celles du
      // formulaire datent de son ouverture et effaceraient un import fait entre-temps)
      async ({ data, req }) => {
        if (!req.user) return data
        const live = (await req.payload.db.findGlobal({ slug: 'meteo', req })) as { forecast?: unknown } | null
        return live?.forecast ? { ...data, forecast: live.forecast } : data
      },
      // Jour du bulletin saisi à la main : il ne remplace le texte automatique que ce jour-là (heure de Paris)
      ({ data, originalDoc }) => {
        const prev = String(originalDoc?.bulletin ?? '').trim()
        const next = String((data.bulletin === undefined ? originalDoc?.bulletin : data.bulletin) ?? '').trim()
        if (!next) return { ...data, bulletinDay: null }
        if (next !== prev) return { ...data, bulletinDay: parisDay() }
        return { ...data, bulletinDay: data.bulletinDay ?? originalDoc?.bulletinDay ?? parisDay() }
      },
    ],
    afterChange: [revalidateGlobal],
  },
  fields: [
    { name: 'autoUpdate', label: 'Mise à jour automatique (toutes les heures)', type: 'checkbox', defaultValue: true },
    { name: 'bulletin', label: 'Bulletin du jour (facultatif)', type: 'textarea', admin: { description: 'Remplace le texte généré automatiquement, aujourd’hui seulement : dès le lendemain, le texte automatique reprend.' } },
    { name: 'bulletinDay', label: 'Jour du bulletin', type: 'text', admin: { readOnly: true, hidden: true } },
    { name: 'forecast', label: 'Prévisions (données automatiques)', type: 'json', admin: { readOnly: true, hidden: true } },
    // date de modification de la fiche (change aussi quand l'équipe enregistre un bulletin) : l'heure de l'import
    // est lue dans les prévisions et affichée par MeteoStatus
    { name: 'updatedAt', label: 'Dernière modification', type: 'date', admin: { readOnly: true, hidden: true, date: dateTimePicker() } },
    { name: 'importStatus', type: 'ui', admin: { components: { Field: '/components/admin/MeteoStatus#MeteoStatus' } } },
  ],
}
