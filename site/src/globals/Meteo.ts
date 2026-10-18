import type { GlobalConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
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
    group: 'Le site',
    description: 'Les prévisions se mettent à jour toutes seules, toutes les heures. Vous pouvez simplement remplacer le texte du jour par votre propre bulletin.',
  },
  access: { read: anyone, update: authenticated },
  hooks: {
    // Jour du bulletin saisi à la main : il ne remplace le texte automatique que ce jour-là (heure de Paris)
    beforeChange: [
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
    { name: 'updatedAt', label: 'Dernière mise à jour automatique', type: 'date', admin: { readOnly: true, date: dateTimePicker() } },
  ],
}
