import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Médiathèque : « Lieu photographié » (facultatif), nom du sommet affiché sur une image de fond (carrousel de l'accueil,
// page Direct hors antenne). Colonne ajoutée vide : aucune donnée touchée. IF NOT EXISTS : sans effet sur une base de
// développement où le schéma suivi du code (push) l'a déjà ajoutée.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "place" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN IF EXISTS "place";`)
}
