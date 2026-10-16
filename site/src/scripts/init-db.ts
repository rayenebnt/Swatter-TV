/**
 * Initialise la base (création des tables en développement) et crée un premier
 * administrateur si aucun n'existe : ADMIN_EMAIL / ADMIN_PASSWORD (variables d'environnement).
 * Usage : npm run payload run src/scripts/init-db.ts
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const payload = await getPayload({ config })
const { totalDocs } = await payload.count({ collection: 'users' })
if (totalDocs === 0) {
  const email = process.env.ADMIN_EMAIL || 'admin@swatter-tv.fr'
  const password = process.env.ADMIN_PASSWORD || 'swatter-admin-2026'
  await payload.create({ collection: 'users', data: { email, password, name: 'Administrateur', role: 'admin' } })
  payload.logger.info(`Administrateur créé : ${email}`)
} else {
  payload.logger.info(`${totalDocs} utilisateur(s) déjà présent(s).`)
}
process.exit(0)
