// Pages éditoriales (à compléter : voir les « [à compléter] ») et webcams d'exemple.
import type { DepartmentSlug } from '@/lib/departments'
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
    intro: 'Swatter TV & Info est une web TV régionale installée à Thyez, en Haute-Savoie, qui couvre toute la région Auvergne-Rhône-Alpes.',
    metaDescription: 'Présentation de Swatter TV & Info, web TV régionale d’Auvergne-Rhône-Alpes, installée à Thyez (Haute-Savoie).',
    body: [
      '## Notre mission',
      'Raconter la vie de notre territoire : l’actualité, la météo, les sorties, le sport et les talents d’Auvergne-Rhône-Alpes, au plus près des habitants.',
      '## Ce que nous proposons',
      '- Un direct 24 h sur 24 avec journaux, magazines et documentaires.',
      '- L’info de toute la région en continu, département par département.',
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
    metaDescription: 'Politique de confidentialité de Swatter TV : données collectées, espace membres, cookies, durée de conservation et exercice de vos droits.',
    body: [
      '## Responsable du traitement',
      'SWATTER TV & INFO, SARL, 36 rue de la Chaumière, 74300 Thyez — [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr), 09 61 32 94 03.',
      '## Données collectées',
      'La consultation du site ne nécessite aucune inscription. Nous ne collectons des données personnelles que dans deux cas : lorsque vous nous écrivez, par e-mail ou avec le formulaire [Proposer une info](/contact) (nom, adresse e-mail, téléphone et commune si vous les indiquez, contenu de votre message), uniquement pour traiter votre demande et vous répondre ; et lorsque vous créez un espace membre (voir ci-dessous). Ces données ne sont ni vendues ni cédées.',
      '## Votre espace membre (« Mon espace »)',
      'La création d’un compte est facultative : elle vous permet de retrouver les vidéos que vous avez regardées, de garder des contenus pour plus tard dans « Ma liste » et de suivre l’actualité de votre département. Nous enregistrons alors :',
      '- votre prénom et votre adresse e-mail, ainsi que votre nom et votre département si vous choisissez de les indiquer ;',
      '- votre mot de passe, sous une forme chiffrée qui ne permet pas de le relire ;',
      '- vos préférences : accord pour recevoir nos e-mails d’actualité, mise en pause de l’historique ;',
      '- l’historique des vidéos et des replays que vous regardez lorsque vous êtes connecté, et les contenus que vous ajoutez à « Ma liste » ;',
      '- la date de votre inscription, de votre acceptation des conditions et de votre dernière connexion.',
      'Ces données servent uniquement au fonctionnement de votre espace (connexion, historique, « Ma liste », contenus de votre département) et à l’e-mail qui vous permet de choisir un nouveau mot de passe si vous l’avez oublié. Nous ne vous envoyons nos e-mails d’actualité que si vous avez coché la case prévue à cet effet, et vous pouvez la décocher à tout moment dans **Mon espace › Mon profil**. Elles ne sont jamais utilisées pour de la publicité ciblée.',
      'Seuls les administrateurs du site ont accès aux comptes. Notre équipe consulte par ailleurs des statistiques globales, sans nom ni adresse (par exemple, les vidéos les plus regardées par les membres).',
      '## Cookies',
      'Le site utilise des cookies strictement nécessaires à son fonctionnement (mémorisation de vos choix). Les cookies de mesure d’audience et les contenus de plateformes tierces (lecteurs vidéo, publicités) ne sont déposés qu’avec votre accord, que vous pouvez modifier à tout moment depuis le lien « Gestion des cookies » en bas de page.',
      'Lorsque vous vous connectez à votre espace membre, deux cookies de session, strictement nécessaires au service que vous demandez, sont déposés pour 30 jours au plus : **sw_membre**, qui vous garde connecté (inaccessible aux scripts de la page), et **sw_connecte**, qui indique seulement qu’une session est ouverte, pour afficher « Mon espace » en haut du site. Ils ne servent à aucun suivi et sont effacés lorsque vous vous déconnectez.',
      '## Sécurité',
      'Votre mot de passe est chiffré de façon irréversible : il n’est jamais lisible, pas même par notre équipe, qui ne vous le demandera jamais. Après plusieurs mots de passe erronés, la connexion au compte est bloquée pendant un quart d’heure ; le lien envoyé pour choisir un nouveau mot de passe expire au bout d’une heure et ne sert qu’une fois. Pour limiter les abus, les formulaires de l’espace membres comptent les tentatives par adresse IP : cette adresse n’est gardée que temporairement dans la mémoire du serveur et n’est jamais enregistrée.',
      '## Durée de conservation',
      'Vos messages sont conservés le temps nécessaire au traitement de votre demande, puis supprimés au plus tard trois ans après notre dernier échange. Vos choix en matière de cookies sont conservés six mois au maximum.',
      'Les données de votre espace membre sont conservées tant que votre compte existe. L’historique est limité aux 200 dernières vidéos regardées : les plus anciennes s’effacent automatiquement, et vous pouvez retirer une vidéo, vider tout l’historique ou le mettre en pause à tout moment depuis **Mon espace › Historique**. Lorsque vous supprimez votre compte depuis **Mon espace › Mon profil**, votre profil, votre historique et « Ma liste » sont effacés immédiatement et définitivement.',
      '## Vos droits',
      'Conformément au Règlement général sur la protection des données (RGPD), vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de vos données. Si vous avez un espace membre, vous pouvez exercer la plupart de ces droits vous-même depuis **Mon espace › Mon profil** : modifier vos informations, télécharger toutes les données de votre compte et supprimer celui-ci. Pour toute autre demande, écrivez-nous à [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr).',
      'Vous pouvez également introduire une réclamation auprès de la CNIL ([www.cnil.fr](https://www.cnil.fr)).',
    ],
  },
  {
    title: 'Mentions légales',
    slug: 'mentions-legales',
    footerGroup: 'swatter',
    intro: 'Informations légales relatives au site www.swatter-tv.fr.',
    metaDescription: 'Mentions légales du site Swatter TV : éditeur, directeur de la publication, hébergeur et propriété intellectuelle.',
    body: [
      '## Éditeur du site',
      'Le site www.swatter-tv.fr est édité par la société **SWATTER TV & INFO**, société à responsabilité limitée (SARL) au capital de 10 000 €.',
      'Siège social : 36 rue de la Chaumière, 74300 Thyez — Haute-Savoie, France',
      'RCS : [à compléter : ville du greffe et numéro]',
      'SIRET : [à compléter]',
      'TVA intracommunautaire : [à compléter]',
      'Téléphone : 09 61 32 94 03 / 06 31 39 69 90',
      'E-mail : [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr)',
      '## Directeur de la publication',
      'Monsieur Valentin Perrillat-Bottonet, gérant de la société SWATTER TV & INFO.',
      '## Hébergeur',
      '[à compléter : nom, adresse et téléphone de l’hébergeur du nouveau site].',
      '## Conception et réalisation',
      'Site conçu et développé par LTNS (voir les [crédits](/credits)).',
      '## Contenu du site',
      'Les informations publiées sur www.swatter-tv.fr le sont à titre informatif. SWATTER TV & INFO s’efforce d’en assurer l’exactitude et la mise à jour, sans pouvoir garantir qu’elles soient exemptes d’erreurs ou d’omissions. Les contenus peuvent être modifiés à tout moment, sans préavis.',
      'Pour signaler une erreur, un contenu qui vous semble illicite ou exercer un droit de réponse, écrivez-nous à [contact@swatter-tv.fr](mailto:contact@swatter-tv.fr) ou utilisez le formulaire [Nous contacter](/contact?sujet=autre).',
      '## Propriété intellectuelle',
      'L’ensemble du site et de ses contenus (textes, images, vidéos, logos, émissions) est protégé par le droit d’auteur. Toute reproduction, représentation, modification, publication, transmission ou dénaturation, totale ou partielle, du site ou de son contenu, par quelque procédé et sur quelque support que ce soit, est interdite sans l’autorisation écrite préalable de SWATTER TV & INFO.',
      'Toute exploitation non autorisée du site ou de son contenu engage la responsabilité de son auteur et constitue une contrefaçon sanctionnée par les articles L. 335-2 et suivants du Code de la propriété intellectuelle. Il en va de même des bases de données du site, protégées par les articles L. 341-1 et suivants du même code : toute extraction ou réutilisation non autorisée est interdite.',
      '## Liens vers d’autres sites',
      'Le site contient des liens vers d’autres sites (plateformes vidéo, partenaires, sources d’information). SWATTER TV & INFO n’en contrôle pas le contenu et ne peut être tenue responsable de ce qu’ils publient, ni de leur usage des données personnelles ou des cookies.',
      '## Données personnelles et cookies',
      'Pour savoir quelles données nous recueillons, quels cookies le site utilise et comment exercer vos droits, consultez notre page [Vie privée](/vie-privee).',
    ],
  },
]

export type SeedWebcam = {
  name: string
  place: string
  image: string
  temperature: string
}

/** Webcams d'exemple (type « image rafraîchie » pointant vers un visuel du site) : à remplacer par les vraies webcams. */
export const WEBCAMS: (SeedWebcam & { provider: Webcam['provider']; department: DepartmentSlug })[] = [
  { name: 'Lac d’Annecy (exemple)', place: 'Lieu à préciser', department: 'haute-savoie', image: 't-ete-a', temperature: '', provider: 'image' },
  { name: 'Station de ski (exemple)', place: 'Lieu à préciser', department: 'savoie', image: 't-hiver-a', temperature: '', provider: 'image' },
]
