import type { GlobalConfig } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { globalDraftVersions } from '@/fields/drafts'
import { videoSourceField } from '@/fields/videoSource'
import { revalidateGlobal } from '@/hooks/revalidate'

export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Accueil, direct et flash info',
  admin: {
    description: 'Un onglet par sujet : le carrousel de l’accueil, le direct, le flash info, puis les coordonnées et réseaux sociaux de la chaîne.',
    components: { elements: { UnpublishButton: '/components/admin/NoUnpublish#NoUnpublish' } },
  },
  // API publique : jamais le brouillon (sans cette règle, ?draft=true le renverrait à un visiteur)
  access: { read: publishedStatusOrAuthenticated, update: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: globalDraftVersions,
  // sans cela, l'administration affiche « Brouillon » (et pas « Modifications non publiées ») dès qu'un brouillon existe
  forceSelect: { _status: true },
  hooks: { afterChange: [revalidateGlobal] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Accueil (carrousel)',
          fields: [
            {
              name: 'heroSlides',
              label: 'Diapositives du carrousel',
              type: 'array',
              maxRows: 5,
              labels: { singular: 'Diapositive', plural: 'Diapositives' },
              admin: {
                description: 'Grand bandeau en haut de l’accueil (3 diapositives conseillées). Cliquez sur une diapositive pour la déplier ; glissez-la par sa poignée pour changer l’ordre.',
                initCollapsed: true,
                components: { RowLabel: '/components/admin/RowLabels#SlideLabel' },
              },
              fields: [
                {
                  name: 'kind',
                  label: 'Type',
                  type: 'select',
                  required: true,
                  defaultValue: 'custom',
                  options: [
                    { label: 'Le direct (affiche « En direct » et la progression du programme en cours)', value: 'live' },
                    { label: 'Mise en avant libre', value: 'custom' },
                  ],
                },
                {
                  name: 'badges',
                  label: 'Étiquettes',
                  type: 'array',
                  maxRows: 3,
                  labels: { singular: 'Étiquette', plural: 'Étiquettes' },
                  admin: { description: 'Petits badges au-dessus du titre (« En direct », « Haute-Savoie »…).', components: { RowLabel: '/components/admin/RowLabels#BadgeLabel' } },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'label', label: 'Texte', type: 'text', required: true },
                        { name: 'style', label: 'Style', type: 'select', defaultValue: 'glass', options: [{ label: 'Rouge (direct)', value: 'live' }, { label: 'Or', value: 'gold' }, { label: 'Transparent', value: 'glass' }] },
                      ],
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'titleLine1', label: 'Titre — ligne 1 (blanc)', type: 'text', required: true },
                    { name: 'titleLine2', label: 'Titre — ligne 2 (dorée)', type: 'text' },
                  ],
                },
                { name: 'description', label: 'Texte', type: 'textarea' },
                { name: 'image', label: 'Image de fond (2400 px de large conseillés)', type: 'upload', relationTo: 'media', required: true },
                { name: 'navLabel', label: 'Libellé court (vignette de navigation)', type: 'text', admin: { placeholder: 'Ce soir, Ce week-end…' } },
                {
                  type: 'row',
                  fields: [
                    { name: 'primaryLabel', label: 'Bouton principal — texte', type: 'text' },
                    { name: 'primaryHref', label: 'Bouton principal — lien', type: 'text' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'secondaryLabel', label: 'Bouton secondaire — texte', type: 'text' },
                    { name: 'secondaryHref', label: 'Bouton secondaire — lien', type: 'text' },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Le direct',
          fields: [
            { name: 'liveEnabled', label: 'Direct actif', type: 'checkbox', defaultValue: true, admin: { description: 'Décochez pour couper le direct : la page « Direct » affiche alors « Le direct reprend bientôt ».' } },
            videoSourceField('live', 'Flux du direct', false, { twitch: true }),
            { name: 'livePoster', label: 'Image affichée avant la lecture', type: 'upload', relationTo: 'media' },
          ],
        },
        {
          label: 'Flash info',
          fields: [
            { name: 'flashAuto', label: 'Compléter automatiquement avec les derniers articles', type: 'checkbox', defaultValue: true },
            {
              name: 'flashItems',
              label: 'Messages',
              type: 'array',
              maxRows: 10,
              labels: { singular: 'Message', plural: 'Messages' },
              admin: { initCollapsed: true, components: { RowLabel: '/components/admin/RowLabels#FlashLabel' } },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'label', label: 'Lieu / thème (en doré)', type: 'text', required: true },
                    { name: 'text', label: 'Message', type: 'text', required: true },
                  ],
                },
                { name: 'href', label: 'Lien (facultatif)', type: 'text' },
              ],
            },
          ],
        },
        {
          label: 'Chaîne et contact',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'rating', label: 'Note affichée', type: 'number', min: 0, max: 5, defaultValue: 4.5 },
                { name: 'viewsCount', label: 'Compteur de vues', type: 'number', defaultValue: 0 },
              ],
            },
            { name: 'tagline', label: 'Présentation (pied de page)', type: 'textarea', defaultValue: 'Swatter TV & Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Haute-Savoie.' },
            {
              name: 'contact',
              label: 'Contact',
              type: 'group',
              fields: [
                { name: 'email', label: 'E-mail', type: 'email', defaultValue: 'contact@swatter-tv.fr', admin: { description: 'Affiché sur le site ; reçoit aussi les messages du formulaire « Proposer une info ».' } },
                { name: 'phone', label: 'Téléphone', type: 'text', defaultValue: 'Uniquement par mail' },
                { name: 'address', label: 'Adresse', type: 'textarea', defaultValue: '36 rue de la Chaumière, 74300 Thyez\nHaute-Savoie' },
              ],
            },
            {
              name: 'socials',
              label: 'Réseaux sociaux',
              type: 'group',
              fields: [
                { name: 'facebook', label: 'Facebook', type: 'text' },
                { name: 'instagram', label: 'Instagram', type: 'text' },
                { name: 'youtube', label: 'YouTube', type: 'text' },
                { name: 'tiktok', label: 'TikTok', type: 'text' },
              ],
            },
            { name: 'protectNotice', label: 'Mention de protection', type: 'text', defaultValue: 'Contenus protégés : captures et téléchargements détectés automatiquement' },
          ],
        },
      ],
    },
  ],
}
