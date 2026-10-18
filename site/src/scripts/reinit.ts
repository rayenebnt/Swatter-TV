/**
 * Remise à neuf de la base de développement, sans aucune question : à lancer après un « git pull » qui change la
 * structure des données (sinon le serveur ou « npm run seed » peuvent rester bloqués sur une question de drizzle du type
 * « Is … column created or renamed from another column? »).
 * Usage : npm run reinit   (arrêtez d'abord « npm run dev »)
 *
 * 1. garde de côté les comptes utilisateurs (e-mail, mot de passe, nom, rôle) ;
 * 2. vide entièrement la base (schéma public) et la médiathèque (dossier media/) ;
 * 3. recrée les tables d'après le code (base vide : aucune question), puis remet les comptes ;
 * 4. recharge les contenus de départ « Exemple » (src/scripts/seed.ts).
 * Refuse de tourner en production.
 */
import fs from 'fs/promises'
import path from 'path'
import pg from 'pg'
import { fileURLToPath } from 'url'

if (process.env.NODE_ENV === 'production') {
  console.error('✖ npm run reinit efface toute la base : réservé au poste de développement.')
  process.exit(1)
}
const uri = process.env.DATABASE_URI
if (!uri) {
  console.error('✖ DATABASE_URI manquant (fichier .env).')
  process.exit(1)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
type Row = Record<string, unknown>

const client = new pg.Client({ connectionString: uri })
await client.connect()

// 1. Comptes à conserver (s'il y a déjà une table users)
const { rows: tables } = await client.query<{ exists: boolean }>("select to_regclass('public.users') is not null as exists")
const users: Row[] = tables[0]?.exists ? (await client.query<Row>('select * from users order by id')).rows : []

// 2. Base et médiathèque vidées
await client.query('drop schema public cascade; create schema public;')
await client.end()
await fs.rm(path.join(ROOT, 'media'), { recursive: true, force: true })
console.log(`Base vidée${users.length ? ` (${users.length} compte(s) mis de côté)` : ''}.`)

// 3. Tables recréées par Payload (schéma poussé sur une base vide), puis comptes remis
const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
const payload = await getPayload({ config })

if (users.length) {
  const db = new pg.Client({ connectionString: uri })
  await db.connect()
  const { rows: cols } = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'users'")
  const keep = new Set(cols.map((c) => c.column_name))
  // les colonnes qui existent encore ; jamais les jetons ni les blocages de l'ancienne base
  const skip = new Set(['reset_password_token', 'reset_password_expiration', 'reset_password_requested_at', 'login_attempts', 'lock_until'])
  for (const user of users) {
    const names = Object.keys(user).filter((k) => keep.has(k) && !skip.has(k))
    await db.query(
      `insert into users (${names.map((n) => `"${n}"`).join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')})`,
      names.map((n) => user[n]),
    )
  }
  await db.query("select setval(pg_get_serial_sequence('users', 'id'), (select max(id) from users))")
  await db.end()
  payload.logger.info(`${users.length} compte(s) remis : mêmes e-mails et mots de passe qu'avant.`)
} else {
  await payload.create({ collection: 'users', data: { email: 'admin@swatter-tv.fr', password: 'swatter-admin-2026', name: 'Administrateur', role: 'admin' } })
  payload.logger.info('Administrateur créé : admin@swatter-tv.fr / swatter-admin-2026')
}

// 4. Contenus de départ (le script se termine tout seul une fois les contenus créés)
await import('./seed')
