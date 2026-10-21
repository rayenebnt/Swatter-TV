// Bases de données des tests automatiques : même serveur PostgreSQL que DATABASE_URI (fichier .env), mais des bases
// dédiées, recréées à chaque lancement. Les contenus saisis dans la base de travail ne sont jamais touchés.

/** Adresse de connexion `uri` avec une autre base. */
export function withDatabase(uri: string, name: string): string {
  const url = new URL(uri)
  url.pathname = `/${name}`
  return url.toString()
}

/** Nom de la base dans une adresse de connexion. */
export const databaseName = (uri: string) => decodeURIComponent(new URL(uri).pathname.slice(1))

/** Adresse de la base de travail (fichier .env), à défaut celle du poste de développement. */
export const workDatabaseUri = () => process.env.DATABASE_URI || 'postgres://swatter:swatter@127.0.0.1:5432/swatter'

/** Base des tests d'intégration (Vitest) : TEST_DATABASE_NAME, sinon « <base de travail>_tests ». */
export function integrationDatabaseUri(): string {
  const work = workDatabaseUri()
  return withDatabase(work, process.env.TEST_DATABASE_NAME || `${databaseName(work)}_tests`)
}

/** Dossier des médias envoyés pendant les tests d'intégration (un par base : plusieurs lancements ne se gênent pas). */
export const integrationMediaDir = (root: string) => `${root}/.tests/media-${databaseName(integrationDatabaseUri())}`
