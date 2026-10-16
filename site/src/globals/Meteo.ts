import type { GlobalConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { revalidateGlobal } from '@/hooks/revalidate'

/**
 * Prévisions météo. `forecast` est rempli automatiquement par l'import (Open-Meteo),
 * voir src/lib/import/meteo.ts ; le bulletin peut être réécrit à la main.
 */
export const Meteo: GlobalConfig = {
  slug: 'meteo',
  label: 'Météo',
  admin: { group: 'Réglages' },
  access: { read: anyone, update: authenticated },
  hooks: { afterChange: [revalidateGlobal] },
  fields: [
    { name: 'autoUpdate', label: 'Mise à jour automatique (toutes les heures)', type: 'checkbox', defaultValue: true },
    { name: 'bulletin', label: 'Bulletin du jour (facultatif)', type: 'textarea', admin: { description: 'Remplace le texte généré automatiquement pour aujourd’hui.' } },
    { name: 'forecast', label: 'Prévisions (données automatiques)', type: 'json', admin: { readOnly: true } },
    { name: 'updatedAt', label: 'Dernière mise à jour', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
