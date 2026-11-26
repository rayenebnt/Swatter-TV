import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Pages éditoriales : la « Frise chronologique » (une seule par page) devient « Frises chronologiques », une liste de frises
// (« Le groupe » : l'évolution du logo, puis celle du matériel). La frise de chaque page, et de chacune de ses versions, est
// recopiée telle quelle comme première frise (titre, introduction, étapes avec leurs identifiants) avant que l'ancienne
// structure soit supprimée : rien n'est perdu. Les identifiants des nouvelles frises sont tirés de l'identifiant de la page,
// les mêmes pour la page et ses versions. Recopie seulement si l'ancienne structure existe et la nouvelle est vide (base de
// développement déjà au schéma du code). Retour en arrière (down) : la première frise de chaque page redevient sa frise.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "pages_timelines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"intro" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_timelines_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" varchar,
  	"title" varchar,
  	"image_id" integer,
  	"text" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_version_timelines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"intro" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_version_timelines_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" varchar,
  	"title" varchar,
  	"image_id" integer,
  	"text" varchar,
  	"_uuid" varchar
  );

  ALTER TABLE "pages_timelines" DROP CONSTRAINT IF EXISTS "pages_timelines_parent_id_fk";
  ALTER TABLE "pages_timelines" ADD CONSTRAINT "pages_timelines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_timelines_steps" DROP CONSTRAINT IF EXISTS "pages_timelines_steps_image_id_media_id_fk";
  ALTER TABLE "pages_timelines_steps" ADD CONSTRAINT "pages_timelines_steps_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_timelines_steps" DROP CONSTRAINT IF EXISTS "pages_timelines_steps_parent_id_fk";
  ALTER TABLE "pages_timelines_steps" ADD CONSTRAINT "pages_timelines_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_timelines"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_timelines" DROP CONSTRAINT IF EXISTS "_pages_v_version_timelines_parent_id_fk";
  ALTER TABLE "_pages_v_version_timelines" ADD CONSTRAINT "_pages_v_version_timelines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_timelines_steps" DROP CONSTRAINT IF EXISTS "_pages_v_version_timelines_steps_image_id_media_id_fk";
  ALTER TABLE "_pages_v_version_timelines_steps" ADD CONSTRAINT "_pages_v_version_timelines_steps_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_version_timelines_steps" DROP CONSTRAINT IF EXISTS "_pages_v_version_timelines_steps_parent_id_fk";
  ALTER TABLE "_pages_v_version_timelines_steps" ADD CONSTRAINT "_pages_v_version_timelines_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_version_timelines"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "pages_timelines_order_idx" ON "pages_timelines" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_timelines_parent_id_idx" ON "pages_timelines" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_timelines_steps_order_idx" ON "pages_timelines_steps" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_timelines_steps_parent_id_idx" ON "pages_timelines_steps" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_timelines_steps_image_idx" ON "pages_timelines_steps" USING btree ("image_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timelines_order_idx" ON "_pages_v_version_timelines" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timelines_parent_id_idx" ON "_pages_v_version_timelines" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timelines_steps_order_idx" ON "_pages_v_version_timelines_steps" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timelines_steps_parent_id_idx" ON "_pages_v_version_timelines_steps" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timelines_steps_image_idx" ON "_pages_v_version_timelines_steps" USING btree ("image_id");

  DO $$
  BEGIN
    -- pages : la frise (titre, introduction, étapes) devient la première frise de la liste
    IF to_regclass('public.pages_timeline_steps') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pages' AND column_name = 'timeline_title')
      AND NOT EXISTS (SELECT 1 FROM "pages_timelines") THEN
      INSERT INTO "pages_timelines" ("_order", "_parent_id", "id", "title", "intro")
        SELECT 1, p."id", substr(md5('frise-' || p."id"::text), 1, 24), p."timeline_title", p."timeline_intro"
        FROM "pages" p
        WHERE p."timeline_title" IS NOT NULL OR p."timeline_intro" IS NOT NULL
          OR EXISTS (SELECT 1 FROM "pages_timeline_steps" s WHERE s."_parent_id" = p."id");
      INSERT INTO "pages_timelines_steps" ("_order", "_parent_id", "id", "date", "title", "image_id", "text")
        SELECT s."_order", t."id", s."id", s."date", s."title", s."image_id", s."text"
        FROM "pages_timeline_steps" s JOIN "pages_timelines" t ON t."_parent_id" = s."_parent_id";
    END IF;
    -- versions des pages (brouillons et historique), de même
    IF to_regclass('public._pages_v_version_timeline_steps') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '_pages_v' AND column_name = 'version_timeline_title')
      AND NOT EXISTS (SELECT 1 FROM "_pages_v_version_timelines") THEN
      INSERT INTO "_pages_v_version_timelines" ("_order", "_parent_id", "title", "intro", "_uuid")
        SELECT 1, v."id", v."version_timeline_title", v."version_timeline_intro", substr(md5('frise-' || v."parent_id"::text), 1, 24)
        FROM "_pages_v" v
        WHERE v."version_timeline_title" IS NOT NULL OR v."version_timeline_intro" IS NOT NULL
          OR EXISTS (SELECT 1 FROM "_pages_v_version_timeline_steps" s WHERE s."_parent_id" = v."id");
      INSERT INTO "_pages_v_version_timelines_steps" ("_order", "_parent_id", "date", "title", "image_id", "text", "_uuid")
        SELECT s."_order", t."id", s."date", s."title", s."image_id", s."text", s."_uuid"
        FROM "_pages_v_version_timeline_steps" s JOIN "_pages_v_version_timelines" t ON t."_parent_id" = s."_parent_id";
    END IF;
  END $$;

  DROP TABLE IF EXISTS "pages_timeline_steps" CASCADE;
  DROP TABLE IF EXISTS "_pages_v_version_timeline_steps" CASCADE;
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "timeline_title";
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "timeline_intro";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_timeline_title";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_timeline_intro";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
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
  CREATE INDEX IF NOT EXISTS "_pages_v_version_timeline_steps_image_idx" ON "_pages_v_version_timeline_steps" USING btree ("image_id");

  DO $$
  BEGIN
    IF to_regclass('public.pages_timelines_steps') IS NOT NULL THEN
      -- la première frise de chaque page (et de chaque version) redevient sa frise ; les suivantes sont abandonnées
      UPDATE "pages" p SET "timeline_title" = t."title", "timeline_intro" = t."intro"
        FROM "pages_timelines" t
        WHERE t."_parent_id" = p."id" AND t."_order" = (SELECT min(x."_order") FROM "pages_timelines" x WHERE x."_parent_id" = p."id");
      INSERT INTO "pages_timeline_steps" ("_order", "_parent_id", "id", "date", "title", "image_id", "text")
        SELECT s."_order", t."_parent_id", s."id", s."date", s."title", s."image_id", s."text"
        FROM "pages_timelines_steps" s JOIN "pages_timelines" t ON t."id" = s."_parent_id"
        WHERE t."_order" = (SELECT min(x."_order") FROM "pages_timelines" x WHERE x."_parent_id" = t."_parent_id")
        ON CONFLICT DO NOTHING;
      UPDATE "_pages_v" v SET "version_timeline_title" = t."title", "version_timeline_intro" = t."intro"
        FROM "_pages_v_version_timelines" t
        WHERE t."_parent_id" = v."id" AND t."_order" = (SELECT min(x."_order") FROM "_pages_v_version_timelines" x WHERE x."_parent_id" = v."id");
      INSERT INTO "_pages_v_version_timeline_steps" ("_order", "_parent_id", "date", "title", "image_id", "text", "_uuid")
        SELECT s."_order", t."_parent_id", s."date", s."title", s."image_id", s."text", s."_uuid"
        FROM "_pages_v_version_timelines_steps" s JOIN "_pages_v_version_timelines" t ON t."id" = s."_parent_id"
        WHERE t."_order" = (SELECT min(x."_order") FROM "_pages_v_version_timelines" x WHERE x."_parent_id" = t."_parent_id");
    END IF;
  END $$;

  DROP TABLE IF EXISTS "pages_timelines_steps" CASCADE;
  DROP TABLE IF EXISTS "pages_timelines" CASCADE;
  DROP TABLE IF EXISTS "_pages_v_version_timelines_steps" CASCADE;
  DROP TABLE IF EXISTS "_pages_v_version_timelines" CASCADE;`)
}
