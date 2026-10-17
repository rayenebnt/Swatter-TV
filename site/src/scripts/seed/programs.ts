// Émissions et grille des programmes de démonstration (8 jours continus, 24 h sur 24).
import type { Program } from '@/payload-types'

export type SeedProgram = {
  key: string
  title: string
  genre: Program['genre']
  image: string
  synopsis: string
  isPremiere?: boolean
}

export const PROGRAMS: SeedProgram[] = [
  {
    key: 'journal',
    title: 'Le journal des Alpes',
    genre: 'info',
    image: 't-crepuscule-c',
    synopsis: 'L’essentiel de l’actualité de la Haute-Savoie et de l’Auvergne-Rhône-Alpes : faits du jour, reportages, invités et sport, en quelques minutes.',
  },
  {
    key: 'meteo',
    title: 'La météo des Alpes',
    genre: 'meteo',
    image: 't-nuages-b',
    synopsis: 'Les prévisions pour les vallées, les lacs et les massifs, avec l’enneigement et les conditions en altitude.',
  },
  {
    key: 'agenda',
    title: 'L’agenda du week-end',
    genre: 'agenda',
    image: 't-crepuscule-a',
    synopsis: 'Marchés, concerts, fêtes de village et compétitions : notre sélection de sorties pour le week-end en Haute-Savoie et en Savoie.',
  },
  {
    key: 'sport',
    title: 'Swatter Sport',
    genre: 'sport',
    image: 't-orage-a',
    synopsis: 'Football, hockey, ski et trail : les résultats, les résumés et les portraits des clubs et des athlètes de la région.',
  },
  {
    key: 'montblanc',
    title: 'Mont-Blanc, le toit de l’Europe',
    genre: 'documentaire',
    image: 'hero-crepuscule',
    synopsis: 'Des glaciers de Chamonix aux refuges d’altitude : une immersion au cœur du massif du Mont-Blanc, au fil des saisons.',
  },
  {
    key: 'loup',
    title: 'La nuit du loup',
    genre: 'documentaire',
    image: 't-nuit-b',
    isPremiere: true,
    synopsis: 'Dans le silence des Bauges, une meute se réinstalle. Six mois d’affût nocturne pour raconter son retour dans nos montagnes.',
  },
  {
    key: 'marmottes',
    title: 'Marmottes, l’été en altitude',
    genre: 'documentaire',
    image: 't-ete-a',
    synopsis: 'De la sortie d’hibernation aux premières neiges, la vie d’une colonie de marmottes dans les alpages du Beaufortain.',
  },
  {
    key: 'gypaete',
    title: 'Sur les ailes du gypaète',
    genre: 'documentaire',
    image: 't-alpenglow-a',
    synopsis: 'Disparu des Alpes au début du XXᵉ siècle, le gypaète barbu plane de nouveau au-dessus des Aravis. Récit d’une réintroduction réussie.',
  },
  {
    key: 'glaciers',
    title: 'Glaciers : la course contre le temps',
    genre: 'documentaire',
    image: 't-alpenglow-b',
    synopsis: 'Glaciologues, guides et gardiens de refuge témoignent du recul spectaculaire des glaciers alpins et des solutions imaginées pour s’adapter.',
  },
  {
    key: 'reblochon',
    title: 'Les secrets du reblochon',
    genre: 'magazine',
    image: 't-ete-b',
    synopsis: 'Des alpages de Thônes aux caves d’affinage, rencontre avec les producteurs qui font vivre le plus célèbre des fromages savoyards.',
  },
  {
    key: 'lacciel',
    title: 'Le lac d’Annecy vu du ciel',
    genre: 'magazine',
    image: 't-matin-a',
    synopsis: 'Un survol des rives du lac d’Annecy, de Talloires au Semnoz, à la découverte de son histoire et de ceux qui le préservent.',
  },
  {
    key: 'saisonniers',
    title: 'Saisonniers, une vie en station',
    genre: 'divertissement',
    image: 't-hiver-a',
    synopsis: 'Moniteurs, pisteurs, cuisiniers et perchmans : un hiver aux côtés de celles et ceux qui font vivre les stations.',
  },
  {
    key: 'quiz',
    title: 'Le grand quiz des Savoyards',
    genre: 'divertissement',
    image: 't-crepuscule-b',
    synopsis: 'Quatre villages s’affrontent sur le patrimoine, l’histoire et les traditions de la Savoie et de la Haute-Savoie.',
  },
  {
    key: 'hautetension',
    title: 'Haute Tension',
    genre: 'serie',
    image: 't-orage-b',
    isPremiere: true,
    synopsis: 'Sur le chantier d’un barrage de haute montagne, une ingénieure découvre des malfaçons que certains voudraient taire. Série en huit épisodes.',
  },
  {
    key: 'valleeblanche',
    title: 'La Vallée blanche',
    genre: 'cinema',
    image: 't-hiver-b',
    synopsis: 'Un guide de Chamonix et son fils, brouillés depuis des années, se retrouvent pour une dernière course en haute montagne.',
  },
  {
    key: 'dernierberger',
    title: 'Le Dernier Berger',
    genre: 'cinema',
    image: 't-matin-b',
    synopsis: 'À la veille de sa retraite, un berger des Bauges mène sa dernière transhumance, accompagné d’un jeune apprenti venu de la ville.',
  },
  {
    key: 'scene',
    title: 'Scène des Alpes',
    genre: 'divertissement',
    image: 't-crepuscule-a',
    synopsis: 'Les concerts des artistes de la région, captés sur les scènes de Haute-Savoie et de Savoie.',
  },
]

/** Un créneau de la grille : heure locale (Paris), émission, titre spécifique facultatif. */
export type DaySlot = { time: string; program: string; title?: string }

const PRIME = ['montblanc', 'valleeblanche', 'scene', 'dernierberger', 'glaciers', 'hautetension', 'marmottes', 'scene']
const LATE = ['gypaete', 'loup', 'montblanc', 'marmottes', 'loup', 'glaciers', 'gypaete', 'reblochon']
const DOCS = ['marmottes', 'gypaete', 'glaciers', 'montblanc', 'loup']
const MAGS = ['reblochon', 'lacciel']
const FILMS = ['dernierberger', 'valleeblanche']

const pick = (list: string[], i: number) => list[((i % list.length) + list.length) % list.length]
const title = (key: string) => PROGRAMS.find((p) => p.key === key)?.title ?? ''
const rediff = (key: string) => `${title(key)} (rediffusion)`

/**
 * Créneaux d'une journée (heure de Paris), du plus tôt au plus tard. La durée de chaque créneau
 * est calculée jusqu'au début du suivant : la grille est continue, sans trou ni chevauchement,
 * y compris les jours de changement d'heure (aucun créneau ne commence entre 2 h et 3 h).
 * @param i  rang du jour dans la grille (0 = hier)
 * @param weekday  jour de la semaine (0 = dimanche … 6 = samedi)
 */
export function daySlots(i: number, weekday: number): DaySlot[] {
  const weekend = weekday === 0 || weekday === 6
  const edition = (name: string) => `Le journal des Alpes — ${weekend ? 'Week-end' : name}`
  const doc = (n: number) => pick(DOCS, i * 3 + n)
  const mag = (n: number) => pick(MAGS, i + n)

  return [
    { time: '00:00', program: pick(LATE, i + 3), title: rediff(pick(LATE, i + 3)) },
    { time: '01:15', program: doc(4), title: rediff(doc(4)) },
    { time: '03:00', program: mag(1), title: rediff(mag(1)) },
    { time: '04:00', program: 'saisonniers', title: rediff('saisonniers') },
    { time: '05:00', program: 'quiz', title: rediff('quiz') },
    { time: '06:00', program: 'journal', title: edition('Matin') },
    { time: '06:30', program: 'meteo' },
    { time: '06:40', program: mag(0) },
    { time: '07:30', program: 'journal', title: edition('Matin') },
    { time: '08:00', program: 'meteo' },
    { time: '08:10', program: doc(0) },
    { time: '09:05', program: weekend ? 'sport' : 'hautetension' },
    { time: '10:00', program: weekend ? 'agenda' : 'quiz' },
    { time: '11:00', program: doc(1) },
    { time: '12:00', program: 'journal', title: edition('Midi') },
    { time: '12:30', program: 'meteo' },
    { time: '12:40', program: 'agenda' },
    { time: '13:00', program: mag(1) },
    { time: '14:00', program: pick(FILMS, i), title: rediff(pick(FILMS, i)) },
    { time: '15:45', program: doc(2) },
    { time: '16:40', program: 'saisonniers' },
    { time: '17:30', program: 'sport' },
    { time: '18:00', program: 'journal' },
    { time: '18:20', program: 'meteo' },
    { time: '18:30', program: pick(DOCS, i * 3 + 3) === pick(PRIME, i) ? doc(1) : pick(DOCS, i * 3 + 3) },
    { time: '19:25', program: 'agenda' },
    { time: '19:45', program: 'journal', title: edition('Soir') },
    { time: '20:30', program: 'meteo' },
    { time: '20:45', program: pick(PRIME, i) },
    { time: '22:30', program: 'journal', title: edition('Nuit') },
    { time: '22:50', program: pick(LATE, i) },
  ]
}

/** Émission diffusée à 20:45 le jour `i` (utilisée pour la diapositive « Ce soir »). */
export const primeOf = (i: number) => pick(PRIME, i)
