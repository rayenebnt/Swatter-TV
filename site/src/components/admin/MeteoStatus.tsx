'use client'

import { useFormFields } from '@payloadcms/ui'

const format = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/**
 * Heure des dernières prévisions importées (champ d'affichage de la fiche Météo). Lue dans les prévisions elles-mêmes :
 * la date de modification de la fiche change aussi quand l'équipe enregistre un bulletin.
 */
export function MeteoStatus() {
  const forecast = useFormFields(([fields]) => fields.forecast?.value) as { updatedAt?: string } | null | undefined
  const auto = useFormFields(([fields]) => fields.autoUpdate?.value) as boolean | undefined
  const at = forecast?.updatedAt && !Number.isNaN(Date.parse(forecast.updatedAt)) ? new Date(forecast.updatedAt) : null
  return (
    <div className="sw-meteo-status">
      <strong>Dernières prévisions importées</strong>
      <span>{at ? format.format(at) : 'aucune pour l’instant'}</span>
      {auto === false && <span>La mise à jour automatique est désactivée : les prévisions ne changent plus.</span>}
    </div>
  )
}

export default MeteoStatus
