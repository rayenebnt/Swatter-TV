import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ALTER COLUMN "protect_notice" SET DEFAULT 'Contenus protégés : reproduction interdite sans autorisation';
  ALTER TABLE "_settings_v" ALTER COLUMN "version_protect_notice" SET DEFAULT 'Contenus protégés : reproduction interdite sans autorisation';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ALTER COLUMN "protect_notice" SET DEFAULT 'Contenus protégés : captures et téléchargements détectés automatiquement';
  ALTER TABLE "_settings_v" ALTER COLUMN "version_protect_notice" SET DEFAULT 'Contenus protégés : captures et téléchargements détectés automatiquement';`)
}
