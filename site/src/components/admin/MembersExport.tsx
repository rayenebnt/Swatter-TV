import type { BeforeListTableServerProps } from 'payload'
import { AdminIcon } from './icons'

/**
 * Au-dessus de la liste « Membres du site » (admin.components.beforeListTable de la collection members) : combien de
 * membres acceptent les e-mails de Swatter TV, et l'export de leur liste au format CSV (Excel, Brevo, Mailjet…).
 * Le fichier est produit par GET /api/membres/lettre-info.csv, réservé aux administrateurs (src/lib/members/endpoints.ts).
 */
export async function MembersExport({ payload, user }: BeforeListTableServerProps) {
  if ((user as { role?: string } | null | undefined)?.role !== 'admin') return null
  // mêmes conditions que l'export : compte non suspendu, case « e-mails » cochée par le membre
  const subscribers = await payload
    .count({
      collection: 'members',
      where: { and: [{ newsletter: { equals: true } }, { blocked: { not_equals: true } }] },
      overrideAccess: true,
    })
    .then((r) => r.totalDocs)
    .catch(() => null)

  return (
    <div className="sw-meteo-status sw-youtube">
      <strong>Lettre d’information</strong>
      <span>
        {subscribers === null
          ? 'Les membres qui ont accepté de recevoir les e-mails de Swatter TV (comptes suspendus exclus).'
          : subscribers === 0
            ? 'Aucun membre n’a encore accepté de recevoir les e-mails de Swatter TV.'
            : `${subscribers} membre${subscribers > 1 ? 's acceptent' : ' accepte'} de recevoir les e-mails de Swatter TV (comptes suspendus exclus).`}
      </span>
      <span>Le fichier s’ouvre dans Excel et s’importe dans votre outil d’envoi (Brevo, Mailjet…). Il contient des données personnelles : ne le partagez pas.</span>
      <div>
        <a className="sw-btn" href={`${payload.config.routes.api}/membres/lettre-info.csv`} download>
          <AdminIcon name="download" />
          Exporter les inscrits à la lettre d’info (CSV)
        </a>
      </div>
    </div>
  )
}

export default MembersExport
