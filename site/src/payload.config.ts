import { createHash, timingSafeEqual } from 'node:crypto'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { fr } from '@payloadcms/translations/languages/fr'
import path from 'path'
import { buildConfig, type Field, type Plugin } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Ads } from './collections/Ads'
import { Articles } from './collections/Articles'
import { Events } from './collections/Events'
import { Media } from './collections/Media'
import { MemberFavorites, MemberHistory } from './collections/MemberActivity'
import { Members } from './collections/Members'
import { memberEndpoints } from './lib/members/endpoints'
import { allow } from './lib/members/rate-limit'
import { Messages } from './collections/Messages'
import { Pages } from './collections/Pages'
import { Programs } from './collections/Programs'
import { Replays } from './collections/Replays'
import { Schedule } from './collections/Schedule'
import { Users } from './collections/Users'
import { Videos } from './collections/Videos'
import { Webcams } from './collections/Webcams'
import { hiddenForEditors } from './access'
import { Meteo } from './globals/Meteo'
import { Settings } from './globals/Settings'
import { Youtube } from './globals/Youtube'
import { checkContact } from './lib/contact'
import { sendContact } from './lib/contact-send'
import { deleteEmptyDrafts } from './lib/drafts-cleanup'
import { importMeteo } from './lib/import/meteo'
import { importYoutube } from './lib/import/youtube'
import { DRAFT_COLLECTIONS, publicationAware } from './lib/publication'
import { previewPath, previewUrl } from './lib/preview'
import { search } from './lib/search'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

const plugins: Plugin[] = [
  seoPlugin({
    collections: ['videos', 'replays', 'articles', 'events', 'pages', 'programs'],
    uploadsCollection: 'media',
    generateTitle: ({ doc }) => `${(doc as { title?: string }).title ?? ''} — Swatter TV`,
    generateDescription: ({ doc }) => {
      const d = doc as { excerpt?: string; description?: string; synopsis?: string }
      return (d.excerpt || d.description || d.synopsis || '').slice(0, 160)
    },
  }),
  redirectsPlugin({
    collections: ['pages', 'articles', 'videos', 'replays', 'events'],
    overrides: {
      admin: {
        hidden: hiddenForEditors,
        description: 'Renvoie une ancienne adresse du site vers une nouvelle (par ex. après avoir changé l’adresse d’un contenu partagé).',
      },
      labels: { singular: 'Redirection', plural: 'Redirections' },
    },
  }),
]

/**
 * Bloc « SEO » de plugin-seo replié en bas des fiches : il est facultatif (le titre et le résumé servent à défaut)
 * et n'encombre plus le formulaire. Simple habillage : les données restent dans `meta`.
 */
const seoSection: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) => ({
    ...collection,
    fields: collection.fields.map(
      (field): Field =>
        field.type === 'group' && 'name' in field && field.name === 'meta'
          ? {
              type: 'collapsible',
              label: 'Référencement Google (facultatif)',
              admin: { initCollapsed: true, description: 'Inutile de le remplir : le titre et le résumé du contenu sont repris automatiquement par Google et les réseaux sociaux.' },
              fields: [{ ...field, label: false }],
            }
          : field,
    ),
  })),
})
plugins.push(seoSection)

/**
 * Fiches simplifiées partout : onglet « API » masqué (réservé aux développeurs, il déroute plus qu'il n'aide) et,
 * pour les contenus qui ont une page publique (admin.preview), bouton « Voir sur le site » au lieu d'une icône seule ;
 * fiches à brouillons : « Nouvelle fiche : Vidéo » plutôt que le numéro de la fiche tant qu'elle n'a pas de titre, et
 * aperçu en direct centré sur l'endroit modifié (PreviewFocus).
 * Menu : groupes automatiques de Payload masqués (group: false), remplacés par le menu dans l'ordre du site
 * (src/components/admin/NavLinks.tsx).
 */
const simpleDocuments: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((c) => ({
    ...c,
    admin: {
      ...c.admin,
      group: false,
      hideAPIURL: true,
      components: {
        ...c.admin?.components,
        edit: {
          ...c.admin?.components?.edit,
          ...(c.admin?.preview ? { PreviewButton: '/components/admin/ViewOnSiteButton#ViewOnSiteButton' } : {}),
          ...(c.versions && typeof c.versions === 'object' && c.versions.drafts
            ? {
                beforeDocumentControls: [
                  ...(c.admin?.components?.edit?.beforeDocumentControls ?? []),
                  '/components/admin/UntitledTitle#UntitledTitle',
                  '/components/admin/PreviewFocus#PreviewFocus',
                ],
              }
            : {}),
        },
      },
    },
  })),
  globals: config.globals?.map((g) => ({
    ...g,
    admin: {
      ...g.admin,
      group: false,
      hideAPIURL: true,
      // aperçu en direct : montre l'endroit du site correspondant à l'onglet ou au champ modifié
      ...(g.versions && typeof g.versions === 'object' && g.versions.drafts
        ? {
            components: {
              ...g.admin?.components,
              elements: {
                ...g.admin?.components?.elements,
                beforeDocumentControls: [...(g.admin?.components?.elements?.beforeDocumentControls ?? []), '/components/admin/PreviewFocus#PreviewFocus'],
              },
            },
          }
        : {}),
    },
  })),
})
plugins.push(simpleDocuments)

if (process.env.S3_BUCKET) {
  plugins.push(
    s3Storage({
      collections: { media: true },
      bucket: process.env.S3_BUCKET,
      config: {
        region: process.env.S3_REGION || 'auto',
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: Boolean(process.env.S3_ENDPOINT),
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  )
}

/** Comparaison du secret de la tâche planifiée en temps constant (refus si aucun secret n'est configuré). */
function sameSecret(given: string, expected: string | undefined): boolean {
  if (!expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export default buildConfig({
  serverURL: SITE_URL,
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: ' — Swatter TV',
      description: 'Administration du site Swatter TV',
      icons: [
        { rel: 'icon', type: 'image/png', url: '/favicon.png' },
        { rel: 'apple-touch-icon', url: '/apple-touch-icon.png' },
      ],
      robots: { index: false, follow: false },
    },
    // Habillage aux couleurs de Swatter TV et écrans pensés pour une équipe non technique (styles : src/app/(payload)/custom.scss)
    components: {
      graphics: {
        Logo: '/components/admin/Logo#Logo',
        Icon: '/components/admin/Icon#Icon',
      },
      beforeNavLinks: ['/components/admin/NavLinks#NavStart'],
      afterNavLinks: ['/components/admin/NavLinks#NavEnd'],
      views: {
        // tableau de bord : actions courantes, état du site, derniers contenus modifiés
        dashboard: { Component: '/components/admin/Dashboard#Dashboard' },
        // guide d'utilisation (GUIDE_CLIENT.md) affiché dans l'administration
        aide: { Component: '/components/admin/HelpView#HelpView', path: '/aide', meta: { title: 'Aide' } },
      },
    },
    // Aperçu en direct : la page du site s'affiche à côté du formulaire et suit chaque enregistrement automatique
    livePreview: {
      // ouvert d'emblée à la première visite d'une fiche (ensuite, le choix de chacun est mémorisé)
      openByDefault: true,
      url: ({ data, collectionConfig, globalConfig, req }) => previewUrl(req, previewPath(collectionConfig?.slug, globalConfig?.slug, data)),
      collections: [...DRAFT_COLLECTIONS],
      globals: ['settings', 'meteo'],
      breakpoints: [
        { name: 'mobile', label: 'Téléphone', width: 390, height: 844 },
        { name: 'tablet', label: 'Tablette', width: 820, height: 1180 },
        { name: 'desktop', label: 'Ordinateur', width: 1440, height: 900 },
      ],
    },
    dateFormat: 'dd/MM/yyyy HH:mm',
    // avatar neutre : pas d'appel à Gravatar (aucune donnée envoyée à un tiers)
    avatar: 'default',
  },
  i18n: {
    supportedLanguages: { fr },
    fallbackLanguage: 'fr',
    // Formulations simples à la place des tournures génériques de Payload (« Créer un(e) nouveau ou nouvelle »…)
    translations: {
      fr: {
        general: {
          createNew: 'Ajouter',
          createNewLabel: 'Ajouter : {{label}}',
          creatingNewLabel: 'Nouvelle fiche : {{label}}',
          // cases à cocher dans les listes et les filtres : « oui » / « non » plutôt que « vrai » / « faux »
          false: 'Non',
          // case vide d'une liste : un simple tiret plutôt que « <Pas de Titre spécifique (facultatif)> »
          noLabel: '—',
          payloadSettings: 'Préférences d’affichage',
          save: 'Enregistrer',
          true: 'Oui',
        },
        fields: {
          addNew: 'Ajouter',
          addNewLabel: 'Ajouter : {{label}}',
          chooseFromExisting: 'Choisir dans la médiathèque',
          selectExistingLabel: 'Choisir : {{label}}',
          uploadNewLabel: 'Envoyer un nouveau fichier',
        },
        upload: {
          pasteURL: 'Coller un lien',
          selectFile: 'Choisir un fichier',
        },
        // brouillons : statut et actions en mots simples
        version: {
          versions: 'Historique',
          changed: 'Modifications non publiées',
          currentDraft: 'Brouillon en cours',
          unpublish: 'Retirer du site',
          aboutToUnpublish: 'Ce contenu va être retiré du site (il reste enregistré en brouillon). Continuer ?',
          confirmUnpublish: 'Confirmer le retrait',
          revertToPublished: 'Annuler les modifications',
        },
      },
    },
  },
  // Le menu de l'administration suit l'ordre du site : voir src/components/admin/menu.ts
  collections: [Videos, Articles, Events, Replays, Schedule, Programs, Webcams, Ads, Pages, Media, Messages, Members, MemberHistory, MemberFavorites, Users],
  globals: [Settings, Meteo, Youtube],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  // E-mails de l'administration (mot de passe oublié…) : envoyés par SMTP dès que SMTP_HOST est renseigné,
  // sinon simplement écrits dans le journal du serveur
  ...(process.env.SMTP_HOST
    ? {
        email: nodemailerAdapter({
          defaultFromAddress: process.env.SMTP_FROM || 'contact@swatter-tv.fr',
          defaultFromName: 'Swatter TV',
          transportOptions: {
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_PORT === '465',
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
          },
        }),
      }
    : {}),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // en développement le schéma suit le code ; en production : migrations (voir README)
    // Développement : le schéma suit le code. Production : migrations (npm run payload migrate)
    push: process.env.NODE_ENV !== 'production',
  }),
  sharp,
  plugins,
  endpoints: [
    // Espace membres (/api/compte/…) : voir src/lib/members/endpoints.ts
    ...memberEndpoints,
    {
      // Tâche planifiée : GET /api/cron/import avec l'en-tête « Authorization: Bearer CRON_SECRET »
      // (ou ?secret=CRON_SECRET), toutes les heures (jusqu'à toutes les 15 minutes)
      path: '/cron/import',
      method: 'get',
      handler: async (req) => {
        const secret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.searchParams.get('secret') || ''
        if (!sameSecret(secret, process.env.CRON_SECRET)) {
          return Response.json({ error: 'Non autorisé' }, { status: 401 })
        }
        const [meteo, youtube, drafts] = await Promise.all([
          importMeteo(req.payload).catch((e: unknown) => ({ ok: false, error: String(e) })),
          // nouvelles vidéos de la chaîne YouTube (global « youtube »)
          importYoutube(req.payload).catch((e: unknown) => ({ ok: false, created: 0, skipped: 0, total: 0, error: String(e) })),
          // fiches ouvertes avec « Ajouter » puis abandonnées sans titre (voir src/lib/drafts-cleanup.ts)
          deleteEmptyDrafts(req.payload).then(
            (deleted) => ({ deleted }),
            (e: unknown) => ({ deleted: 0, error: String(e) }),
          ),
        ])
        if (youtube.created > 0 || ('ok' in meteo && meteo.ok)) {
          try {
            const { revalidatePath } = await import('next/cache')
            revalidatePath('/', 'layout')
          } catch {
            // hors runtime Next.js
          }
        }
        return Response.json({ meteo, youtube, drafts })
      },
    },
    {
      // Bouton « Importer maintenant » de la fiche « Chaîne YouTube » (personnes connectées seulement)
      path: '/youtube/import',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Connectez-vous pour lancer l’import.' }, { status: 401 })
        const result = await importYoutube(req.payload, { force: true })
        if (result.created > 0) {
          try {
            const { revalidatePath } = await import('next/cache')
            revalidatePath('/', 'layout')
          } catch {
            // hors runtime Next.js
          }
        }
        return Response.json(result, { status: result.ok ? 200 : 502 })
      },
    },
    {
      // Formulaire « Proposer une info » (page /contact) : POST /api/contact, JSON
      path: '/contact',
      method: 'post',
      handler: async (req) => {
        const body = (await req.json?.().catch(() => null)) as Record<string, unknown> | null
        if (!body) return Response.json({ error: 'Requête illisible.' }, { status: 400 })
        // champ invisible rempli, ou envoi sans passer par le formulaire / moins de 3 s après son affichage (durée mesurée
        // par le navigateur, `elapsed` en ms : indépendante de son horloge) : un robot (réponse polie, rien n'est fait)
        const elapsed = Number(body.elapsed)
        if (body.website || !Number.isFinite(elapsed) || elapsed < 3000) return Response.json({ ok: true })
        const { data, errors } = checkContact(body)
        if (Object.keys(errors).length) return Response.json({ errors }, { status: 400 })
        // seuls les messages valides comptent dans la limite (5 par quart d'heure et par adresse IP)
        if (!allow('contact', req.headers, 5, 15 * 60 * 1000)) return Response.json({ error: 'Trop de messages envoyés d’un coup : réessayez dans quelques minutes.' }, { status: 429 })
        await sendContact(req.payload, data)
        return Response.json({ ok: true })
      },
    },
    {
      // Recherche instantanée : GET /api/search?q=…
      path: '/search',
      method: 'get',
      handler: async (req) => {
        const q = (req.searchParams.get('q') || '').trim().slice(0, 80)
        if (q.length < 2) return Response.json({ hits: [] })
        // recherche publique : contenus publiés seulement (jamais les brouillons)
        const hits = await search(publicationAware(req.payload, false), q, 8)
        return Response.json({ hits }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })
      },
    },
  ],
})
