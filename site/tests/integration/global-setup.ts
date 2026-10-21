// Tests d'intégration : base dédiée recréée vide, puis tables et comptes de test (prepare.ts, processus à part qui
// s'arrête proprement). Lancé une fois, avant tous les fichiers de tests d'intégration (vitest.config.ts).
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { databaseName, integrationDatabaseUri, integrationMediaDir, withDatabase } from '../support/database'

export default async function setup() {
  const uri = integrationDatabaseUri()
  const name = databaseName(uri)
  const server = new pg.Client({ connectionString: withDatabase(uri, 'postgres') })
  try {
    await server.connect()
  } catch (error) {
    throw new Error(`PostgreSQL injoignable (${(error as Error).message}) : lancez la base (docker start swatter-db) puis relancez les tests.`)
  }
  await server.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await server.query(`CREATE DATABASE "${name}"`)
  await server.end()

  // médias des tests à part (jamais dans media/)
  const mediaDir = integrationMediaDir(path.resolve('.'))
  rmSync(mediaDir, { recursive: true, force: true })
  mkdirSync(mediaDir, { recursive: true })

  const prepared = spawnSync(process.execPath, [path.resolve('node_modules/payload/bin.js'), 'run', 'tests/integration/prepare.ts'], {
    env: { ...process.env, DATABASE_URI: uri, MEDIA_DIR: mediaDir, NODE_ENV: 'test', NODE_OPTIONS: '--no-deprecation' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180_000,
  })
  if (prepared.status !== 0) throw new Error(`Préparation de la base de test impossible :\n${prepared.stdout}\n${prepared.stderr}`)
}
