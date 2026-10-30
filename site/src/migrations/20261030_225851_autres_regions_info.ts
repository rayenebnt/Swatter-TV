import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// L'Info : « Autres régions » (Suisse, Vallée d'Aoste, hors Auvergne-Rhône-Alpes) ajoutée aux départements des articles.
// Seule la valeur est ajoutée aux deux types enum (articles et leurs versions) : ni colonne recréée, ni donnée touchée
// (les articles existants restent dans leur département). IF NOT EXISTS : sans effet sur une base de développement où
// le schéma suivi du code (push) a déjà ajouté la valeur.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_articles_department" ADD VALUE IF NOT EXISTS 'autres-regions';
  ALTER TYPE "public"."enum__articles_v_version_department" ADD VALUE IF NOT EXISTS 'autres-regions';`)
}

// PostgreSQL ne sait pas retirer une valeur d'un type enum : le retour arrière recrée les deux types sans elle (colonnes
// passées en texte le temps de l'opération). Les articles et versions rangés dans « Autres régions » reviennent d'abord en
// Haute-Savoie (valeur par défaut, où ils étaient classés avant), sans quoi la conversion vers l'ancien type échouerait.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "articles" SET "department" = 'haute-savoie' WHERE "department" = 'autres-regions';
  UPDATE "_articles_v" SET "version_department" = 'haute-savoie' WHERE "version_department" = 'autres-regions';
  ALTER TABLE "articles" ALTER COLUMN "department" SET DATA TYPE text;
  ALTER TABLE "articles" ALTER COLUMN "department" SET DEFAULT 'haute-savoie'::text;
  DROP TYPE "public"."enum_articles_department";
  CREATE TYPE "public"."enum_articles_department" AS ENUM('haute-savoie', 'savoie', 'ain', 'isere', 'rhone', 'loire', 'haute-loire', 'drome', 'ardeche', 'puy-de-dome', 'cantal', 'allier');
  ALTER TABLE "articles" ALTER COLUMN "department" SET DEFAULT 'haute-savoie'::"public"."enum_articles_department";
  ALTER TABLE "articles" ALTER COLUMN "department" SET DATA TYPE "public"."enum_articles_department" USING "department"::"public"."enum_articles_department";
  ALTER TABLE "_articles_v" ALTER COLUMN "version_department" SET DATA TYPE text;
  ALTER TABLE "_articles_v" ALTER COLUMN "version_department" SET DEFAULT 'haute-savoie'::text;
  DROP TYPE "public"."enum__articles_v_version_department";
  CREATE TYPE "public"."enum__articles_v_version_department" AS ENUM('haute-savoie', 'savoie', 'ain', 'isere', 'rhone', 'loire', 'haute-loire', 'drome', 'ardeche', 'puy-de-dome', 'cantal', 'allier');
  ALTER TABLE "_articles_v" ALTER COLUMN "version_department" SET DEFAULT 'haute-savoie'::"public"."enum__articles_v_version_department";
  ALTER TABLE "_articles_v" ALTER COLUMN "version_department" SET DATA TYPE "public"."enum__articles_v_version_department" USING "version_department"::"public"."enum__articles_v_version_department";`)
}
