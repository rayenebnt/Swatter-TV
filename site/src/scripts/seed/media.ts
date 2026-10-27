// Médias de départ : visuels de montagne du site (public/visuels), utilisables comme illustrations, et un court clip
// d'exemple pour le direct (seed/assets/videos), à remplacer par le vrai flux.

export type SeedMedia = { key: string; file: string; alt: string; credit?: string }

const visual = (key: string, alt: string): SeedMedia => ({ key, file: `public/visuels/${key}.webp`, alt })
const clip = (key: string, alt: string): SeedMedia => ({ key, file: `seed/assets/videos/${key}.mp4`, alt, credit: 'Swatter TV Info' })

export const MEDIA: SeedMedia[] = [
  visual('hero-crepuscule', 'Sommets enneigés dorés par le crépuscule, reflétés dans un lac de montagne'),
  visual('hero-matin', 'Lac alpin paisible et chaîne de sommets sous la lumière claire du matin'),
  visual('hero-nuit', 'Massif montagneux sous la pleine lune, reflété dans un lac la nuit'),
  visual('t-alpenglow-a', 'Sommets rosis par la dernière lumière du soir au-dessus d’un lac'),
  visual('t-alpenglow-b', 'Crêtes rocheuses à contre-jour et pics enneigés teintés de rose au coucher du soleil'),
  visual('t-crepuscule-a', 'Chaîne de montagnes baignée d’une lumière dorée, reflétée dans un lac au crépuscule'),
  visual('t-crepuscule-b', 'Ciel nuageux et sommets dorés se reflétant dans les eaux calmes d’un lac'),
  visual('t-crepuscule-c', 'Panorama de pics alpins au soleil couchant au-dessus d’un lac immobile'),
  visual('t-ete-a', 'Lac de montagne bordé de falaises verdoyantes sous un ciel d’été'),
  visual('t-ete-b', 'Pics rocheux et rives verdoyantes d’un lac alpin en été'),
  visual('t-hiver-a', 'Sommets enneigés au bord d’un lac gelé sous un ciel d’hiver'),
  visual('t-hiver-b', 'Massif enneigé et glaciers dominant un lac en hiver'),
  visual('t-matin-a', 'Rives boisées d’un lac alpin et sommets dans la brume du petit matin'),
  visual('t-matin-b', 'Lac de montagne aux eaux miroitantes au lever du jour'),
  visual('t-nuages-a', 'Sommet rocheux émergeant d’une mer de nuages'),
  visual('t-nuages-b', 'Pic enneigé au-dessus d’une mer de nuages ensoleillée'),
  visual('t-nuit-a', 'Montagnes sous un ciel étoilé éclairé par la lune'),
  visual('t-nuit-b', 'Silhouettes de sommets au clair de lune, reflétées dans un lac'),
  visual('t-orage-a', 'Ciel chargé et lumière d’orage au-dessus des sommets'),
  visual('t-orage-b', 'Nuages menaçants au-dessus d’une chaîne de montagnes avant l’orage'),

  clip('direct-mont-blanc', 'Vidéo de démonstration : lent zoom sur les sommets au crépuscule'),
]
