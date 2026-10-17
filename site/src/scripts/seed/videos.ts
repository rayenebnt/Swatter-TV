// Vidéos à la demande et replays de démonstration.
import type { Video } from '@/payload-types'

export type SeedVideo = {
  title: string
  category: Video['category']
  duration: string
  thumbnail: string
  clip: string
  description: string
  /** Ancienneté de la publication, en heures. */
  ageHours: number
  views: number
  top10Rank?: number
  isVideoOfDay?: boolean
}

export const VIDEOS: SeedVideo[] = [
  {
    title: 'Une rencontre inattendue avec ce petit renardeau',
    category: 'nature',
    duration: '2:14',
    thumbnail: 'video-du-jour-renardeau',
    clip: 'matin-alpages',
    description: 'Au détour d’un sentier du plateau des Glières, un jeune renardeau curieux s’approche de notre caméra. Un moment rare, filmé à distance et sans le déranger.',
    ageHours: 3,
    views: 1284,
    isVideoOfDay: true,
  },
  {
    title: 'Mont-Blanc, le toit de l’Europe',
    category: 'documentaire',
    duration: '1:15:20',
    thumbnail: 'hero-crepuscule',
    clip: 'direct-mont-blanc',
    description: 'Des glaciers de Chamonix aux refuges d’altitude : une immersion au cœur du massif, au rythme des guides et des gardiens de refuge.',
    ageHours: 6 * 24 + 5,
    views: 48213,
    top10Rank: 1,
  },
  {
    title: 'La nuit du loup',
    category: 'documentaire',
    duration: '52:08',
    thumbnail: 't-nuit-b',
    clip: 'nuit-aravis',
    description: 'Dans le silence des Bauges, une meute se réinstalle. Six mois d’affût nocturne pour raconter son retour dans nos montagnes.',
    ageHours: 2 * 24 + 2,
    views: 41870,
    top10Rank: 2,
  },
  {
    title: 'Marmottes, l’été en altitude',
    category: 'nature',
    duration: '51:47',
    thumbnail: 't-ete-a',
    clip: 'matin-alpages',
    description: 'De la sortie d’hibernation aux premières neiges, une saison entière au plus près d’une colonie de marmottes.',
    ageHours: 4 * 24 + 7,
    views: 36402,
    top10Rank: 3,
  },
  {
    title: 'Saisonniers, une vie en station',
    category: 'series-realite',
    duration: '42:10',
    thumbnail: 't-hiver-a',
    clip: 'hiver-glaciers',
    description: 'Un hiver aux côtés de celles et ceux qui font vivre les stations : moniteurs, pisteurs, cuisiniers et perchmans.',
    ageHours: 5 * 24 + 3,
    views: 31955,
    top10Rank: 4,
  },
  {
    title: 'Le lac d’Annecy vu du ciel',
    category: 'magazine',
    duration: '12:36',
    thumbnail: 't-matin-a',
    clip: 'matin-alpages',
    description: 'Un survol des rives du lac, de Talloires au Semnoz, à la découverte de son histoire et de ceux qui le préservent.',
    ageHours: 3 * 24 + 4,
    views: 27318,
    top10Rank: 5,
  },
  {
    title: 'Sur les ailes du gypaète',
    category: 'nature',
    duration: '49:55',
    thumbnail: 't-alpenglow-a',
    clip: 'direct-mont-blanc',
    description: 'Disparu des Alpes au début du XXᵉ siècle, le gypaète barbu plane de nouveau au-dessus des Aravis.',
    ageHours: 7 * 24 + 1,
    views: 22064,
    top10Rank: 6,
  },
  {
    title: 'Glaciers : la course contre le temps',
    category: 'documentaire',
    duration: '54:12',
    thumbnail: 't-alpenglow-b',
    clip: 'hiver-glaciers',
    description: 'Glaciologues et guides témoignent du recul des glaciers alpins et des solutions imaginées pour s’adapter.',
    ageHours: 8 * 24 + 6,
    views: 18731,
    top10Rank: 7,
  },
  {
    title: 'Haute Tension — Épisode 2',
    category: 'series',
    duration: '51:30',
    thumbnail: 't-orage-a',
    clip: 'nuit-aravis',
    description: 'L’orage menace le chantier du barrage, et l’ingénieure découvre que les rapports de sécurité ont été modifiés.',
    ageHours: 2 * 24 + 9,
    views: 15209,
    top10Rank: 8,
  },
  {
    title: 'Les secrets du reblochon',
    category: 'magazine',
    duration: '47:58',
    thumbnail: 't-ete-b',
    clip: 'matin-alpages',
    description: 'Des alpages de Thônes aux caves d’affinage, rencontre avec les producteurs du plus célèbre des fromages savoyards.',
    ageHours: 6 * 24 + 11,
    views: 12887,
    top10Rank: 9,
  },
  {
    title: 'Nuit étoilée sur les Aravis',
    category: 'nature',
    duration: '3:42',
    thumbnail: 't-nuit-a',
    clip: 'nuit-aravis',
    description: 'Un accéléré de toute une nuit au col des Aravis, du coucher du soleil aux premières lueurs de l’aube.',
    ageHours: 26,
    views: 9412,
    top10Rank: 10,
  },
  {
    title: 'Ligue 2 : l’avant-match FC Annecy – AS Nancy Lorraine',
    category: 'sport',
    duration: '2:58',
    thumbnail: 'info-du-jour-stade',
    clip: 'direct-mont-blanc',
    description: 'Les enjeux de la rencontre et l’ambiance au Parc des Sports avant le coup d’envoi.',
    ageHours: 5,
    views: 2416,
  },
  {
    title: 'Le journal des Alpes : l’essentiel du jour',
    category: 'info',
    duration: '6:12',
    thumbnail: 't-crepuscule-c',
    clip: 'matin-alpages',
    description: 'Les principaux titres de l’actualité régionale en six minutes.',
    ageHours: 7,
    views: 1932,
  },
  {
    title: 'Le grand quiz des Savoyards',
    category: 'divertissement',
    duration: '26:40',
    thumbnail: 't-crepuscule-b',
    clip: 'direct-mont-blanc',
    description: 'Quatre villages s’affrontent sur le patrimoine savoyard.',
    ageHours: 30,
    views: 5731,
  },
  {
    title: 'Fondue party : le défi des chefs',
    category: 'divertissement',
    duration: '31:20',
    thumbnail: 't-alpenglow-b',
    clip: 'hiver-glaciers',
    description: 'Trois chefs, un caquelon, une heure : qui réinventera la fondue savoyarde ?',
    ageHours: 2 * 24 + 4,
    views: 2904,
  },
  {
    title: 'Refuge 2 500 m',
    category: 'series-realite',
    duration: '39:45',
    thumbnail: 't-nuages-a',
    clip: 'hiver-glaciers',
    description: 'La vie d’un refuge au-dessus de la mer de nuages, de l’ouverture de la saison à la dernière nuit.',
    ageHours: 3 * 24 + 2,
    views: 3512,
  },
  {
    title: 'Les Gardiens du lac — Épisode 4',
    category: 'series',
    duration: '48:05',
    thumbnail: 't-matin-b',
    clip: 'matin-alpages',
    description: 'Une disparition trouble le calme du lac et ravive une vieille rivalité entre deux familles de pêcheurs.',
    ageHours: 20,
    views: 4118,
  },
  {
    title: 'La Vallée blanche — bande-annonce',
    category: 'cinema',
    duration: '2:05',
    thumbnail: 't-hiver-b',
    clip: 'hiver-glaciers',
    description: 'Un guide de Chamonix et son fils face à la montagne. Le film est à retrouver dans le programme TV de Swatter TV.',
    ageHours: 9,
    views: 3266,
  },
  {
    title: 'Le Dernier Berger',
    category: 'cinema',
    duration: '1:41:00',
    thumbnail: 't-matin-b',
    clip: 'matin-alpages',
    description: 'Une dernière transhumance avant la retraite, entre transmission et nostalgie.',
    ageHours: 4 * 24 + 1,
    views: 1876,
  },
]

export type SeedReplay = {
  title: string
  program: string
  thumbnail: string
  clip: string
  duration: string
  description: string
  /** Jour de diffusion (0 = aujourd'hui, -1 = hier…) et heure de Paris. */
  day: number
  time: string
}

export const REPLAYS: SeedReplay[] = [
  { title: 'Le journal des Alpes', program: 'journal', thumbnail: 't-crepuscule-c', clip: 'matin-alpages', duration: '24 min', day: -1, time: '19:45', description: 'L’édition du soir : l’actualité de la Haute-Savoie et de la région, la météo et les résultats sportifs.' },
  { title: 'Swatter Sport', program: 'sport', thumbnail: 't-orage-a', clip: 'direct-mont-blanc', duration: '28 min', day: -1, time: '17:30', description: 'Les résultats du week-end, le point sur la Ligue 2 et les premières courses de la saison de trail.' },
  { title: 'La nuit du loup', program: 'loup', thumbnail: 't-nuit-b', clip: 'nuit-aravis', duration: '52 min', day: -2, time: '22:50', description: 'Six mois d’affût nocturne dans les Bauges pour raconter le retour du loup dans nos montagnes.' },
  { title: 'Le journal des Alpes', program: 'journal', thumbnail: 't-crepuscule-c', clip: 'matin-alpages', duration: '24 min', day: -2, time: '19:45', description: 'L’édition du soir : l’actualité de la Haute-Savoie et de la région, la météo et l’agenda.' },
  { title: 'Marmottes, l’été en altitude', program: 'marmottes', thumbnail: 't-ete-a', clip: 'matin-alpages', duration: '52 min', day: -3, time: '18:30', description: 'Une saison entière au plus près d’une colonie de marmottes du Beaufortain.' },
  { title: 'L’agenda du week-end', program: 'agenda', thumbnail: 't-crepuscule-a', clip: 'direct-mont-blanc', duration: '20 min', day: -3, time: '19:25', description: 'Marchés, concerts et fêtes de village : notre sélection de sorties pour le week-end.' },
  { title: 'Sur les ailes du gypaète', program: 'gypaete', thumbnail: 't-alpenglow-a', clip: 'direct-mont-blanc', duration: '50 min', day: -4, time: '22:50', description: 'Le récit de la réintroduction réussie du gypaète barbu dans le massif des Aravis.' },
  { title: 'Saisonniers, une vie en station — Épisode 3', program: 'saisonniers', thumbnail: 't-hiver-a', clip: 'hiver-glaciers', duration: '42 min', day: -5, time: '16:40', description: 'Premières chutes de neige : les pisteurs préparent le domaine avant l’arrivée des vacanciers.' },
  { title: 'Les secrets du reblochon', program: 'reblochon', thumbnail: 't-ete-b', clip: 'matin-alpages', duration: '48 min', day: -6, time: '13:00', description: 'Rencontre avec les producteurs et les affineurs du plus célèbre des fromages savoyards.' },
  { title: 'Mont-Blanc, le toit de l’Europe', program: 'montblanc', thumbnail: 'hero-crepuscule', clip: 'direct-mont-blanc', duration: '75 min', day: -7, time: '20:45', description: 'Une immersion au cœur du massif du Mont-Blanc, des glaciers de Chamonix aux refuges d’altitude.' },
  { title: 'Le grand quiz des Savoyards — Demi-finale', program: 'quiz', thumbnail: 't-crepuscule-b', clip: 'direct-mont-blanc', duration: '26 min', day: -8, time: '10:00', description: 'Thônes et Megève s’affrontent pour une place en finale.' },
]
