import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "videos" ADD COLUMN "preview_id" integer;
  ALTER TABLE "_videos_v" ADD COLUMN "version_preview_id" integer;
  ALTER TABLE "replays" ADD COLUMN "preview_id" integer;
  ALTER TABLE "_replays_v" ADD COLUMN "version_preview_id" integer;
  ALTER TABLE "settings_hero_slides" ADD COLUMN "image_mobile_id" integer;
  ALTER TABLE "_settings_v_version_hero_slides" ADD COLUMN "image_mobile_id" integer;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_preview_id_media_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_videos_v" ADD CONSTRAINT "_videos_v_version_preview_id_media_id_fk" FOREIGN KEY ("version_preview_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "replays" ADD CONSTRAINT "replays_preview_id_media_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_replays_v" ADD CONSTRAINT "_replays_v_version_preview_id_media_id_fk" FOREIGN KEY ("version_preview_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings_hero_slides" ADD CONSTRAINT "settings_hero_slides_image_mobile_id_media_id_fk" FOREIGN KEY ("image_mobile_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_settings_v_version_hero_slides" ADD CONSTRAINT "_settings_v_version_hero_slides_image_mobile_id_media_id_fk" FOREIGN KEY ("image_mobile_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "videos_preview_idx" ON "videos" USING btree ("preview_id");
  CREATE INDEX "_videos_v_version_version_preview_idx" ON "_videos_v" USING btree ("version_preview_id");
  CREATE INDEX "replays_preview_idx" ON "replays" USING btree ("preview_id");
  CREATE INDEX "_replays_v_version_version_preview_idx" ON "_replays_v" USING btree ("version_preview_id");
  CREATE INDEX "settings_hero_slides_image_mobile_idx" ON "settings_hero_slides" USING btree ("image_mobile_id");
  CREATE INDEX "_settings_v_version_hero_slides_image_mobile_idx" ON "_settings_v_version_hero_slides" USING btree ("image_mobile_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "videos" DROP CONSTRAINT "videos_preview_id_media_id_fk";
  
  ALTER TABLE "_videos_v" DROP CONSTRAINT "_videos_v_version_preview_id_media_id_fk";
  
  ALTER TABLE "replays" DROP CONSTRAINT "replays_preview_id_media_id_fk";
  
  ALTER TABLE "_replays_v" DROP CONSTRAINT "_replays_v_version_preview_id_media_id_fk";
  
  ALTER TABLE "settings_hero_slides" DROP CONSTRAINT "settings_hero_slides_image_mobile_id_media_id_fk";
  
  ALTER TABLE "_settings_v_version_hero_slides" DROP CONSTRAINT "_settings_v_version_hero_slides_image_mobile_id_media_id_fk";
  
  DROP INDEX "videos_preview_idx";
  DROP INDEX "_videos_v_version_version_preview_idx";
  DROP INDEX "replays_preview_idx";
  DROP INDEX "_replays_v_version_version_preview_idx";
  DROP INDEX "settings_hero_slides_image_mobile_idx";
  DROP INDEX "_settings_v_version_hero_slides_image_mobile_idx";
  ALTER TABLE "videos" DROP COLUMN "preview_id";
  ALTER TABLE "_videos_v" DROP COLUMN "version_preview_id";
  ALTER TABLE "replays" DROP COLUMN "preview_id";
  ALTER TABLE "_replays_v" DROP COLUMN "version_preview_id";
  ALTER TABLE "settings_hero_slides" DROP COLUMN "image_mobile_id";
  ALTER TABLE "_settings_v_version_hero_slides" DROP COLUMN "image_mobile_id";`)
}
