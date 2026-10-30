/* Fichier créé par Payload, complété : envoi de fichier refusé (GraphQL n'accepte que du JSON, src/hooks/envois.ts). */
import config from '@payload-config'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'
import { refuseGraphqlUpload } from '@/hooks/envois'

const graphql = GRAPHQL_POST(config)

export const POST = async (request: Request) => refuseGraphqlUpload(request) ?? graphql(request)

export const OPTIONS = REST_OPTIONS(config)
