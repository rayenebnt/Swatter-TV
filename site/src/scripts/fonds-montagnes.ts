/**
 * Photos de montagnes de la chaîne (le Bargy, le Môle) : elles sont l'image de fond des en-têtes des pages intérieures
 * (PageHeader, headerPhotos.ts), pas du carrousel de l'accueil. Une version précédente de cette commande les avait posées
 * sur les deux premières diapositives du carrousel et sur l'image de la page « Le direct » : elle remet à leur place les
 * images d'origine (contenus de départ : crépuscule, nuit), là seulement où ces photos sont encore en place.
 *
 * Usage : npm run fonds                  montre ce qui sera fait, sans rien modifier
 *         npm run fonds -- --confirmer   le fait
 *
 * Image d'origine absente de la médiathèque : elle y est remise (visuel du site, public/visuels). Rien d'autre ne
 * change (textes, autres diapositives, photos de la médiathèque, qui restent utilisables). Refusé si des modifications des
 * réglages « Accueil et direct » attendent d'être publiées (elles seraient publiées en même temps).
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

/** Fichier de la médiathèque de ce nom (« bargy.webp », « bargy-1.webp »…). */
const named = (key: string) => (m: Media | number | null | undefined) =>
  Boolean(m && typeof m === 'object' && m.filename && new RegExp(`^${key}(-\\d+)?\\.\\w+$`).test(m.filename))

async function findMedia(key: string): Promise<Media | null> {
  const found = await payload.find({ collection: 'media', where: { filename: { like: key } }, limit: 20, depth: 0, overrideAccess: true })
  return found.docs.find((m) => named(key)(m)) ?? null
}

const label = (m: Media | number | null | undefined) => (m && typeof m === 'object' ? `« ${m.filename ?? m.id} »` : m ? `n° ${m}` : 'aucune')
const original = (key: string, m: Media | null) => (m ? label(m) : `« ${key} » (remise dans la médiathèque)`)

/** Image d'origine : celle de la médiathèque, sinon ajoutée depuis les visuels du site. */
async function originalId(key: string, m: Media | null): Promise<number> {
  if (m) return m.id
  const def = MEDIA.find((d) => d.key === key)
  if (!def) throw new Error(`Visuel inconnu : ${key}`)
  const doc = await payload.create({ collection: 'media', data: { alt: def.alt }, filePath: path.join(ROOT, def.file), overrideAccess: true, context })
  return doc.id
}

const { docs: drafts } = await payload.findGlobalVersions({
  slug: 'settings',
  where: { and: [{ latest: { equals: true } }, { 'version._status': { equals: 'draft' } }] },
  limit: 1,
  depth: 0,
  overrideAccess: true,
})
// réglages publiés : depth 1 pour reconnaître les photos (nom du fichier), depth 0 pour réécrire les mêmes valeurs
const settings = await payload.findGlobal({ slug: 'settings', depth: 1, overrideAccess: true })
const slides = settings.heroSlides ?? []
const crepuscule = await findMedia('hero-crepuscule')
const nuit = await findMedia('hero-nuit')

const changes = {
  slide1: named('bargy')(slides[0]?.image),
  slide2: named('mole')(slides[1]?.image),
  slide2Phone: named('mole-portrait')(slides[1]?.imageMobile),
  poster: named('bargy')(settings.livePoster),
}

console.log('Carrousel de l’accueil et page « Le direct » :')
if (changes.slide1) console.log(`  diapositive 1 « ${slides[0].titleLine1} » : ${label(slides[0].image)} → ${original('hero-crepuscule', crepuscule)} (image d’origine)`)
if (changes.slide2) console.log(`  diapositive 2 « ${slides[1].titleLine1} » : ${label(slides[1].image)} → ${original('hero-nuit', nuit)} (image d’origine)`)
if (changes.slide2Phone) console.log(`  diapositive 2, image pour téléphone : ${label(slides[1].imageMobile)} → aucune`)
if (changes.poster) console.log(`  page « Le direct » : ${label(settings.livePoster)} → ${original('hero-crepuscule', crepuscule)} (image d’origine)`)
if (!Object.values(changes).some(Boolean)) {
  console.log('  aucune photo de montagne à retirer : rien à faire.')
  console.log('Les photos du Bargy et du Môle sont l’image de fond des pages du site (en-têtes), sans réglage.')
  process.exit(0)
}

if (drafts.length) {
  console.error('\n✖ Des modifications de « Accueil et direct » attendent d’être publiées : publiez-les (ou annulez-les) dans l’administration, puis relancez.')
  process.exit(1)
}
if (!confirm) {
  console.log('\nRien n’a été modifié. Pour le faire :\n  npm run fonds -- --confirmer')
  process.exit(0)
}

const crepusculeId = changes.slide1 || changes.poster ? await originalId('hero-crepuscule', crepuscule) : null
const nuitId = changes.slide2 ? await originalId('hero-nuit', nuit) : null
const published = await payload.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
const heroSlides = (published.heroSlides ?? []).map((s, i) => {
  if (i === 0 && crepusculeId !== null && changes.slide1) return { ...s, image: crepusculeId }
  if (i === 1 && (changes.slide2 || changes.slide2Phone))
    return { ...s, ...(nuitId !== null ? { image: nuitId } : {}), ...(changes.slide2Phone ? { imageMobile: null } : {}) }
  return s
})
await payload.updateGlobal({
  slug: 'settings',
  data: { heroSlides, ...(changes.poster && crepusculeId !== null ? { livePoster: crepusculeId } : {}), _status: 'published' },
  depth: 0,
  overrideAccess: true,
  context,
})
console.log('\nImages d’origine remises. Le site se met à jour de lui-même dans la minute.')
process.exit(0)
