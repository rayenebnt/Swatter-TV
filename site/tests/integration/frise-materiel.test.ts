// Frise du matériel de la page « Le groupe » (moveEquipmentSteps, src/lib/frise-materiel.ts : npm run frise-materiel sur
// le site en ligne) : les étapes qui parlent de caméra ou de matériel, ajoutées à la suite des logos dans la première
// frise, passent dans l'ordre dans une frise « Notre matériel au fil du temps » placée juste après ; aperçu sans rien
// modifier ; brouillon du client (caméras pas encore publiées) publié avec ; frise du matériel déjà là : complétée ;
// rien à déplacer : rien n'est modifié ; page absente : refus. Le site (versions publiées) montre les deux frises.
import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EQUIPMENT_PAGE, EQUIPMENT_TIMELINE, moveEquipmentSteps } from '@/lib/frise-materiel'
import { publicationAware } from '@/lib/publication'
import { timelineSteps, visibleTimelines } from '@/lib/timeline'
import { testPayload } from './helpers'

const CONTEXT = { disableRevalidate: true }
const LOGOS = path.resolve('seed/assets/logos')
let payload: Payload
const images: number[] = []

/** Dernière version de la page (brouillon compris). */
const latest = async () => (await payload.find({ collection: 'pages', where: { slug: { equals: EQUIPMENT_PAGE } }, draft: true, limit: 1, depth: 0, overrideAccess: true })).docs[0]
/** Version en ligne de la page, comme le site la lit (images chargées). */
const live = async () => (await publicationAware(payload, false).find({ collection: 'pages', where: { slug: { equals: EQUIPMENT_PAGE } }, depth: 1, limit: 1 })).docs[0]
/** Frises d'une version : titre et étapes (date · titre). */
const shape = (page: Awaited<ReturnType<typeof latest>>) =>
  (page.timelines ?? []).map((t) => ({ title: t.title, steps: (t.steps ?? []).map((s) => [s.date ?? null, s.title]) }))
const move = (confirm: boolean) => moveEquipmentSteps(payload, { confirm })

/** Page « Le groupe » publiée avec ces frises (images : celles de la médiathèque de test, dans l'ordre). */
async function groupPage(timelines: { title: string; steps: [string | null, string][] }[], intro = 'Présentation du groupe.') {
  let n = 0
  return payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      title: 'Le groupe',
      slug: EQUIPMENT_PAGE,
      intro,
      timelines: timelines.map((t) => ({ title: t.title, steps: t.steps.map(([date, title]) => ({ date, title, image: images[n++ % images.length] })) })),
    },
    overrideAccess: true,
    context: CONTEXT,
  })
}

beforeAll(async () => {
  payload = await testPayload()
  for (const file of ['logo-1-hd.webp', 'logo-2-triangle.webp', 'logo-5-montagnes.webp']) {
    const doc = await payload.create({ collection: 'media', data: { alt: `Image ${file}` }, filePath: path.join(LOGOS, file), overrideAccess: true, context: CONTEXT })
    images.push(doc.id)
  }
})

afterEach(async () => {
  await payload.delete({ collection: 'pages', where: { slug: { equals: EQUIPMENT_PAGE } }, overrideAccess: true, context: CONTEXT })
})

afterAll(async () => {
  for (const id of images) await payload.delete({ collection: 'media', id, overrideAccess: true, context: CONTEXT })
})

const LOGO_STEPS: [string, string][] = [
  ['Novembre', '2025'],
  ['Avril', '2026'],
]
const CAMERA_STEPS: [string, string][] = [
  ['La caméra reportage', '2026'],
  ['LA CAMÉRA SPECTACLE', '2026'],
]

describe('frise du matériel de la page « Le groupe »', () => {
  it('page absente : refus', async () => {
    expect(await move(true)).toEqual({ status: 'no-page' })
  })

  it('aperçu sans rien modifier, puis les caméras passent dans l’ordre dans une frise juste après les logos ; visible sur le site', async () => {
    await groupPage([{ title: 'L’évolution du logo', steps: [LOGO_STEPS[0], CAMERA_STEPS[0], LOGO_STEPS[1], CAMERA_STEPS[1]] }])
    const before = shape(await latest())
    const summary = (s: [string, string]) => ({ date: s[0], title: s[1] })
    expect(await move(false)).toEqual({ status: 'ready', moved: CAMERA_STEPS.map(summary), kept: LOGO_STEPS.map(summary), draft: false, existing: false })
    expect(shape(await latest())).toEqual(before)

    expect((await move(true)).status).toBe('done')
    const page = await latest()
    expect(page).toMatchObject({ _status: 'published', title: 'Le groupe', intro: 'Présentation du groupe.' })
    expect(shape(page)).toEqual([
      { title: 'L’évolution du logo', steps: LOGO_STEPS },
      { title: EQUIPMENT_TIMELINE.title, steps: CAMERA_STEPS },
    ])
    expect(page.timelines?.[1]?.intro).toBe(EQUIPMENT_TIMELINE.intro)
    // chaque étape garde son image (images 1 et 3 pour les logos, 2 et 1 pour les caméras : l'ordre de création)
    expect(page.timelines?.[0]?.steps?.map((s) => s.image)).toEqual([images[0], images[2]])
    expect(page.timelines?.[1]?.steps?.map((s) => s.image)).toEqual([images[1], images[0]])

    const site = visibleTimelines((await live()).timelines)
    expect(site.map((t) => t.title)).toEqual(['L’évolution du logo', EQUIPMENT_TIMELINE.title])
    expect(timelineSteps(site[1]).map((s) => s.date)).toEqual(['La caméra reportage', 'LA CAMÉRA SPECTACLE'])

    // une seconde fois : rien à déplacer, rien n'est modifié
    expect(await move(true)).toEqual({ status: 'nothing-to-move', steps: LOGO_STEPS.map(summary) })
    expect(shape(await latest())).toEqual(shape(page))
  })

  it('caméras ajoutées en brouillon, pas encore publiées : le brouillon est publié, avec les caméras dans leur frise', async () => {
    const page = await groupPage([{ title: 'L’évolution du logo', steps: LOGO_STEPS }])
    // le client ajoute ses caméras et change l'introduction, enregistré automatiquement sans publier
    await payload.update({
      collection: 'pages',
      id: page.id,
      draft: true,
      data: {
        _status: 'draft',
        intro: 'Le groupe en quelques dates.',
        timelines: [{ title: 'L’évolution du logo', steps: [...LOGO_STEPS, ...CAMERA_STEPS].map(([date, title], i) => ({ date, title, image: images[i % images.length] })) }],
      },
      overrideAccess: true,
      context: CONTEXT,
    })
    expect(shape(await live())).toEqual([{ title: 'L’évolution du logo', steps: LOGO_STEPS }])

    expect(await move(false)).toMatchObject({ status: 'ready', draft: true })
    expect((await move(true)).status).toBe('done')
    const online = await live()
    expect(online.intro).toBe('Le groupe en quelques dates.')
    expect(shape(online)).toEqual([
      { title: 'L’évolution du logo', steps: LOGO_STEPS },
      { title: EQUIPMENT_TIMELINE.title, steps: CAMERA_STEPS },
    ])
    expect((await latest())._status).toBe('published')
  })

  it('frise du matériel déjà là : les caméras restées avec les logos y sont ajoutées à la fin', async () => {
    await groupPage([
      { title: 'L’évolution du logo', steps: [LOGO_STEPS[0], CAMERA_STEPS[1]] },
      { title: EQUIPMENT_TIMELINE.title, steps: [CAMERA_STEPS[0]] },
      { title: 'Nos émissions', steps: [['2026', 'Le journal']] },
    ])
    expect(await move(true)).toMatchObject({ status: 'done', existing: true })
    expect(shape(await latest())).toEqual([
      { title: 'L’évolution du logo', steps: [LOGO_STEPS[0]] },
      { title: EQUIPMENT_TIMELINE.title, steps: CAMERA_STEPS },
      { title: 'Nos émissions', steps: [['2026', 'Le journal']] },
    ])
  })
})
