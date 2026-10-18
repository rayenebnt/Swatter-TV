import config from '@payload-config'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import { publicationAware } from './publication'

/** Mode aperçu actif (cookie posé par /apercu après vérification du compte) ; faux hors requête (build, scripts). */
export async function isPreview(): Promise<boolean> {
  try {
    return (await draftMode()).isEnabled
  } catch {
    return false
  }
}

/** Client Payload (API locale, sans requête HTTP), limité aux contenus publiés hors aperçu. À utiliser côté serveur. */
export const getPayloadClient = async () => publicationAware(await getPayload({ config }), await isPreview())
