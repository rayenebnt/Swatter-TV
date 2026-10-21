import type { CollectionConfig, FieldHook } from 'payload'
import { hiddenForEditors, isAdmin } from '@/access'
import { DEPARTMENTS } from '@/lib/departments'

/**
 * Nombre d'entrées d'un membre (historique ou « Ma liste »), affiché dans sa fiche. Pas calculé pour les lectures internes
 * de l'espace membres (contexte `memberCounts: false`, voir src/lib/members/session.ts) : deux requêtes de moins par appel.
 */
const countOf =
  (collection: 'member-history' | 'member-favorites'): FieldHook =>
  async ({ data, req, context }) => {
    if (context?.memberCounts === false) return undefined
    if (!data?.id) return 0
    return (await req.payload.count({ collection, where: { member: { equals: data.id } }, overrideAccess: true, req })).totalDocs
  }

/** Champs techniques (mot de passe, jetons, sessions) : jamais renvoyés par l'API ni montrés dans l'administration. */
/**
 * Champs techniques : jamais renvoyés par l'API, ni écrits par elle (même par un administrateur : une empreinte ou un jeton
 * choisis permettraient de se connecter à la place du membre). L'espace membres les écrit avec overrideAccess ou
 * db.updateOne ; le hook beforeChange ci-dessus (suspension, changement d'adresse) passe après ce contrôle.
 */
const hidden = { hidden: true, access: { create: () => false, update: () => false } } as const

/**
 * Membres du site : visiteurs inscrits depuis /inscription (historique des vidéos, « Ma liste », préférences).
 * Comptes totalement séparés de ceux de l'administration : un membre ne peut ni se connecter à /admin ni passer pour un
 * membre de l'équipe (sessions propres, voir src/lib/members). Visible des seuls administrateurs (données personnelles).
 */
export const Members: CollectionConfig = {
  slug: 'members',
  labels: { singular: 'Membre', plural: 'Membres du site' },
  admin: {
    useAsTitle: 'email',
    hidden: hiddenForEditors,
    defaultColumns: ['firstName', 'email', 'department', 'newsletter', 'lastLoginAt', 'createdAt'],
    listSearchableFields: ['email', 'firstName', 'lastName'],
    description:
      'Les visiteurs inscrits sur le site (« Mon espace »). Cochez « Compte suspendu » pour bloquer quelqu’un sans supprimer son compte ; la suppression efface aussi son historique et sa liste.',
    components: { beforeListTable: ['/components/admin/MembersExport#MembersExport'] },
  },
  // création par le formulaire d'inscription seulement (API locale) ; l'équipe consulte, suspend ou supprime
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: isAdmin },
  defaultSort: '-createdAt',
  hooks: {
    beforeValidate: [({ data }) => (data?.email && typeof data.email === 'string' ? { ...data, email: data.email.trim().toLowerCase() } : data)],
    beforeChange: [
      ({ data, originalDoc, operation, req }) => {
        if (operation !== 'update' || !originalDoc) return data
        const next = { ...data }
        // Choix qui n'appartiennent qu'au membre : une fiche enregistrée depuis l'administration (qui renvoie tous les champs,
        // tels qu'ils étaient à son ouverture) ne les écrase pas. L'équipe peut seulement retirer l'accord pour les e-mails, à
        // la demande du membre : jamais le donner à sa place. (L'espace membres écrit, lui, sans passer par ces hooks.)
        if (req.user) {
          for (const key of ['historyPaused', 'lastLoginAt', 'consentAt'] as const) next[key] = originalDoc[key]
          if (next.newsletter === true && originalDoc.newsletter !== true) next.newsletter = originalDoc.newsletter
        }
        // compte suspendu ou adresse changée : toutes ses sessions sont fermées (nouvelle version de session) et un lien
        // « nouveau mot de passe » encore valable ne sert plus
        const blocked = next.blocked === true && originalDoc.blocked !== true
        const email = typeof next.email === 'string' && next.email !== originalDoc.email
        if (!blocked && !email) return next
        return {
          ...next,
          sessionVersion: (Number(originalDoc.sessionVersion) || 0) + 1,
          resetTokenHash: null,
          resetTokenExpires: null,
        }
      },
    ],
    // compte supprimé : son historique et sa liste avec lui (avant la suppression : ces lignes exigent un membre)
    beforeDelete: [
      async ({ id, req }) => {
        for (const collection of ['member-history', 'member-favorites'] as const) {
          await req.payload.delete({ collection, where: { member: { equals: id } }, overrideAccess: true, req })
        }
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'firstName', label: 'Prénom', type: 'text', required: true },
        { name: 'lastName', label: 'Nom', type: 'text' },
      ],
    },
    { name: 'email', label: 'E-mail', type: 'email', required: true, unique: true, index: true },
    {
      type: 'row',
      fields: [
        {
          name: 'department',
          label: 'Département préféré',
          type: 'select',
          options: DEPARTMENTS.map(({ value, label }) => ({ value, label })),
          admin: { description: 'Choisi par le membre : sa météo, son info et ses sorties.' },
        },
        {
          name: 'newsletter',
          label: 'Accepte les e-mails de Swatter TV',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Choix du membre. Vous pouvez décocher la case à sa demande, jamais la cocher à sa place.' },
        },
      ],
    },
    {
      name: 'blocked',
      label: 'Compte suspendu',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Le membre ne peut plus se connecter ; ses sessions en cours sont fermées.' },
    },
    { name: 'note', label: 'Note interne (invisible du membre)', type: 'textarea', admin: { position: 'sidebar' } },
    { name: 'historyPaused', label: 'Historique en pause', type: 'checkbox', defaultValue: false, admin: { readOnly: true, position: 'sidebar' } },
    {
      type: 'row',
      fields: [
        { name: 'lastLoginAt', label: 'Dernière connexion', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } } },
        { name: 'consentAt', label: 'Conditions acceptées le', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'historyCount', label: 'Vidéos dans son historique', type: 'number', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [countOf('member-history')] } },
        { name: 'favoritesCount', label: 'Contenus dans « Ma liste »', type: 'number', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [countOf('member-favorites')] } },
      ],
    },
    { name: 'passwordHash', type: 'text', ...hidden },
    { name: 'sessionVersion', type: 'number', defaultValue: 0, ...hidden },
    { name: 'loginAttempts', type: 'number', defaultValue: 0, ...hidden },
    { name: 'lockUntil', type: 'date', ...hidden },
    { name: 'resetTokenHash', type: 'text', index: true, ...hidden },
    { name: 'resetTokenExpires', type: 'date', ...hidden },
  ],
}
