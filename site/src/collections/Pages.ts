import type { CollectionConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { pageUrl } from '@/lib/urls'

/** Pages fixes : vie privée, crédits, le groupe, canaux de réception, mentions légales… */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: {
    useAsTitle: 'title',
    group: 'Le site',
    defaultColumns: ['title', 'slug', 'footerGroup'],
    description: 'Les pages fixes : mentions légales, vie privée, le groupe, canaux de réception…',
    preview: (doc) => (doc.slug ? pageUrl(doc as { slug: string }) : null),
  },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    { name: 'intro', label: 'Introduction', type: 'textarea' },
    { name: 'content', label: 'Contenu', type: 'richText' },
    {
      name: 'footerGroup',
      label: 'Lien dans le pied de page',
      type: 'select',
      options: [
        { label: 'Colonne « La chaîne »', value: 'chaine' },
        { label: 'Colonne « Swatter TV »', value: 'swatter' },
      ],
      admin: { position: 'sidebar', description: 'Pour ajouter un lien vers cette page en bas du site.' },
    },
    slugField(),
  ],
}
