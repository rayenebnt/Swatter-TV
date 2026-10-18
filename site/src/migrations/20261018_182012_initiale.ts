import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_videos_source_provider" AS ENUM('youtube', 'bunny', 'url', 'upload');
  CREATE TYPE "public"."enum_videos_category" AS ENUM('divertissement', 'series-realite', 'series', 'cinema', 'documentaire', 'nature', 'sport', 'info', 'magazine');
  CREATE TYPE "public"."enum_videos_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__videos_v_version_source_provider" AS ENUM('youtube', 'bunny', 'url', 'upload');
  CREATE TYPE "public"."enum__videos_v_version_category" AS ENUM('divertissement', 'series-realite', 'series', 'cinema', 'documentaire', 'nature', 'sport', 'info', 'magazine');
  CREATE TYPE "public"."enum__videos_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_articles_department" AS ENUM('haute-savoie', 'savoie', 'ain', 'isere', 'rhone', 'loire', 'haute-loire', 'drome', 'ardeche', 'puy-de-dome', 'cantal', 'allier');
  CREATE TYPE "public"."enum_articles_source" AS ENUM('manual', 'rss');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_department" AS ENUM('haute-savoie', 'savoie', 'ain', 'isere', 'rhone', 'loire', 'haute-loire', 'drome', 'ardeche', 'puy-de-dome', 'cantal', 'allier');
  CREATE TYPE "public"."enum__articles_v_version_source" AS ENUM('manual', 'rss');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_events_category" AS ENUM('terroir', 'musique', 'sport', 'famille', 'culture', 'fete', 'marche', 'autre');
  CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__events_v_version_category" AS ENUM('terroir', 'musique', 'sport', 'famille', 'culture', 'fete', 'marche', 'autre');
  CREATE TYPE "public"."enum__events_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_replays_source_provider" AS ENUM('youtube', 'bunny', 'url', 'upload');
  CREATE TYPE "public"."enum_replays_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__replays_v_version_source_provider" AS ENUM('youtube', 'bunny', 'url', 'upload');
  CREATE TYPE "public"."enum__replays_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_programs_genre" AS ENUM('info', 'meteo', 'documentaire', 'magazine', 'agenda', 'divertissement', 'sport', 'serie', 'cinema');
  CREATE TYPE "public"."enum_webcams_provider" AS ENUM('iframe', 'hls', 'youtube', 'image');
  CREATE TYPE "public"."enum_ads_placement" AS ENUM('home-leaderboard', 'inner-leaderboard');
  CREATE TYPE "public"."enum_pages_footer_group" AS ENUM('chaine', 'swatter');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_footer_group" AS ENUM('chaine', 'swatter');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_rss_feeds_department" AS ENUM('haute-savoie', 'savoie', 'ain', 'isere', 'rhone', 'loire', 'haute-loire', 'drome', 'ardeche', 'puy-de-dome', 'cantal', 'allier');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editeur');
  CREATE TYPE "public"."enum_redirects_to_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_settings_hero_slides_badges_style" AS ENUM('live', 'gold', 'glass');
  CREATE TYPE "public"."enum_settings_hero_slides_kind" AS ENUM('live', 'custom');
  CREATE TYPE "public"."enum_settings_live_provider" AS ENUM('youtube', 'twitch', 'bunny', 'url', 'upload');
  CREATE TYPE "public"."enum_settings_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__settings_v_version_hero_slides_badges_style" AS ENUM('live', 'gold', 'glass');
  CREATE TYPE "public"."enum__settings_v_version_hero_slides_kind" AS ENUM('live', 'custom');
  CREATE TYPE "public"."enum__settings_v_version_live_provider" AS ENUM('youtube', 'twitch', 'bunny', 'url', 'upload');
  CREATE TYPE "public"."enum__settings_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_youtube_publish_mode" AS ENUM('published', 'draft');
  CREATE TYPE "public"."enum_youtube_category" AS ENUM('divertissement', 'series-realite', 'series', 'cinema', 'documentaire', 'nature', 'sport', 'info', 'magazine');
  CREATE TABLE "videos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"source_provider" "enum_videos_source_provider" DEFAULT 'youtube',
  	"source_youtube_url" varchar,
  	"source_bunny_video_id" varchar,
  	"source_url" varchar,
  	"source_file_id" integer,
  	"thumbnail_id" integer,
  	"category" "enum_videos_category" DEFAULT 'divertissement',
  	"duration" varchar,
  	"description" varchar,
  	"published_at" timestamp(3) with time zone,
  	"is_video_of_day" boolean DEFAULT false,
  	"top10_rank" numeric,
  	"slug" varchar,
  	"views" numeric DEFAULT 0,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_videos_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_videos_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_source_provider" "enum__videos_v_version_source_provider" DEFAULT 'youtube',
  	"version_source_youtube_url" varchar,
  	"version_source_bunny_video_id" varchar,
  	"version_source_url" varchar,
  	"version_source_file_id" integer,
  	"version_thumbnail_id" integer,
  	"version_category" "enum__videos_v_version_category" DEFAULT 'divertissement',
  	"version_duration" varchar,
  	"version_description" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_is_video_of_day" boolean DEFAULT false,
  	"version_top10_rank" numeric,
  	"version_slug" varchar,
  	"version_views" numeric DEFAULT 0,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__videos_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"excerpt" varchar,
  	"image_id" integer,
  	"content" jsonb,
  	"image_url" varchar,
  	"department" "enum_articles_department" DEFAULT 'haute-savoie',
  	"city" varchar,
  	"kicker" varchar,
  	"published_at" timestamp(3) with time zone,
  	"is_info_of_day" boolean DEFAULT false,
  	"source" "enum_articles_source" DEFAULT 'manual',
  	"source_name" varchar,
  	"source_url" varchar,
  	"slug" varchar,
  	"guid" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_excerpt" varchar,
  	"version_image_id" integer,
  	"version_content" jsonb,
  	"version_image_url" varchar,
  	"version_department" "enum__articles_v_version_department" DEFAULT 'haute-savoie',
  	"version_city" varchar,
  	"version_kicker" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_is_info_of_day" boolean DEFAULT false,
  	"version_source" "enum__articles_v_version_source" DEFAULT 'manual',
  	"version_source_name" varchar,
  	"version_source_url" varchar,
  	"version_slug" varchar,
  	"version_guid" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "events_program" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"time" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"city" varchar,
  	"place" varchar,
  	"category" "enum_events_category" DEFAULT 'autre',
  	"poster_id" integer,
  	"description" varchar,
  	"external_url" varchar,
  	"is_weekend_pick" boolean DEFAULT false,
  	"slug" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_events_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_events_v_version_program" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"time" varchar,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_events_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_start_date" timestamp(3) with time zone,
  	"version_end_date" timestamp(3) with time zone,
  	"version_city" varchar,
  	"version_place" varchar,
  	"version_category" "enum__events_v_version_category" DEFAULT 'autre',
  	"version_poster_id" integer,
  	"version_description" varchar,
  	"version_external_url" varchar,
  	"version_is_weekend_pick" boolean DEFAULT false,
  	"version_slug" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__events_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "replays" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"program_id" integer,
  	"source_provider" "enum_replays_source_provider" DEFAULT 'youtube',
  	"source_youtube_url" varchar,
  	"source_bunny_video_id" varchar,
  	"source_url" varchar,
  	"source_file_id" integer,
  	"thumbnail_id" integer,
  	"broadcast_at" timestamp(3) with time zone,
  	"duration" varchar,
  	"description" varchar,
  	"slug" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_replays_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_replays_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_program_id" integer,
  	"version_source_provider" "enum__replays_v_version_source_provider" DEFAULT 'youtube',
  	"version_source_youtube_url" varchar,
  	"version_source_bunny_video_id" varchar,
  	"version_source_url" varchar,
  	"version_source_file_id" integer,
  	"version_thumbnail_id" integer,
  	"version_broadcast_at" timestamp(3) with time zone,
  	"version_duration" varchar,
  	"version_description" varchar,
  	"version_slug" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__replays_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "schedule" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"duration_minutes" numeric DEFAULT 30 NOT NULL,
  	"program_id" integer NOT NULL,
  	"title_override" varchar,
  	"label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "programs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"genre" "enum_programs_genre" DEFAULT 'magazine' NOT NULL,
  	"image_id" integer,
  	"synopsis" varchar,
  	"is_premiere" boolean DEFAULT false,
  	"slug" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "webcams" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"place" varchar,
  	"provider" "enum_webcams_provider" DEFAULT 'iframe' NOT NULL,
  	"embed_url" varchar NOT NULL,
  	"image_id" integer NOT NULL,
  	"temperature" varchar,
  	"order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"placement" "enum_ads_placement" DEFAULT 'home-leaderboard' NOT NULL,
  	"image_id" integer NOT NULL,
  	"image_mobile_id" integer,
  	"link" varchar,
  	"starts_at" timestamp(3) with time zone,
  	"ends_at" timestamp(3) with time zone,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"intro" varchar,
  	"content" jsonb,
  	"footer_group" "enum_pages_footer_group",
  	"slug" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_intro" varchar,
  	"version_content" jsonb,
  	"version_footer_group" "enum__pages_v_version_footer_group",
  	"version_slug" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"credit" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumb_url" varchar,
  	"sizes_thumb_width" numeric,
  	"sizes_thumb_height" numeric,
  	"sizes_thumb_mime_type" varchar,
  	"sizes_thumb_filesize" numeric,
  	"sizes_thumb_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_poster_url" varchar,
  	"sizes_poster_width" numeric,
  	"sizes_poster_height" numeric,
  	"sizes_poster_mime_type" varchar,
  	"sizes_poster_filesize" numeric,
  	"sizes_poster_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar,
  	"sizes_og_url" varchar,
  	"sizes_og_width" numeric,
  	"sizes_og_height" numeric,
  	"sizes_og_mime_type" varchar,
  	"sizes_og_filesize" numeric,
  	"sizes_og_filename" varchar
  );
  
  CREATE TABLE "rss_feeds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"department" "enum_rss_feeds_department" DEFAULT 'haute-savoie' NOT NULL,
  	"city" varchar,
  	"kicker" varchar,
  	"active" boolean DEFAULT true,
  	"last_fetched_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'editeur' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"from" varchar NOT NULL,
  	"to_type" "enum_redirects_to_type" DEFAULT 'reference',
  	"to_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "redirects_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer,
  	"articles_id" integer,
  	"videos_id" integer,
  	"replays_id" integer,
  	"events_id" integer
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"videos_id" integer,
  	"articles_id" integer,
  	"events_id" integer,
  	"replays_id" integer,
  	"schedule_id" integer,
  	"programs_id" integer,
  	"webcams_id" integer,
  	"ads_id" integer,
  	"pages_id" integer,
  	"media_id" integer,
  	"rss_feeds_id" integer,
  	"users_id" integer,
  	"redirects_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "settings_hero_slides_badges" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"style" "enum_settings_hero_slides_badges_style" DEFAULT 'glass'
  );
  
  CREATE TABLE "settings_hero_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_settings_hero_slides_kind" DEFAULT 'custom',
  	"title_line1" varchar,
  	"title_line2" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"nav_label" varchar,
  	"primary_label" varchar,
  	"primary_href" varchar,
  	"secondary_label" varchar,
  	"secondary_href" varchar
  );
  
  CREATE TABLE "settings_flash_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"text" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"live_enabled" boolean DEFAULT true,
  	"live_provider" "enum_settings_live_provider" DEFAULT 'youtube',
  	"live_youtube_url" varchar,
  	"live_twitch_url" varchar,
  	"live_bunny_video_id" varchar,
  	"live_url" varchar,
  	"live_file_id" integer,
  	"live_poster_id" integer,
  	"flash_auto" boolean DEFAULT true,
  	"rating" numeric DEFAULT 4.5,
  	"views_count" numeric DEFAULT 0,
  	"tagline" varchar DEFAULT 'Swatter TV & Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Haute-Savoie et en Auvergne-Rhône-Alpes.',
  	"contact_email" varchar DEFAULT 'contact@swatter-tv.fr',
  	"contact_phone" varchar DEFAULT 'Uniquement par mail',
  	"contact_address" varchar DEFAULT '36 rue de la Chaumière, 74300 Thyez
  Haute-Savoie · Auvergne-Rhône-Alpes',
  	"socials_facebook" varchar,
  	"socials_instagram" varchar,
  	"socials_youtube" varchar,
  	"socials_tiktok" varchar,
  	"protect_notice" varchar DEFAULT 'Contenus protégés : captures et téléchargements détectés automatiquement',
  	"_status" "enum_settings_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "_settings_v_version_hero_slides_badges" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"style" "enum__settings_v_version_hero_slides_badges_style" DEFAULT 'glass',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_settings_v_version_hero_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum__settings_v_version_hero_slides_kind" DEFAULT 'custom',
  	"title_line1" varchar,
  	"title_line2" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"nav_label" varchar,
  	"primary_label" varchar,
  	"primary_href" varchar,
  	"secondary_label" varchar,
  	"secondary_href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_settings_v_version_flash_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"text" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_settings_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_live_enabled" boolean DEFAULT true,
  	"version_live_provider" "enum__settings_v_version_live_provider" DEFAULT 'youtube',
  	"version_live_youtube_url" varchar,
  	"version_live_twitch_url" varchar,
  	"version_live_bunny_video_id" varchar,
  	"version_live_url" varchar,
  	"version_live_file_id" integer,
  	"version_live_poster_id" integer,
  	"version_flash_auto" boolean DEFAULT true,
  	"version_rating" numeric DEFAULT 4.5,
  	"version_views_count" numeric DEFAULT 0,
  	"version_tagline" varchar DEFAULT 'Swatter TV & Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Haute-Savoie et en Auvergne-Rhône-Alpes.',
  	"version_contact_email" varchar DEFAULT 'contact@swatter-tv.fr',
  	"version_contact_phone" varchar DEFAULT 'Uniquement par mail',
  	"version_contact_address" varchar DEFAULT '36 rue de la Chaumière, 74300 Thyez
  Haute-Savoie · Auvergne-Rhône-Alpes',
  	"version_socials_facebook" varchar,
  	"version_socials_instagram" varchar,
  	"version_socials_youtube" varchar,
  	"version_socials_tiktok" varchar,
  	"version_protect_notice" varchar DEFAULT 'Contenus protégés : captures et téléchargements détectés automatiquement',
  	"version__status" "enum__settings_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "meteo" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"auto_update" boolean DEFAULT true,
  	"bulletin" varchar,
  	"bulletin_day" varchar,
  	"forecast" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "youtube" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"channel" varchar,
  	"auto_import" boolean DEFAULT true,
  	"in_videos" boolean DEFAULT true,
  	"in_replays" boolean DEFAULT true,
  	"publish_mode" "enum_youtube_publish_mode" DEFAULT 'published' NOT NULL,
  	"category" "enum_youtube_category" DEFAULT 'divertissement' NOT NULL,
  	"last_import_at" timestamp(3) with time zone,
  	"last_result" varchar,
  	"last_error" varchar,
  	"channel_id" varchar,
  	"channel_from" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "videos" ADD CONSTRAINT "videos_source_file_id_media_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_thumbnail_id_media_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_videos_v" ADD CONSTRAINT "_videos_v_parent_id_videos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_videos_v" ADD CONSTRAINT "_videos_v_version_source_file_id_media_id_fk" FOREIGN KEY ("version_source_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_videos_v" ADD CONSTRAINT "_videos_v_version_thumbnail_id_media_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_videos_v" ADD CONSTRAINT "_videos_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events_program" ADD CONSTRAINT "events_program_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v_version_program" ADD CONSTRAINT "_events_v_version_program_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_parent_id_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_poster_id_media_id_fk" FOREIGN KEY ("version_poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "replays" ADD CONSTRAINT "replays_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "replays" ADD CONSTRAINT "replays_source_file_id_media_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "replays" ADD CONSTRAINT "replays_thumbnail_id_media_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "replays" ADD CONSTRAINT "replays_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_replays_v" ADD CONSTRAINT "_replays_v_parent_id_replays_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."replays"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_replays_v" ADD CONSTRAINT "_replays_v_version_program_id_programs_id_fk" FOREIGN KEY ("version_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_replays_v" ADD CONSTRAINT "_replays_v_version_source_file_id_media_id_fk" FOREIGN KEY ("version_source_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_replays_v" ADD CONSTRAINT "_replays_v_version_thumbnail_id_media_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_replays_v" ADD CONSTRAINT "_replays_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "schedule" ADD CONSTRAINT "schedule_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "programs" ADD CONSTRAINT "programs_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "programs" ADD CONSTRAINT "programs_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "webcams" ADD CONSTRAINT "webcams_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads" ADD CONSTRAINT "ads_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads" ADD CONSTRAINT "ads_image_mobile_id_media_id_fk" FOREIGN KEY ("image_mobile_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_replays_fk" FOREIGN KEY ("replays_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_replays_fk" FOREIGN KEY ("replays_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedule"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_programs_fk" FOREIGN KEY ("programs_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_webcams_fk" FOREIGN KEY ("webcams_id") REFERENCES "public"."webcams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ads_fk" FOREIGN KEY ("ads_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rss_feeds_fk" FOREIGN KEY ("rss_feeds_id") REFERENCES "public"."rss_feeds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_hero_slides_badges" ADD CONSTRAINT "settings_hero_slides_badges_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings_hero_slides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_hero_slides" ADD CONSTRAINT "settings_hero_slides_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings_hero_slides" ADD CONSTRAINT "settings_hero_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_flash_items" ADD CONSTRAINT "settings_flash_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_live_file_id_media_id_fk" FOREIGN KEY ("live_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_live_poster_id_media_id_fk" FOREIGN KEY ("live_poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_settings_v_version_hero_slides_badges" ADD CONSTRAINT "_settings_v_version_hero_slides_badges_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_settings_v_version_hero_slides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_settings_v_version_hero_slides" ADD CONSTRAINT "_settings_v_version_hero_slides_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_settings_v_version_hero_slides" ADD CONSTRAINT "_settings_v_version_hero_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_settings_v_version_flash_items" ADD CONSTRAINT "_settings_v_version_flash_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_settings_v" ADD CONSTRAINT "_settings_v_version_live_file_id_media_id_fk" FOREIGN KEY ("version_live_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_settings_v" ADD CONSTRAINT "_settings_v_version_live_poster_id_media_id_fk" FOREIGN KEY ("version_live_poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "videos_source_source_file_idx" ON "videos" USING btree ("source_file_id");
  CREATE INDEX "videos_thumbnail_idx" ON "videos" USING btree ("thumbnail_id");
  CREATE INDEX "videos_published_at_idx" ON "videos" USING btree ("published_at");
  CREATE UNIQUE INDEX "videos_slug_idx" ON "videos" USING btree ("slug");
  CREATE INDEX "videos_meta_meta_image_idx" ON "videos" USING btree ("meta_image_id");
  CREATE INDEX "videos_updated_at_idx" ON "videos" USING btree ("updated_at");
  CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");
  CREATE INDEX "videos__status_idx" ON "videos" USING btree ("_status");
  CREATE INDEX "_videos_v_parent_idx" ON "_videos_v" USING btree ("parent_id");
  CREATE INDEX "_videos_v_version_source_version_source_file_idx" ON "_videos_v" USING btree ("version_source_file_id");
  CREATE INDEX "_videos_v_version_version_thumbnail_idx" ON "_videos_v" USING btree ("version_thumbnail_id");
  CREATE INDEX "_videos_v_version_version_published_at_idx" ON "_videos_v" USING btree ("version_published_at");
  CREATE INDEX "_videos_v_version_version_slug_idx" ON "_videos_v" USING btree ("version_slug");
  CREATE INDEX "_videos_v_version_meta_version_meta_image_idx" ON "_videos_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_videos_v_version_version_updated_at_idx" ON "_videos_v" USING btree ("version_updated_at");
  CREATE INDEX "_videos_v_version_version_created_at_idx" ON "_videos_v" USING btree ("version_created_at");
  CREATE INDEX "_videos_v_version_version__status_idx" ON "_videos_v" USING btree ("version__status");
  CREATE INDEX "_videos_v_created_at_idx" ON "_videos_v" USING btree ("created_at");
  CREATE INDEX "_videos_v_updated_at_idx" ON "_videos_v" USING btree ("updated_at");
  CREATE INDEX "_videos_v_latest_idx" ON "_videos_v" USING btree ("latest");
  CREATE INDEX "_videos_v_autosave_idx" ON "_videos_v" USING btree ("autosave");
  CREATE INDEX "articles_image_idx" ON "articles" USING btree ("image_id");
  CREATE INDEX "articles_department_idx" ON "articles" USING btree ("department");
  CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE UNIQUE INDEX "articles_guid_idx" ON "articles" USING btree ("guid");
  CREATE INDEX "articles_meta_meta_image_idx" ON "articles" USING btree ("meta_image_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_image_idx" ON "_articles_v" USING btree ("version_image_id");
  CREATE INDEX "_articles_v_version_version_department_idx" ON "_articles_v" USING btree ("version_department");
  CREATE INDEX "_articles_v_version_version_published_at_idx" ON "_articles_v" USING btree ("version_published_at");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_guid_idx" ON "_articles_v" USING btree ("version_guid");
  CREATE INDEX "_articles_v_version_meta_version_meta_image_idx" ON "_articles_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_autosave_idx" ON "_articles_v" USING btree ("autosave");
  CREATE INDEX "events_program_order_idx" ON "events_program" USING btree ("_order");
  CREATE INDEX "events_program_parent_id_idx" ON "events_program" USING btree ("_parent_id");
  CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");
  CREATE INDEX "events_poster_idx" ON "events" USING btree ("poster_id");
  CREATE UNIQUE INDEX "events_slug_idx" ON "events" USING btree ("slug");
  CREATE INDEX "events_meta_meta_image_idx" ON "events" USING btree ("meta_image_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "events__status_idx" ON "events" USING btree ("_status");
  CREATE INDEX "_events_v_version_program_order_idx" ON "_events_v_version_program" USING btree ("_order");
  CREATE INDEX "_events_v_version_program_parent_id_idx" ON "_events_v_version_program" USING btree ("_parent_id");
  CREATE INDEX "_events_v_parent_idx" ON "_events_v" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_version_start_date_idx" ON "_events_v" USING btree ("version_start_date");
  CREATE INDEX "_events_v_version_version_poster_idx" ON "_events_v" USING btree ("version_poster_id");
  CREATE INDEX "_events_v_version_version_slug_idx" ON "_events_v" USING btree ("version_slug");
  CREATE INDEX "_events_v_version_meta_version_meta_image_idx" ON "_events_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_events_v_version_version_updated_at_idx" ON "_events_v" USING btree ("version_updated_at");
  CREATE INDEX "_events_v_version_version_created_at_idx" ON "_events_v" USING btree ("version_created_at");
  CREATE INDEX "_events_v_version_version__status_idx" ON "_events_v" USING btree ("version__status");
  CREATE INDEX "_events_v_created_at_idx" ON "_events_v" USING btree ("created_at");
  CREATE INDEX "_events_v_updated_at_idx" ON "_events_v" USING btree ("updated_at");
  CREATE INDEX "_events_v_latest_idx" ON "_events_v" USING btree ("latest");
  CREATE INDEX "_events_v_autosave_idx" ON "_events_v" USING btree ("autosave");
  CREATE INDEX "replays_program_idx" ON "replays" USING btree ("program_id");
  CREATE INDEX "replays_source_source_file_idx" ON "replays" USING btree ("source_file_id");
  CREATE INDEX "replays_thumbnail_idx" ON "replays" USING btree ("thumbnail_id");
  CREATE INDEX "replays_broadcast_at_idx" ON "replays" USING btree ("broadcast_at");
  CREATE UNIQUE INDEX "replays_slug_idx" ON "replays" USING btree ("slug");
  CREATE INDEX "replays_meta_meta_image_idx" ON "replays" USING btree ("meta_image_id");
  CREATE INDEX "replays_updated_at_idx" ON "replays" USING btree ("updated_at");
  CREATE INDEX "replays_created_at_idx" ON "replays" USING btree ("created_at");
  CREATE INDEX "replays__status_idx" ON "replays" USING btree ("_status");
  CREATE INDEX "_replays_v_parent_idx" ON "_replays_v" USING btree ("parent_id");
  CREATE INDEX "_replays_v_version_version_program_idx" ON "_replays_v" USING btree ("version_program_id");
  CREATE INDEX "_replays_v_version_source_version_source_file_idx" ON "_replays_v" USING btree ("version_source_file_id");
  CREATE INDEX "_replays_v_version_version_thumbnail_idx" ON "_replays_v" USING btree ("version_thumbnail_id");
  CREATE INDEX "_replays_v_version_version_broadcast_at_idx" ON "_replays_v" USING btree ("version_broadcast_at");
  CREATE INDEX "_replays_v_version_version_slug_idx" ON "_replays_v" USING btree ("version_slug");
  CREATE INDEX "_replays_v_version_meta_version_meta_image_idx" ON "_replays_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_replays_v_version_version_updated_at_idx" ON "_replays_v" USING btree ("version_updated_at");
  CREATE INDEX "_replays_v_version_version_created_at_idx" ON "_replays_v" USING btree ("version_created_at");
  CREATE INDEX "_replays_v_version_version__status_idx" ON "_replays_v" USING btree ("version__status");
  CREATE INDEX "_replays_v_created_at_idx" ON "_replays_v" USING btree ("created_at");
  CREATE INDEX "_replays_v_updated_at_idx" ON "_replays_v" USING btree ("updated_at");
  CREATE INDEX "_replays_v_latest_idx" ON "_replays_v" USING btree ("latest");
  CREATE INDEX "_replays_v_autosave_idx" ON "_replays_v" USING btree ("autosave");
  CREATE INDEX "schedule_starts_at_idx" ON "schedule" USING btree ("starts_at");
  CREATE INDEX "schedule_program_idx" ON "schedule" USING btree ("program_id");
  CREATE INDEX "schedule_updated_at_idx" ON "schedule" USING btree ("updated_at");
  CREATE INDEX "schedule_created_at_idx" ON "schedule" USING btree ("created_at");
  CREATE INDEX "programs_image_idx" ON "programs" USING btree ("image_id");
  CREATE UNIQUE INDEX "programs_slug_idx" ON "programs" USING btree ("slug");
  CREATE INDEX "programs_meta_meta_image_idx" ON "programs" USING btree ("meta_image_id");
  CREATE INDEX "programs_updated_at_idx" ON "programs" USING btree ("updated_at");
  CREATE INDEX "programs_created_at_idx" ON "programs" USING btree ("created_at");
  CREATE INDEX "webcams_image_idx" ON "webcams" USING btree ("image_id");
  CREATE UNIQUE INDEX "webcams_slug_idx" ON "webcams" USING btree ("slug");
  CREATE INDEX "webcams_updated_at_idx" ON "webcams" USING btree ("updated_at");
  CREATE INDEX "webcams_created_at_idx" ON "webcams" USING btree ("created_at");
  CREATE INDEX "ads_image_idx" ON "ads" USING btree ("image_id");
  CREATE INDEX "ads_image_mobile_idx" ON "ads" USING btree ("image_mobile_id");
  CREATE INDEX "ads_updated_at_idx" ON "ads" USING btree ("updated_at");
  CREATE INDEX "ads_created_at_idx" ON "ads" USING btree ("created_at");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_meta_meta_image_idx" ON "pages" USING btree ("meta_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_meta_version_meta_image_idx" ON "_pages_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumb_sizes_thumb_filename_idx" ON "media" USING btree ("sizes_thumb_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_poster_sizes_poster_filename_idx" ON "media" USING btree ("sizes_poster_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");
  CREATE INDEX "rss_feeds_updated_at_idx" ON "rss_feeds" USING btree ("updated_at");
  CREATE INDEX "rss_feeds_created_at_idx" ON "rss_feeds" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "redirects_from_idx" ON "redirects" USING btree ("from");
  CREATE INDEX "redirects_updated_at_idx" ON "redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "redirects" USING btree ("created_at");
  CREATE INDEX "redirects_rels_order_idx" ON "redirects_rels" USING btree ("order");
  CREATE INDEX "redirects_rels_parent_idx" ON "redirects_rels" USING btree ("parent_id");
  CREATE INDEX "redirects_rels_path_idx" ON "redirects_rels" USING btree ("path");
  CREATE INDEX "redirects_rels_pages_id_idx" ON "redirects_rels" USING btree ("pages_id");
  CREATE INDEX "redirects_rels_articles_id_idx" ON "redirects_rels" USING btree ("articles_id");
  CREATE INDEX "redirects_rels_videos_id_idx" ON "redirects_rels" USING btree ("videos_id");
  CREATE INDEX "redirects_rels_replays_id_idx" ON "redirects_rels" USING btree ("replays_id");
  CREATE INDEX "redirects_rels_events_id_idx" ON "redirects_rels" USING btree ("events_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_videos_id_idx" ON "payload_locked_documents_rels" USING btree ("videos_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_replays_id_idx" ON "payload_locked_documents_rels" USING btree ("replays_id");
  CREATE INDEX "payload_locked_documents_rels_schedule_id_idx" ON "payload_locked_documents_rels" USING btree ("schedule_id");
  CREATE INDEX "payload_locked_documents_rels_programs_id_idx" ON "payload_locked_documents_rels" USING btree ("programs_id");
  CREATE INDEX "payload_locked_documents_rels_webcams_id_idx" ON "payload_locked_documents_rels" USING btree ("webcams_id");
  CREATE INDEX "payload_locked_documents_rels_ads_id_idx" ON "payload_locked_documents_rels" USING btree ("ads_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_rss_feeds_id_idx" ON "payload_locked_documents_rels" USING btree ("rss_feeds_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("redirects_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "settings_hero_slides_badges_order_idx" ON "settings_hero_slides_badges" USING btree ("_order");
  CREATE INDEX "settings_hero_slides_badges_parent_id_idx" ON "settings_hero_slides_badges" USING btree ("_parent_id");
  CREATE INDEX "settings_hero_slides_order_idx" ON "settings_hero_slides" USING btree ("_order");
  CREATE INDEX "settings_hero_slides_parent_id_idx" ON "settings_hero_slides" USING btree ("_parent_id");
  CREATE INDEX "settings_hero_slides_image_idx" ON "settings_hero_slides" USING btree ("image_id");
  CREATE INDEX "settings_flash_items_order_idx" ON "settings_flash_items" USING btree ("_order");
  CREATE INDEX "settings_flash_items_parent_id_idx" ON "settings_flash_items" USING btree ("_parent_id");
  CREATE INDEX "settings_live_live_file_idx" ON "settings" USING btree ("live_file_id");
  CREATE INDEX "settings_live_poster_idx" ON "settings" USING btree ("live_poster_id");
  CREATE INDEX "settings__status_idx" ON "settings" USING btree ("_status");
  CREATE INDEX "_settings_v_version_hero_slides_badges_order_idx" ON "_settings_v_version_hero_slides_badges" USING btree ("_order");
  CREATE INDEX "_settings_v_version_hero_slides_badges_parent_id_idx" ON "_settings_v_version_hero_slides_badges" USING btree ("_parent_id");
  CREATE INDEX "_settings_v_version_hero_slides_order_idx" ON "_settings_v_version_hero_slides" USING btree ("_order");
  CREATE INDEX "_settings_v_version_hero_slides_parent_id_idx" ON "_settings_v_version_hero_slides" USING btree ("_parent_id");
  CREATE INDEX "_settings_v_version_hero_slides_image_idx" ON "_settings_v_version_hero_slides" USING btree ("image_id");
  CREATE INDEX "_settings_v_version_flash_items_order_idx" ON "_settings_v_version_flash_items" USING btree ("_order");
  CREATE INDEX "_settings_v_version_flash_items_parent_id_idx" ON "_settings_v_version_flash_items" USING btree ("_parent_id");
  CREATE INDEX "_settings_v_version_live_version_live_file_idx" ON "_settings_v" USING btree ("version_live_file_id");
  CREATE INDEX "_settings_v_version_version_live_poster_idx" ON "_settings_v" USING btree ("version_live_poster_id");
  CREATE INDEX "_settings_v_version_version__status_idx" ON "_settings_v" USING btree ("version__status");
  CREATE INDEX "_settings_v_created_at_idx" ON "_settings_v" USING btree ("created_at");
  CREATE INDEX "_settings_v_updated_at_idx" ON "_settings_v" USING btree ("updated_at");
  CREATE INDEX "_settings_v_latest_idx" ON "_settings_v" USING btree ("latest");
  CREATE INDEX "_settings_v_autosave_idx" ON "_settings_v" USING btree ("autosave");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "videos" CASCADE;
  DROP TABLE "_videos_v" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "events_program" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "_events_v_version_program" CASCADE;
  DROP TABLE "_events_v" CASCADE;
  DROP TABLE "replays" CASCADE;
  DROP TABLE "_replays_v" CASCADE;
  DROP TABLE "schedule" CASCADE;
  DROP TABLE "programs" CASCADE;
  DROP TABLE "webcams" CASCADE;
  DROP TABLE "ads" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "rss_feeds" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "redirects" CASCADE;
  DROP TABLE "redirects_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "settings_hero_slides_badges" CASCADE;
  DROP TABLE "settings_hero_slides" CASCADE;
  DROP TABLE "settings_flash_items" CASCADE;
  DROP TABLE "settings" CASCADE;
  DROP TABLE "_settings_v_version_hero_slides_badges" CASCADE;
  DROP TABLE "_settings_v_version_hero_slides" CASCADE;
  DROP TABLE "_settings_v_version_flash_items" CASCADE;
  DROP TABLE "_settings_v" CASCADE;
  DROP TABLE "meteo" CASCADE;
  DROP TABLE "youtube" CASCADE;
  DROP TYPE "public"."enum_videos_source_provider";
  DROP TYPE "public"."enum_videos_category";
  DROP TYPE "public"."enum_videos_status";
  DROP TYPE "public"."enum__videos_v_version_source_provider";
  DROP TYPE "public"."enum__videos_v_version_category";
  DROP TYPE "public"."enum__videos_v_version_status";
  DROP TYPE "public"."enum_articles_department";
  DROP TYPE "public"."enum_articles_source";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_department";
  DROP TYPE "public"."enum__articles_v_version_source";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum_events_category";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum__events_v_version_category";
  DROP TYPE "public"."enum__events_v_version_status";
  DROP TYPE "public"."enum_replays_source_provider";
  DROP TYPE "public"."enum_replays_status";
  DROP TYPE "public"."enum__replays_v_version_source_provider";
  DROP TYPE "public"."enum__replays_v_version_status";
  DROP TYPE "public"."enum_programs_genre";
  DROP TYPE "public"."enum_webcams_provider";
  DROP TYPE "public"."enum_ads_placement";
  DROP TYPE "public"."enum_pages_footer_group";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_footer_group";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_rss_feeds_department";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_redirects_to_type";
  DROP TYPE "public"."enum_settings_hero_slides_badges_style";
  DROP TYPE "public"."enum_settings_hero_slides_kind";
  DROP TYPE "public"."enum_settings_live_provider";
  DROP TYPE "public"."enum_settings_status";
  DROP TYPE "public"."enum__settings_v_version_hero_slides_badges_style";
  DROP TYPE "public"."enum__settings_v_version_hero_slides_kind";
  DROP TYPE "public"."enum__settings_v_version_live_provider";
  DROP TYPE "public"."enum__settings_v_version_status";
  DROP TYPE "public"."enum_youtube_publish_mode";
  DROP TYPE "public"."enum_youtube_category";`)
}
