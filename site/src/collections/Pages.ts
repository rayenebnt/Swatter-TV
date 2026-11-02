import type { CollectionConfig } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { draftVersions } from '@/fields/drafts'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { pageUrl } from '@/lib/urls'

/** Pages fixes : vie privée, crédits, le groupe, canaux de réception, mentions légales… */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'footerGroup'],
    description: 'Les pages fixes : mentions légales, vie privée, le groupe, canaux de réception…',
    preview: (doc) => (doc.slug ? pageUrl(doc as { slug: string }) : null),
  },
  access: { read: publishedStatusOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    { name: 'intro', label: 'Introduction', type: 'textarea' },
    { name: 'content', label: 'Contenu', type: 'richText' },
    {
      // frise affichée sous le texte de la page (« Le groupe » : l'évolution du logo), seulement si elle a des étapes
      name: 'timeline',
      label: 'Frise chronologique',
      type: 'group',
      admin: {
        description:
          'Facultatif : une frise affichée sous le texte de la page (par exemple l’évolution du logo). Elle n’apparaît que si elle contient au moins une étape avec une image.',
      },
      fields: [
        { name: 'title', label: 'Titre de la frise', type: 'text', admin: { placeholder: 'Notre histoire' } },
        { name: 'intro', label: 'Texte d’introduction', type: 'textarea' },
        {
          name: 'steps',
          label: 'Étapes',
          labels: { singular: 'Étape', plural: 'Étapes' },
          type: 'array',
          admin: {
            description: 'De la plus ancienne à la plus récente. Pour changer l’ordre, faites glisser une étape par sa poignée.',
            initCollapsed: true,
            components: { RowLabel: '/components/admin/RowLabels#StepLabel' },
          },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'date', label: 'Date ou période', type: 'text', admin: { width: '40%', description: 'Par ex. « Novembre 2025 » (facultatif).' } },
                { name: 'title', label: 'Titre', type: 'text', required: true, admin: { width: '60%' } },
              ],
            },
            { name: 'image', label: 'Image', type: 'upload', relationTo: 'media', required: true },
            { name: 'text', label: 'Texte', type: 'textarea', admin: { description: 'Une ou deux phrases (facultatif).' } },
          ],
        },
      ],
    },
    {
      name: 'footerGroup',
      label: 'Lien dans le pied de page',
      type: 'select',
      options: [
        { label: 'Colonne « La chaîne »', value: 'chaine' },
        { label: 'Colonne « Swatter TV Info »', value: 'swatter' },
      ],
      admin: { position: 'sidebar', description: 'Pour ajouter un lien vers cette page en bas du site.' },
    },
    slugField(),
  ],
}
