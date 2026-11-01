/**
 * Photos de montagnes de la chaîne comme images de fond du site en ligne : le Bargy et le Môle (public/visuels), nommés
 * sur l'image (champ « Lieu photographié » de la médiathèque). Les photos sont ajoutées à la médiathèque (reprises si
 * elles y sont déjà), puis posées sur :
 *   - la 1re diapositive du carrousel de l'accueil : le Bargy ;
 *   - la 2e diapositive : le Môle (en largeur), et sa photo en hauteur comme image pour téléphone ;
 *   - l'image de la page « Le direct » (affichée avant la lecture et hors antenne) : le Bargy.
 * Les autres diapositives et réglages ne changent pas.
 *
 * Usage : npm run fonds              montre ce qui sera fait, sans rien modifier
 *         npm run fonds -- --confirmer   le fait
 *
 * Refusé si des modifications des réglages « Accueil et direct » attendent d'être publiées (elles seraient publiées en
 * même temps) : publiez-les ou annulez-les d'abord. Les anciennes images restent dans la médiathèque.
 */
import config from '@payload-config'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import type { Media } from '@/payload-types'

import { MEDIA } from './seed/media'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const confirm = process.argv.slice(2).includes('--confirmer')
const payload = await getPayload({ config })
const context = { disableRevalidate: true }

const PHOTOS = ['bargy', 'mole', 'mole-portrait'] as const
type PhotoKey = (typeof PHOTOS)[number]

/** Média de la médiathèque portant ce nom de fichier (ou « nom-1.ext »…). */
async function findPhoto(key: PhotoKey): Promise<Media | null> {
  const found = await payload.find({ collection: 'media', where: { filename: { like: key } }, limit: 20, depth: 0, overrideAccess: true })
  return found.docs.find((m) => m.filename && new RegExp(`^${key}(-\\d+)?\\.\\w+$`).test(m.filename)) ?? null
}

const label = (m: Media | number | null | undefined) => (m && typeof m === 'object' ? `« ${m.filename ?? m.id} »` : m ? `n° ${m}` : 'aucune')

// réglages publiés (depth 1 : noms des images actuelles) ; refus si un brouillon plus récent attend
const { docs: drafts } = await payload.findGlobalVersions({
  slug: 'settings',
  where: { and: [{ latest: { equals: true } }, { 'version._status': { equals: 'draft' } }] },
  limit: 1,
  depth: 0,
  overrideAccess: true,
})
const settings = await payload.findGlobal({ slug: 'settings', depth: 1, overrideAccess: true })
const slides = settings.heroSlides ?? []

const existing = new Map<PhotoKey, Media | null>()
for (const key of PHOTOS) existing.set(key, await findPhoto(key))

console.log('Photos de la médiathèque :')
for (const key of PHOTOS) {
  const def = MEDIA.find((m) => m.key === key)
  const m = existing.get(key)
  console.log(`  ${def?.place} (${key}) : ${m ? `déjà là (${label(m)}), lieu « ${def?.place} »` : 'ajoutée'}`)
}
console.log('Images de fond :')
if (slides[0]) console.log(`  diapositive 1 « ${slides[0].titleLine1} » : ${label(slides[0].image)} → le Bargy`)
if (slides[1]) console.log(`  diapositive 2 « ${slides[1].titleLine1} » : ${label(slides[1].image)} → le Môle ; pour téléphone : ${label(slides[1].imageMobile)} → le Môle en hauteur`)
if (!slides.length) console.log('  aucune diapositive dans le carrousel : l’accueil affiche déjà ces photos par défaut')
console.log(`  page « Le direct » : ${label(settings.livePoster)} → le Bargy`)
if (slides.length > 2) console.log(`  diapositive${slides.length > 3 ? 's' : ''} 3${slides.length > 3 ? ` à ${slides.length}` : ''} : inchangée${slides.length > 3 ? 's' : ''}`)

if (drafts.length) {
  console.error('\n✖ Des modifications de « Accueil et direct » attendent d’être publiées : publiez-les (ou annulez-les) dans l’administration, puis relancez.')
  process.exit(1)
}
if (!confirm) {
  console.log('\nRien n’a été modifié. Pour le faire :\n  npm run fonds -- --confirmer')
  process.exit(0)
}

// photos : ajoutées si besoin, description et lieu mis à jour
const ids = new Map<PhotoKey, number>()
for (const key of PHOTOS) {
  const def = MEDIA.find((m) => m.key === key)
  if (!def) throw new Error(`Photo inconnue : ${key}`)
  const m = existing.get(key)
  const doc = m
    ? await payload.update({ collection: 'media', id: m.id, data: { alt: def.alt, place: def.place }, overrideAccess: true, context })
    : await payload.create({ collection: 'media', data: { alt: def.alt, place: def.place }, filePath: path.join(ROOT, def.file), overrideAccess: true, context })
  ids.set(key, doc.id)
}
const id = (key: PhotoKey) => ids.get(key) as number

// diapositives telles qu'enregistrées (depth 0 : numéros des images), seules les images des deux premières changent
const published = await payload.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
const heroSlides = (published.heroSlides ?? []).map((s, i) =>
  i === 0 ? { ...s, image: id('bargy') } : i === 1 ? { ...s, image: id('mole'), imageMobile: id('mole-portrait') } : s,
)
await payload.updateGlobal({
  slug: 'settings',
  data: { heroSlides, livePoster: id('bargy'), _status: 'published' },
  depth: 0,
  overrideAccess: true,
  context,
})
console.log('\nPhotos posées. Le site se met à jour de lui-même dans la minute.')
process.exit(0)
