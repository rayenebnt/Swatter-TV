/**
 * Prépare la base des tests d'intégration (lancé par global-setup.ts dans un processus à part, par « payload run ») :
 * tables créées par Payload sur la base vide, puis comptes de test de l'équipe.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { ADMIN, EDITOR } from './accounts'

const payload = await getPayload({ config })
for (const account of [ADMIN, EDITOR]) await payload.create({ collection: 'users', data: account, overrideAccess: true })
process.exit(0)
