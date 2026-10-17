// Pages éditoriales, webcams et autres contenus de démonstration.
import type { Page, Webcam } from '@/payload-types'

export type SeedPage = {
  title: string
  slug: string
  intro: string
  footerGroup: NonNullable<Page['footerGroup']>
  metaDescription: string
  body: string[]
}

export const PAGES: SeedPage[] = [
  {
    title: 'Canaux de réception',
    slug: 'canaux-de-reception',
    footerGroup: 'chaine',
    intro: 'Swatter TV se regarde gratuitement, en direct et en replay, sur tous vos écrans.',
    metaDescription: 'Où et comment regarder Swatter TV : en direct sur le site, sur mobile, sur tablette et sur votre téléviseur.',
    body: [
      '## Sur le site',
      'Le direct de Swatter TV est accessible gratuitement et sans inscription depuis la page [Le Direct](/direct), sur ordinateur, tablette et smartphone. Les émissions déjà diffusées sont disponibles dans [le Replay](/replay).',
      '## Sur votre téléviseur',
      '- Sur un téléviseur connecté : ouvrez le navigateur internet de votre téléviseur et rendez-vous sur le site.',
      '- Depuis votre smartphone ou votre ordinateur : utilisez la recopie d’écran (Chromecast, AirPlay ou câble HDMI).',
      '- Box des opérateurs : [à compléter : opérateurs et numéros de canal].',
      '## Une question ?',
      'Écrivez-nous à [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr) : nous vous aiderons à trouver la meilleure solution.',
    ],
  },
  {
    title: 'Le groupe',
    slug: 'le-groupe',
    footerGroup: 'swatter',
    intro: 'Swatter TV & Info est une web TV régionale installée à Thyez, au cœur de la Haute-Savoie.',
    metaDescription: 'Présentation de Swatter TV & Info, web TV régionale de la Haute-Savoie et de l’Auvergne-Rhône-Alpes, installée à Thyez.',
    body: [
      '## Notre mission',
      'Raconter la vie de notre territoire : l’actualité, la météo, les sorties, le sport et les talents de la Haute-Savoie et de l’Auvergne-Rhône-Alpes, au plus près des habitants.',
      '## Ce que nous proposons',
      '- Un direct 24 h sur 24 avec journaux, magazines et documentaires.',
      '- L’info régionale en continu, département par département.',
      '- La météo, l’agenda des sorties et les webcams des plus beaux sites de la région.',
      '- Le replay de nos émissions et des vidéos à la demande.',
      '## Nous contacter',
      'Swatter TV & Info, 36 rue de la Chaumière, 74300 Thyez. Par e-mail : [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr).',
    ],
  },
  {
    title: 'Crédits',
    slug: 'credits',
    footerGroup: 'swatter',
    intro: 'Celles et ceux qui ont contribué à ce site.',
    metaDescription: 'Crédits du site Swatter TV : conception, visuels, données et logiciels utilisés.',
    body: [
      '## Conception et réalisation',
      'Conception et développement du site : [à compléter].',
      '## Images et vidéos',
      'Sauf mention contraire, les photographies et les vidéos sont la propriété de Swatter TV & Info.',
      '## Données',
      'Prévisions météo : Open-Meteo (licence CC BY 4.0).',
      '## Logiciels et polices',
      'Site réalisé avec Next.js et Payload CMS. Polices de caractères Inter et Outfit (licence SIL Open Font License).',
    ],
  },
  {
    title: 'Vie privée',
    slug: 'vie-privee',
    footerGroup: 'swatter',
    intro: 'Comment nous utilisons vos données personnelles et quels sont vos droits.',
    metaDescription: 'Politique de confidentialité de Swatter TV : données collectées, cookies, durée de conservation et exercice de vos droits.',
    body: [
      '## Responsable du traitement',
      'Swatter TV & Info, 36 rue de la Chaumière, 74300 Thyez — [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr).',
      '## Données collectées',
      'La consultation du site ne nécessite aucune inscription. Nous ne collectons des données personnelles que lorsque vous nous écrivez (nom, adresse e-mail et contenu de votre message), et uniquement pour vous répondre.',
      '## Cookies',
      'Le site utilise des cookies strictement nécessaires à son fonctionnement (mémorisation de vos choix). Les cookies de mesure d’audience et les contenus de plateformes tierces (lecteurs vidéo, publicités) ne sont déposés qu’avec votre accord, que vous pouvez modifier à tout moment depuis le lien « Gestion des cookies » en bas de page.',
      '## Durée de conservation',
      'Vos messages sont conservés le temps nécessaire au traitement de votre demande, puis supprimés au plus tard trois ans après notre dernier échange. Vos choix en matière de cookies sont conservés six mois au maximum.',
      '## Vos droits',
      'Conformément au Règlement général sur la protection des données (RGPD), vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et d’opposition au traitement de vos données. Pour les exercer, écrivez-nous à [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr).',
      'Vous pouvez également introduire une réclamation auprès de la CNIL ([www.cnil.fr](https://www.cnil.fr)).',
    ],
  },
  {
    title: 'Mentions légales',
    slug: 'mentions-legales',
    footerGroup: 'swatter',
    intro: 'Informations légales relatives au site Swatter TV.',
    metaDescription: 'Mentions légales du site Swatter TV : éditeur, directeur de la publication, hébergeur et propriété intellectuelle.',
    body: [
      '## Éditeur du site',
      '**Swatter TV & Info**',
      '36 rue de la Chaumière, 74300 Thyez — Haute-Savoie',
      'E-mail : [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr)',
      'Forme juridique, capital et numéro d’immatriculation (SIRET) : [à compléter].',
      '## Directeur de la publication',
      '[à compléter : nom et qualité du directeur de la publication].',
      '## Hébergeur',
      '[à compléter : nom, adresse et téléphone de l’hébergeur].',
      '## Propriété intellectuelle',
      'L’ensemble des contenus de ce site (textes, images, vidéos, logos) est protégé par le droit d’auteur. Toute reproduction ou diffusion, même partielle, sans l’autorisation préalable de Swatter TV & Info est interdite.',
      '## Données personnelles',
      'Pour en savoir plus sur la gestion de vos données, consultez notre page [Vie privée](/vie-privee).',
    ],
  },
]

export type SeedWebcam = {
  name: string
  place: string
  image: string
  temperature: string
}

/** Webcams de démonstration (type « image rafraîchie » pointant vers un visuel du site). */
export const WEBCAMS: (SeedWebcam & { provider: Webcam['provider'] })[] = [
  { name: 'Lac d’Annecy', place: 'Talloires', image: 't-ete-a', temperature: '14°', provider: 'image' },
  { name: 'Chamonix', place: 'Aiguille du Midi', image: 't-hiver-b', temperature: '-2°', provider: 'image' },
  { name: 'La Clusaz', place: 'Front de neige', image: 't-hiver-a', temperature: '6°', provider: 'image' },
  { name: 'Avoriaz', place: 'Village des Dromonts', image: 't-nuages-a', temperature: '3°', provider: 'image' },
  { name: 'Le Grand-Bornand', place: 'Le Chinaillon', image: 't-alpenglow-b', temperature: '7°', provider: 'image' },
  { name: 'Thonon-les-Bains', place: 'Port de Rives', image: 't-crepuscule-a', temperature: '13°', provider: 'image' },
]
