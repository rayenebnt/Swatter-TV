import type { CollectionConfig } from 'payload'
import { authenticated, isAdmin } from '@/access'
import { CONTACT_SUBJECTS } from '@/lib/contact'

/**
 * Messages envoyés par le formulaire de contact du site (page /contact) : chacun part aussi par e-mail à l'adresse de
 * contact de la chaîne ; ils sont gardés ici au cas où un e-mail se perdrait. Créés seulement par POST /api/contact.
 */
export const Messages: CollectionConfig = {
  slug: 'messages',
  labels: { singular: 'Message reçu', plural: 'Messages reçus' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'subject', 'createdAt', 'handled'],
    description: 'Les messages envoyés depuis la page « Proposer une info » du site. Chacun arrive aussi par e-mail. Cochez « Traité » une fois la réponse faite.',
  },
  access: { read: authenticated, create: () => false, update: authenticated, delete: isAdmin },
  defaultSort: '-createdAt',
  fields: [
    { name: 'subject', label: 'Sujet', type: 'select', required: true, options: CONTACT_SUBJECTS.map(({ value, label }) => ({ value, label })), admin: { readOnly: true } },
    {
      type: 'row',
      fields: [
        { name: 'name', label: 'Nom', type: 'text', required: true, admin: { readOnly: true } },
        { name: 'email', label: 'E-mail', type: 'email', required: true, admin: { readOnly: true } },
        { name: 'phone', label: 'Téléphone', type: 'text', admin: { readOnly: true } },
      ],
    },
    { name: 'city', label: 'Commune', type: 'text', admin: { readOnly: true } },
    { name: 'link', label: 'Lien (photos, vidéo…)', type: 'text', admin: { readOnly: true } },
    { name: 'message', label: 'Message', type: 'textarea', required: true, admin: { readOnly: true, rows: 10 } },
    { name: 'handled', label: 'Traité', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Cochez une fois la réponse faite.' } },
    { name: 'emailed', label: 'E-mail envoyé', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', readOnly: true, description: 'Décoché : l’envoi de l’e-mail a échoué, le message n’est qu’ici.' } },
  ],
}
