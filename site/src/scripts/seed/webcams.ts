// Webcams de la chaîne (liste fournie par Swatter TV) : une par département de la région, puis « Web Cams + » (hors
// région). Créées sans lien de flux : elles s'affichent « Bientôt en direct » jusqu'à ce que le lien soit renseigné.
import { departmentLabel, WEBCAMS_PLUS, type WebcamZone } from '@/lib/departments'

export type SeedWebcam = { name: string; department: WebcamZone }

const inRegion = (department: Exclude<WebcamZone, typeof WEBCAMS_PLUS>): SeedWebcam => ({ name: departmentLabel(department), department })

/** Dans l'ordre d'affichage de la page Webcams. */
export const WEBCAMS: SeedWebcam[] = [
  inRegion('ain'),
  inRegion('allier'),
  inRegion('ardeche'),
  inRegion('cantal'),
  inRegion('drome'),
  inRegion('haute-loire'),
  inRegion('haute-savoie'),
  inRegion('isere'),
  inRegion('loire'),
  inRegion('puy-de-dome'),
  inRegion('rhone'),
  inRegion('savoie'),
  { name: 'Suisse', department: WEBCAMS_PLUS },
  { name: 'Aoste', department: WEBCAMS_PLUS },
]

/** Webcams d'exemple des premières versions du jeu de démonstration, remplacées par la liste ci-dessus. */
export const OLD_EXAMPLE_WEBCAMS = ['Lac d’Annecy (exemple)', 'Station de ski (exemple)']
