/**
 * Met la base de développement à jour après un « git pull », SANS rien effacer de vos contenus (contrairement à
 * npm run reinit). Usage : npm run maj-base   (arrêtez d'abord « npm run dev »)
 *
 * Les colonnes supprimées du code, qui feraient poser à drizzle une question du type « Is … column created or renamed
 * from another column? », sont retirées d'abord ; Payload ajoute ensuite les nouvelles tables et colonnes.
 * Refuse de tourner en production (la base de production se met à jour par les migrations : npm run payload migrate).
 */
import pg from 'pg'

if (process.env.NODE_ENV === 'production') {
  console.error('✖ En production, la base se met à jour par les migrations : npm run payload migrate')
  process.exit(1)
}
const uri = process.env.DATABASE_URI
if (!uri) {
  console.error('✖ DATABASE_URI manquant (fichier .env).')
  process.exit(1)
}

/** Colonnes retirées du code : [table, colonne, ce qu'elle contenait]. À compléter quand un champ disparaît. */
const OBSOLETE: [string, string, string][] = [
  ['youtube', 'in_videos', 'ancienne case « Afficher dans Vidéos » de la fiche Chaîne YouTube'],
  ['youtube', 'in_replays', 'ancienne case « Afficher dans Replays » de la fiche Chaîne YouTube'],
  ['members', 'verified', 'ancienne case « E-mail confirmé » des membres (plus de confirmation par e-mail)'],
  ['members', 'verify_token_hash', 'ancien jeton du lien de confirmation des membres'],
  ['members', 'verify_token_expires', 'ancienne expiration du lien de confirmation des membres'],
]

const client = new pg.Client({ connectionString: uri })
await client.connect()
for (const [table, column, what] of OBSOLETE) {
  const { rowCount } = await client.query(
    "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2",
    [table, column],
  )
  if (!rowCount) continue
  await client.query(`alter table "${table}" drop column "${column}"`)
  console.log(`Colonne retirée : ${table}.${column} (${what})`)
}
await client.end()

// Payload compare la base au code et ajoute ce qui manque (nouvelles tables, nouvelles colonnes)
const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
const payload = await getPayload({ config })
const counts = await Promise.all(
  (['articles', 'events', 'videos', 'replays', 'programs', 'webcams', 'pages', 'users'] as const).map(
    async (collection) => `${collection} ${(await payload.count({ collection, overrideAccess: true })).totalDocs}`,
  ),
)
console.log(`\n✔ Base à jour, contenus conservés : ${counts.join(' · ')}`)
process.exit(0)
