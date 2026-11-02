import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Pages éditoriales : « Frise chronologique » (titre, introduction, étapes : date, titre, image, texte), affichée sous le
// texte (« Le groupe » : l'évolution du logo), dans les pages et leurs versions. Tables et colonnes ajoutées vides : aucune
// donnée touchée. IF NOT EXISTS : sans effet sur une base de développement où le schéma suivi du code (push) les a déjà
// ajoutées.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "pages_timeline_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" varchar,
  	"title" varchar,
  	"image_id" integer,
  	"text" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_version_timeline_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" varchar,
  	"title" varchar,
  	"image_id" integer,
  	"text" varchar,
  	"_uuid" varchar
  );

  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "timeline_title" varchar;
  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "timeline_intro" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN IF NOT EXISTS "version_timeline_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN IF NOT EXISTS "version_timeline_intro" varchar;
  ALTER TABLE "pages_timeline_steps" DROP CONSTRAINT IF EXISTS "pages_timeline_steps_image_id_media_id_fk";
  ALTER TABLE "pages_timeline_steps" ADD CONSTRAINT "pages_timeline_steps_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_timeline_steps" DROP CONSTRAINT IF EXISTS "pages_timeline_steps_parent_id_fk";
  ALTER TABLE "pages_timeline_steps" ADD CONSTRAINT "pages_timeline_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_timeline_steps" DROP CONSTRAINT IF EXISTS "_pages_v_version_timeline_steps_image_id_media_id_fk";
  ALTER TABLE "_pages_v_version_timeline_steps" ADD CONSTRAINT "_pages_v_version_timeline_steps_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_version_timeline_steps" DROP CONSTRAINT IF EXISTS "_pages_v_version_timeline_steps_parent_id_fk";
  ALTER TABLE "_pages_v_version_timeline_steps" ADD CONSTRAINT "_pages_v_version_timeline_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "pages_timeline_steps_order_idx" ON "pages_timeline_steps" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_timeline_steps_parent_id_idx" ON "pages_timeline_steps" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_timeline_steps_image_idx" ON "pages_timeline_steps" USING btree ("image_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timeline_steps_order_idx" ON "_pages_v_version_timeline_steps" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timeline_steps_parent_id_idx" ON "_pages_v_version_timeline_steps" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timeline_steps_image_idx" ON "_pages_v_version_timeline_steps" USING btree ("image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "pages_timeline_steps" CASCADE;
  DROP TABLE IF EXISTS "_pages_v_version_timeline_steps" CASCADE;
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "timeline_title";
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "timeline_intro";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_timeline_title";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_timeline_intro";`)
}
