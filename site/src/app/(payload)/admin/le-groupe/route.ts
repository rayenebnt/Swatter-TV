// Raccourci de l'administration vers la page « Le groupe » (présentation et frises : logos, matériel), ouverte
// directement en modification : menu « Pages › Le groupe » et tableau de bord. Payload demande la connexion à l'arrivée ;
// seule l'adresse de la fiche est donnée ici (le numéro d'une page publique). Page absente : la liste des pages.
import config from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config })
  const admin = payload.config.routes.admin
  const { docs } = await payload
    .find({ collection: 'pages', where: { slug: { equals: 'le-groupe' } }, draft: true, limit: 1, depth: 0, select: {}, overrideAccess: true })
    .catch(() => ({ docs: [] as { id: number }[] }))
  const to = docs[0] ? `${admin}/collections/pages/${docs[0].id}` : `${admin}/collections/pages`
  // adresse relative : le navigateur reste sur le domaine du site (derrière le proxy, l'adresse interne serait autre)
  return new Response(null, { status: 307, headers: { Location: to, 'Cache-Control': 'no-store' } })
}
