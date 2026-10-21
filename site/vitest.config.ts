import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vitest/config'
import { integrationDatabaseUri, integrationMediaDir } from './tests/support/database'

/**
 * Tests unitaires (logique pure, sans base ni serveur) et tests d'intégration (Payload sur une base dédiée, recréée à
 * chaque lancement). Lancer : npm test (les deux), npm run test:unit, npm run test:integration.
 * Les tests de bout en bout (navigateur) sont à part : Playwright, npm run test:e2e ou npm run test:complet.
 */
const root = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.join(root, '.env') })

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@payload-config$/, replacement: path.join(root, 'src/payload.config.ts') },
      { find: /^@\//, replacement: `${path.join(root, 'src')}/` },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unitaires', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          // une seule base pour tous les fichiers : l'un après l'autre
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 180_000,
          env: {
            DATABASE_URI: integrationDatabaseUri(),
            MEDIA_DIR: integrationMediaDir(root),
            NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
            PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'secret-des-tests-d-integration',
            CRON_SECRET: 'secret-cron-des-tests',
            // pas d'envoi d'e-mails ni de services extérieurs pendant les tests
            SMTP_HOST: '',
            S3_BUCKET: '',
            // faux services : à lancer par le test qui en a besoin (tests/mocks/open-meteo.mjs, tests/e2e/youtube-mock.ts)
            OPEN_METEO_URL: `http://127.0.0.1:${process.env.TEST_METEO_MOCK_PORT || 8772}/v1/forecast`,
            YOUTUBE_BASE: `http://127.0.0.1:${process.env.TEST_YOUTUBE_MOCK_PORT || 8773}`,
            YOUTUBE_THUMB_BASE: `http://127.0.0.1:${process.env.TEST_YOUTUBE_MOCK_PORT || 8773}/vi`,
            MEMBER_RATE_FACTOR: '1',
            TRUSTED_PROXY_HOPS: '',
          },
        },
      },
    ],
  },
})
