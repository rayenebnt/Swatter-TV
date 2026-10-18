// Replays de démonstration. La rubrique « Vidéos » n'a pas de démonstration : ses vidéos viennent de la chaîne
// YouTube du client (fiche « Chaîne YouTube » de l'administration, import automatique).
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
