// Frise des logos de la page « Le groupe » (installLogoTimeline, src/scripts/seed/frise-logos.ts : npm run frise-logos sur
// un site déjà en ligne) : aperçu sans rien modifier ; logos ajoutés à la médiathèque, frise remplie dans l'ordre et page
// publiée, son texte inchangé ; le site (versions publiées) montre la frise avec ses images ; refus clairs (page absente,
// modifications en attente de publication, frise déjà remplie sauf « --remplacer », qui reprend les mêmes logos).
import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { publicationAware } from '@/lib/publication'
import { timelineSteps } from '@/lib/timeline'
import { installLogoTimeline, LOGO_PAGE, LOGO_TIMELINE } from '@/scripts/seed/frise-logos'
import { testPayload } from './helpers'

const ROOT = path.resolve('.')
const CONTEXT = { disableRevalidate: true }
let payload: Payload

/** Logos de la frise dans la médiathèque (« logo-1-hd.webp »…). */
const logos = async () =>
  (await payload.find({ collection: 'media', where: { filename: { like: 'logo-' } }, limit: 50, depth: 0, overrideAccess: true })).docs.filter((m) =>
    /^logo-\d-[a-z-]+(-\d+)?\.webp$/.test(m.filename ?? ''),
  )
/** Dernière version de la page (brouillon compris). */
const latest = async () => (await payload.find({ collection: 'pages', where: { slug: { equals: LOGO_PAGE } }, draft: true, limit: 1, depth: 0, overrideAccess: true })).docs[0]
/** Version en ligne de la page, comme le site la lit (images chargées). */
const live = async () => (await publicationAware(payload, false).find({ collection: 'pages', where: { slug: { equals: LOGO_PAGE } }, depth: 1, limit: 1 })).docs[0]
const install = (options: { confirm: boolean; replace?: boolean }) => installLogoTimeline(payload, { root: ROOT, ...options })

beforeAll(async () => {
  payload = await testPayload()
})

afterAll(async () => {
  await payload.delete({ collection: 'pages', where: { slug: { equals: LOGO_PAGE } }, overrideAccess: true, context: CONTEXT })
  for (const m of await logos()) await payload.delete({ collection: 'media', id: m.id, overrideAccess: true, context: CONTEXT })
})

describe('frise des logos de la page « Le groupe »', () => {
  it('page absente : refus, rien n’est ajouté à la médiathèque', async () => {
    expect(await install({ confirm: true })).toEqual({ status: 'no-page' })
    expect(await logos()).toEqual([])
  })

  it('aperçu, puis pose : logos ajoutés, frise dans l’ordre, page publiée sans toucher à son texte ; visible sur le site', async () => {
    await payload.create({
      collection: 'pages',
      data: { _status: 'published', title: 'Le groupe', slug: LOGO_PAGE, intro: 'Présentation du groupe.' },
      overrideAccess: true,
      context: CONTEXT,
    })
    expect(await install({ confirm: false })).toEqual({ status: 'ready', replaced: 0, media: LOGO_TIMELINE.steps.map((s) => ({ key: s.media, existing: false })) })
    expect(await logos()).toEqual([])
    expect((await latest()).timeline?.steps ?? []).toEqual([])

    expect((await install({ confirm: true })).status).toBe('done')
    expect((await logos()).map((m) => m.filename).sort()).toEqual(LOGO_TIMELINE.steps.map((s) => `${s.media}.webp`).sort())
    const page = await latest()
    expect(page).toMatchObject({ _status: 'published', title: 'Le groupe', intro: 'Présentation du groupe.', timeline: { title: LOGO_TIMELINE.title, intro: LOGO_TIMELINE.intro } })
    const steps = timelineSteps((await live()).timeline)
    expect(steps.map((s) => s.title)).toEqual(LOGO_TIMELINE.steps.map((s) => s.title))
    steps.forEach((s, i) => expect(s.image.src).toMatch(new RegExp(`^/api/media/file/${LOGO_TIMELINE.steps[i].media}\\.webp`)))
    // fichiers d'origine, carrés : le premier logo fait 300 px de côté
    expect(steps[0].image).toMatchObject({ width: 300, height: 300 })
    expect(steps.every((s) => s.image.width === s.image.height && s.image.alt)).toBe(true)
  })

  it('relance : frise déjà remplie, refus ; « --remplacer » : mêmes logos repris, sans doublon', async () => {
    expect(await install({ confirm: true })).toEqual({ status: 'already-filled', steps: 5 })
    expect(await install({ confirm: true, replace: true })).toEqual({ status: 'done', replaced: 5, media: LOGO_TIMELINE.steps.map((s) => ({ key: s.media, existing: true })) })
    expect(await logos()).toHaveLength(5)
    expect(timelineSteps((await live()).timeline)).toHaveLength(5)
  })

  it('modifications en attente de publication : refus, la version en ligne ne bouge pas', async () => {
    const page = await latest()
    await payload.update({ collection: 'pages', id: page.id, draft: true, data: { intro: 'Brouillon en cours.' }, overrideAccess: true, context: CONTEXT })
    expect(await install({ confirm: true, replace: true })).toEqual({ status: 'pending-changes' })
    expect((await live()).intro).toBe('Présentation du groupe.')
  })
})
