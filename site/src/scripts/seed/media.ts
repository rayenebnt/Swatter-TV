// Médias de démonstration : visuels de la maquette (public/visuels), vignettes réelles du site actuel
// (seed/assets) et courts clips vidéo générés avec ffmpeg (seed/assets/videos).

export type SeedMedia = { key: string; file: string; alt: string; credit?: string }

const visual = (key: string, alt: string): SeedMedia => ({ key, file: `public/visuels/${key}.webp`, alt })
const photo = (key: string, alt: string): SeedMedia => ({ key, file: `seed/assets/${key}.jpg`, alt, credit: 'Swatter TV' })
const clip = (key: string, alt: string): SeedMedia => ({ key, file: `seed/assets/videos/${key}.mp4`, alt, credit: 'Swatter TV' })

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

  photo('info-annemasse', 'Moto de la police nationale stationnée à Annemasse'),
  photo('info-du-jour-stade', 'Le stade du FC Annecy illuminé de nuit'),
  photo('info-foot-annonay', 'Match de football amateur sur un terrain bordé d’arbres'),
  photo('info-foot-loire', 'Supporters au bord du terrain pendant un match de Coupe de France'),
  photo('info-repit', 'Personne en fauteuil roulant accompagnée par une aidante'),
  photo('info-station', 'Rassemblement de skieurs brandissant des skis pour défendre leur station'),
  photo('sortie-demontagnee', 'Affiche de La Démontagnée : vache, chèvre et brebis devant les sommets'),
  photo('video-du-jour-renardeau', 'Un jeune renardeau dans les herbes hautes'),

  clip('direct-mont-blanc', 'Vidéo de démonstration : lent zoom sur les sommets au crépuscule'),
  clip('nuit-aravis', 'Vidéo de démonstration : massif montagneux au clair de lune'),
  clip('matin-alpages', 'Vidéo de démonstration : lac alpin au petit matin'),
  clip('hiver-glaciers', 'Vidéo de démonstration : sommets enneigés en hiver'),
]
