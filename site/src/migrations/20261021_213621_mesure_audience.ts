import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ADD COLUMN "analytics_measurement_id" varchar;
  ALTER TABLE "_settings_v" ADD COLUMN "version_analytics_measurement_id" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" DROP COLUMN "analytics_measurement_id";
  ALTER TABLE "_settings_v" DROP COLUMN "version_analytics_measurement_id";`)
}
