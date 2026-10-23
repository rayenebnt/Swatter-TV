import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ALTER COLUMN "tagline" SET DEFAULT 'Swatter TV Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Auvergne-Rhône-Alpes.';
  ALTER TABLE "_settings_v" ALTER COLUMN "version_tagline" SET DEFAULT 'Swatter TV Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Auvergne-Rhône-Alpes.';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ALTER COLUMN "tagline" SET DEFAULT 'Swatter TV & Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Auvergne-Rhône-Alpes.';
  ALTER TABLE "_settings_v" ALTER COLUMN "version_tagline" SET DEFAULT 'Swatter TV & Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Auvergne-Rhône-Alpes.';`)
}
