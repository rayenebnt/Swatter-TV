/* Fichier créé par Payload, complété : les gros envois (multipart) sont réservés à l'équipe connectée (src/hooks/envois.ts). */
import config from '@payload-config'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'
import { getPayload } from 'payload'
import { refuseAnonymousUpload } from '@/hooks/envois'

const teamMember = async (headers: Headers) => (await (await getPayload({ config })).auth({ headers })).user

/** Gros envoi sans compte de l'équipe : refusé avant la lecture du corps (rien n'est écrit sur le disque). */
function guarded<A>(handler: (request: Request, args: A) => Promise<Response>) {
  return async (request: Request, args: A) => (await refuseAnonymousUpload(request, teamMember)) ?? handler(request, args)
}

export const GET = REST_GET(config)
export const POST = guarded(REST_POST(config))
export const DELETE = REST_DELETE(config)
export const PATCH = guarded(REST_PATCH(config))
export const PUT = guarded(REST_PUT(config))
export const OPTIONS = REST_OPTIONS(config)
