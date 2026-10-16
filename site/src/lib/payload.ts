import config from '@payload-config'
import { getPayload } from 'payload'

/** Client Payload (API locale, sans requête HTTP). À utiliser uniquement côté serveur. */
export const getPayloadClient = () => getPayload({ config })
