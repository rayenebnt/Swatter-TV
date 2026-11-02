/**
 * Image et aperçu animé des vidéos et replays qui n'en ont pas encore (fiches créées avant l'aperçu animé, ou vidéo
 * injoignable au moment de l'enregistrement) : voir catchUpAutoMedia (src/hooks/videoAutoMedia.ts). Puis version légère
 * des vidéos de fond du carrousel de l'accueil qui n'en ont pas (catchUpHeroVideos). Sans risque à relancer : les fiches
 * complètes sont ignorées. Lancé en arrière-plan par deploy/mise-a-jour.sh.
 * Usage : npm run apercus   (Docker : docker compose run --rm tools npm run apercus)
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { catchUpAutoMedia, catchUpHeroVideos } from '@/hooks/videoAutoMedia'

const payload = await getPayload({ config })
const { checked, updated } = await catchUpAutoMedia(payload, (line) => payload.logger.info(line))
payload.logger.info(`Images et aperçus animés : ${updated} fiche(s) complétée(s) sur ${checked} à compléter.`)
const backgrounds = await catchUpHeroVideos(payload, (line) => payload.logger.info(line))
if (backgrounds) payload.logger.info(`Vidéos de fond du carrousel : ${backgrounds} version(s) légère(s) préparée(s).`)
process.exit(0)
