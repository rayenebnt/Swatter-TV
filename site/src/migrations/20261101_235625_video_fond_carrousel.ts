import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Carrousel de l'accueil : « Vidéo de fond (facultative) » dans chaque diapositive (réglages et leurs versions). Colonne
// ajoutée vide : aucune donnée touchée (l'image de fond, devenue facultative avec une vidéo, était déjà sans NOT NULL).
// IF NOT EXISTS : sans effet sur une base de développement où le schéma suivi du code (push) l'a déjà ajoutée.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings_hero_slides" ADD COLUMN IF NOT EXISTS "video_id" integer;
  ALTER TABLE "_settings_v_version_hero_slides" ADD COLUMN IF NOT EXISTS "video_id" integer;
  ALTER TABLE "settings_hero_slides" DROP CONSTRAINT IF EXISTS "settings_hero_slides_video_id_media_id_fk";
  ALTER TABLE "settings_hero_slides" ADD CONSTRAINT "settings_hero_slides_video_id_media_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_settings_v_version_hero_slides" DROP CONSTRAINT IF EXISTS "_settings_v_version_hero_slides_video_id_media_id_fk";
  ALTER TABLE "_settings_v_version_hero_slides" ADD CONSTRAINT "_settings_v_version_hero_slides_video_id_media_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "settings_hero_slides_video_idx" ON "settings_hero_slides" USING btree ("video_id");
  CREATE INDEX IF NOT EXISTS "_settings_v_version_hero_slides_video_idx" ON "_settings_v_version_hero_slides" USING btree ("video_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings_hero_slides" DROP CONSTRAINT IF EXISTS "settings_hero_slides_video_id_media_id_fk";
  ALTER TABLE "_settings_v_version_hero_slides" DROP CONSTRAINT IF EXISTS "_settings_v_version_hero_slides_video_id_media_id_fk";
  DROP INDEX IF EXISTS "settings_hero_slides_video_idx";
  DROP INDEX IF EXISTS "_settings_v_version_hero_slides_video_idx";
  ALTER TABLE "settings_hero_slides" DROP COLUMN IF EXISTS "video_id";
  ALTER TABLE "_settings_v_version_hero_slides" DROP COLUMN IF EXISTS "video_id";`)
}
