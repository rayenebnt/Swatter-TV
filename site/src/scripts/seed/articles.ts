// Articles par défaut (« L'Info ») : de simples modèles, marqués « Exemple », que le client remplace par les siens.
import type { Article } from '@/payload-types'

export type SeedArticle = {
  title: string
  department: Article['department']
  city?: string
  kicker: string
  image: string
  excerpt: string
  /** Corps de l'article (voir lexical.ts : « ## » pour un intertitre). */
  body: string[]
  /** Ancienneté de la publication, en minutes. */
  ageMinutes: number
  isInfoOfDay?: boolean
}

export const ARTICLES: SeedArticle[] = [
  {
    title: 'Exemple — Le titre de votre info du jour',
    department: 'haute-savoie',
    city: 'Annecy',
    kicker: 'À remplacer',
    image: 't-crepuscule-c',
    ageMinutes: 30,
    isInfoOfDay: true,
    excerpt: 'Article d’exemple : remplacez ce titre, ce résumé, la photo et le texte par votre propre info, puis cliquez sur « Publier les modifications ».',
    body: [
      'Cet article est un **modèle**. Il montre où s’affiche chaque élément sur le site : le titre, le résumé (le paragraphe d’introduction), la photo, la commune et la rubrique (le petit mot au-dessus du titre, ici « À remplacer »).',
      '## Comment le remplacer',
      '- Dans l’administration, ouvrez **L’Info**, puis cet article.',
      '- Modifiez le titre, le résumé, le texte et la photo.',
      '- Cochez « Info du jour » pour la mettre en avant sur l’accueil (une seule à la fois).',
      '- Cliquez sur **Publier les modifications**.',
      'Vous pouvez aussi supprimer cet article et en créer un nouveau avec le bouton « Créer ».',
    ],
  },
  {
    title: 'Exemple — Un deuxième article à remplacer',
    department: 'rhone',
    city: 'Lyon',
    kicker: 'À remplacer',
    image: 't-matin-a',
    ageMinutes: 3 * 60,
    excerpt: 'Article d’exemple : il apparaît dans le fil « En continu » de l’accueil et dans la page L’Info. Remplacez-le ou supprimez-le.',
    body: [
      'Ce deuxième article d’exemple montre comment les infos se suivent : la plus récente en haut, les suivantes dans le fil « En continu ». Chaque article est rangé dans son département (ici le Rhône) : les visiteurs peuvent filtrer l’info par département.',
      '## À savoir',
      'La date de publication peut être programmée : l’article n’apparaît sur le site qu’à partir de la date et de l’heure choisies.',
    ],
  },
  {
    title: 'Exemple — Supprimez les articles d’exemple avant l’ouverture',
    department: 'isere',
    city: 'Grenoble',
    kicker: 'À remplacer',
    image: 't-ete-a',
    ageMinutes: 26 * 60,
    excerpt: 'Article d’exemple : pensez à supprimer ou à remplacer tous les contenus marqués « Exemple » avant de faire connaître le site.',
    body: [
      'Les contenus dont le titre commence par « Exemple » ont été créés pour vous montrer le site rempli. Ils ne doivent pas rester en ligne.',
      'Le plus simple : dans la liste des articles, cochez-les puis cliquez sur **Supprimer**.',
    ],
  },
]
