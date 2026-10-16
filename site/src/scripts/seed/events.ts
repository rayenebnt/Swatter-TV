// Agenda de démonstration : dates relatives au jour du lancement du script.
import type { Event } from '@/payload-types'

/** Jour relatif : `from` = 'saturday' (samedi qui vient) ou 'today', plus `days` jours. */
export type RelDay = { from: 'saturday' | 'today'; days: number }

export type SeedEvent = {
  title: string
  city: string
  place?: string
  category: NonNullable<Event['category']>
  poster: string
  description: string
  start: RelDay & { time: string }
  end?: RelDay & { time: string }
  program?: { time: string; label: string }[]
  isWeekendPick?: boolean
}

const sat = (days: number, time: string) => ({ from: 'saturday' as const, days, time })
const today = (days: number, time: string) => ({ from: 'today' as const, days, time })

export const EVENTS: SeedEvent[] = [
  {
    title: 'La Démontagnée',
    city: 'Bourg-Saint-Maurice',
    place: 'Centre-ville · Les Arcs',
    category: 'terroir',
    poster: 'sortie-demontagnee',
    isWeekendPick: true,
    start: sat(0, '10:30'),
    end: sat(0, '18:00'),
    description:
      'Les troupeaux quittent les alpages et font leur grand retour à Bourg-Saint-Maurice. Cloches, produits locaux, traditions et bonne humeur : après un été passé en altitude, il est temps de retrouver la vallée.',
    program: [
      { time: '10h30', label: 'Grand défilé des troupeaux, chars et chevaux dans la ville' },
      { time: '12h00', label: 'Repas montagnard sous le chapiteau' },
      { time: 'Toute la journée', label: 'Animations musicales et stands de produits locaux' },
    ],
  },
  {
    title: 'Marché des producteurs de pays',
    city: 'Thônes',
    place: 'Place Avet',
    category: 'marche',
    poster: 't-ete-b',
    start: sat(1, '08:00'),
    end: sat(1, '13:00'),
    description: 'Reblochon fermier, charcuterie, miel, légumes de saison et pain cuit au feu de bois : une matinée pour rencontrer les producteurs des Aravis.',
  },
  {
    title: 'Soirée d’observation des étoiles',
    city: 'Leschaux',
    place: 'Semnoz · Crêt de Châtillon',
    category: 'famille',
    poster: 't-nuit-b',
    start: today(1, '20:30'),
    end: today(1, '23:30'),
    description: 'Télescopes, carte du ciel et contes sous les étoiles : une soirée d’initiation à l’astronomie encadrée par des passionnés. Prévoir des vêtements chauds.',
  },
  {
    title: 'Exposition « Glaciers, mémoire des Alpes »',
    city: 'Chamonix-Mont-Blanc',
    place: 'Musée alpin',
    category: 'culture',
    poster: 't-hiver-b',
    start: today(3, '10:00'),
    end: today(31, '18:00'),
    description: 'Photographies anciennes et récentes, cartes et témoignages : une exposition pour comprendre l’évolution des glaciers du massif du Mont-Blanc.',
  },
  {
    title: 'Concert symphonique : Les Quatre Saisons',
    city: 'Chambéry',
    place: 'Espace Malraux',
    category: 'musique',
    poster: 't-alpenglow-a',
    start: today(5, '20:00'),
    description: 'Les Quatre Saisons de Vivaldi et des œuvres de compositeurs savoyards, interprétées par un ensemble de musiciens de la région.',
  },
  {
    title: 'Salon des saveurs savoyardes',
    city: 'La Roche-sur-Foron',
    place: 'Rochexpo',
    category: 'terroir',
    poster: 't-crepuscule-c',
    start: sat(6, '10:00'),
    end: sat(8, '19:00'),
    description: 'Trois jours pour découvrir les producteurs, les artisans et les chefs de Savoie et de Haute-Savoie : dégustations, démonstrations culinaires et ateliers pour les enfants.',
    program: [
      { time: '10h00', label: 'Ouverture du salon' },
      { time: '15h00', label: 'Démonstration culinaire autour de la fondue' },
      { time: '18h00', label: 'Remise des prix du concours des producteurs' },
    ],
  },
  {
    title: 'Concert d’automne de l’harmonie',
    city: 'Cluses',
    place: 'Espace Carpano & Pons',
    category: 'musique',
    poster: 't-crepuscule-b',
    start: sat(7, '20:30'),
    description: 'L’harmonie municipale présente son concert d’automne : musiques de films, grands classiques et créations, pour toute la famille.',
  },
  {
    title: 'Fête de la châtaigne',
    city: 'Albertville',
    place: 'Place de l’Europe',
    category: 'fete',
    poster: 't-crepuscule-a',
    start: sat(7, '10:00'),
    end: sat(7, '18:00'),
    description: 'Châtaignes grillées, vin chaud, artisanat et animations musicales pour fêter l’automne en famille.',
  },
  {
    title: 'Trail nocturne du Salève',
    city: 'Monnetier-Mornex',
    place: 'Départ place de la mairie',
    category: 'sport',
    poster: 't-nuit-a',
    start: sat(8, '18:30'),
    end: sat(8, '23:00'),
    description: 'Deux parcours de 12 et 24 km à la frontale sur les sentiers du Salève, avec vue sur les lumières de l’agglomération genevoise.',
    program: [
      { time: '17h00', label: 'Retrait des dossards' },
      { time: '18h30', label: 'Départ du 24 km' },
      { time: '19h00', label: 'Départ du 12 km' },
    ],
  },
  {
    title: 'Fête de la pomme et du cidre',
    city: 'Thyez',
    place: 'Centre du village',
    category: 'famille',
    poster: 't-ete-a',
    start: sat(14, '10:00'),
    end: sat(14, '18:00'),
    description: 'Pressage à l’ancienne, dégustation de jus et de cidre, stands de producteurs et ateliers pour les enfants.',
  },
  {
    title: 'Contes d’automne pour les enfants',
    city: 'Sallanches',
    place: 'Médiathèque',
    category: 'famille',
    poster: 't-orage-b',
    start: sat(14, '15:00'),
    end: sat(14, '16:30'),
    description: 'Histoires de forêts, de montagnes et de créatures d’automne racontées par une conteuse, pour les enfants à partir de 4 ans.',
  },
  {
    title: 'Bourse aux skis',
    city: 'Le Grand-Bornand',
    place: 'Salle des fêtes du Chinaillon',
    category: 'sport',
    poster: 't-hiver-a',
    start: sat(21, '09:00'),
    end: sat(21, '17:00'),
    description: 'Dépôt et vente de matériel de ski d’occasion : skis, chaussures, casques et vêtements, pour s’équiper à petit prix avant la saison.',
  },
]
