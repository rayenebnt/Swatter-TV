/**
 * Ajoute les webcams de la chaîne qui manquent (src/scripts/seed/webcams.ts), SANS RIEN MODIFIER ni supprimer de ce qui
 * a été saisi dans l'administration. Usage : npm run webcams
 *
 * Une webcam déjà présente (même nom, ou même adresse) est laissée telle quelle. Les nouvelles sont publiées, actives et
 * sans lien de flux : elles s'affichent « Bientôt en direct » jusqu'à ce que le lien soit renseigné dans l'administration.
 * Les deux webcams d'exemple des premières versions (« … (exemple) ») sont retirées si elles n'ont pas été modifiées
 * (lien d'origine vers un visuel du site).
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { slugify } from '@/lib/slugify'
import { OLD_EXAMPLE_WEBCAMS, WEBCAMS } from './seed/webcams'

const payload = await getPayload({ config })
const log = (msg: string) => payload.logger.info(msg)

const { docs: existing } = await payload.find({
  collection: 'webcams',
  draft: true,
  limit: 1000,
  depth: 0,
  pagination: false,
  overrideAccess: true,
  select: { name: true, slug: true, embedUrl: true },
})
const known = new Set(existing.flatMap((w) => [slugify(w.name ?? ''), w.slug ?? '']).filter(Boolean))

let added = 0
for (const [i, w] of WEBCAMS.entries()) {
  if (known.has(slugify(w.name))) continue
  await payload.create({
    collection: 'webcams',
    data: { _status: 'published', name: w.name, department: w.department, provider: 'iframe', order: i + 1, active: true },
    overrideAccess: true,
  })
  log(`Webcam ajoutée : ${w.name}`)
  added++
}

for (const w of existing) {
  if (!OLD_EXAMPLE_WEBCAMS.includes(w.name ?? '') || !w.embedUrl?.startsWith('/visuels/')) continue
  await payload.delete({ collection: 'webcams', id: w.id, overrideAccess: true })
  log(`Webcam d’exemple retirée : ${w.name}`)
}

log(added ? `${added} webcam(s) ajoutée(s) : renseignez leur lien dans Webcams pour les mettre en direct.` : 'Toutes les webcams de la chaîne sont déjà présentes.')
process.exit(0)
