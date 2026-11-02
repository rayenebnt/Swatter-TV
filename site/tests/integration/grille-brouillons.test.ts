// Tests d'intégration des créneaux de la grille restés en brouillon (enregistrés automatiquement pendant la saisie, jamais
// publiés, ou modifiés sans être republiés) et des émissions pas en ligne : le site ne montre que la version publiée (un
// créneau publié sans titre spécifique prend bien le titre de son émission), le tableau de bord les compte, et la
// publication d'un clic (publishSlots / publishPrograms : les requêtes des boutons « Publier » de la grille, par l'API
// REST) publie leur dernière version ; un créneau incomplet est refusé avec la raison, sans bloquer les autres. Une
// émission créée comme dans l'administration (fiche vide, puis saisie enregistrée en brouillon) et jamais publiée n'a pas
// de nom en ligne : un créneau qui l'utilise est refusé à la publication, avec son nom et quoi faire. Semaines de mai 2033,
// propres à ce fichier.
import { ValidationError, type Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDashboardData } from '@/components/admin/dashboard-data'
import { findOfflinePrograms, publishPrograms, publishSlots } from '@/components/admin/slotPublication'
import { parisDateTime } from '@/lib/format'
import { publicationAware } from '@/lib/publication'
import { toSlot } from '@/lib/queries/schedule'
import type { Program, Schedule } from '@/payload-types'
import { adminToken, api, testPayload } from './helpers'
import { createProgram } from './api-outils'

const CONTEXT = { disableRevalidate: true }
/** Lundi 2 mai 2033 (heure d'été) : les 7 soirées du 2 au 8 mai, puis les deux semaines suivantes. */
const MONDAY = '2033-05-02'
const PERIOD = {
  and: [
    { startsAt: { greater_than_equal: parisDateTime(MONDAY, '00:30').toISOString() } },
    { startsAt: { less_than: parisDateTime('2033-05-23', '00:30').toISOString() } },
  ],
}

let payload: Payload
let program: Program
const created: number[] = []
const programs: number[] = []

beforeAll(async () => {
  payload = await testPayload()
  program = await createProgram({ title: 'Le magazine des brouillons' })
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  if (created.length) await payload.delete({ collection: 'schedule', where: { id: { in: created } }, context: CONTEXT })
  if (programs.length) await payload.delete({ collection: 'programs', where: { id: { in: programs } }, context: CONTEXT })
})

/** Créneau publié, ou brouillon jamais publié (`draft`), au jour et à l'heure de Paris donnés. */
async function slot(day: string, time: string, extra: Partial<Omit<Schedule, 'id'>> = {}, { draft = false } = {}): Promise<Schedule> {
  const doc = await payload.create({
    collection: 'schedule',
    draft,
    data: { startsAt: parisDateTime(day, time).toISOString(), durationMinutes: 30, program: program.id, _status: draft ? 'draft' : 'published', ...extra },
    depth: 0,
    context: CONTEXT,
  })
  created.push(doc.id)
  return doc
}

/** Créneau publié, puis modifié en brouillon (comme l'enregistrement automatique), sans être republié. */
async function changedSlot(day: string, time: string, titleOverride: string): Promise<Schedule> {
  const doc = await slot(day, time)
  await payload.update({ collection: 'schedule', id: doc.id, draft: true, data: { titleOverride }, depth: 0, context: CONTEXT })
  return doc
}

/** Ce que voit le site ces semaines-là (versions publiées seulement, comme src/lib/queries/schedule.ts). */
async function onSite() {
  const site = publicationAware(payload, false)
  const { docs } = await site.find({ collection: 'schedule', where: PERIOD, sort: 'startsAt', depth: 1, pagination: false })
  return docs.map(toSlot).map((s) => ({ id: s.id, title: s.title }))
}

/** Requêtes du bouton « Publier » envoyées à l'API REST du site, avec le jeton de l'équipe. */
const viaApi = (token: string) =>
  (async (url: string | URL | Request, init?: RequestInit) =>
    api(String(url), { method: init?.method, body: init?.body as string, token, headers: { 'accept-language': 'fr' } })) as typeof fetch

describe('créneaux restés en brouillon', () => {
  it('le site ne montre que les versions publiées ; sans titre spécifique, le titre de l’émission', async () => {
    const published = await slot(MONDAY, '20:00')
    const draft = await slot(MONDAY, '21:00', {}, { draft: true })
    const changed = await changedSlot(MONDAY, '22:00', 'Titre modifié, pas encore publié')
    const seen = await onSite()
    expect(seen).toContainEqual({ id: published.id, title: 'Le magazine des brouillons' })
    expect(seen).toContainEqual({ id: changed.id, title: 'Le magazine des brouillons' })
    expect(seen.map((s) => s.id)).not.toContain(draft.id)
  })

  it('le tableau de bord compte ceux des 7 prochaines soirées (jamais publiés ou modifiés depuis)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(parisDateTime(MONDAY, '12:00'))
    // les trois du test précédent (lundi), plus un brouillon mardi et un au-delà des 7 soirées
    await slot('2033-05-03', '19:00', {}, { draft: true })
    await slot('2033-05-12', '19:00', {}, { draft: true })
    const evenings = (await getDashboardData(payload)).evenings
    expect(evenings?.drafts).toEqual({ count: 3, firstDay: MONDAY })
    // lundi : 20 h, 22 h publiés ; le reste de la semaine est vide sur le site
    expect(evenings?.empty).toEqual(['2033-05-03', '2033-05-04', '2033-05-05', '2033-05-06', '2033-05-07', '2033-05-08'])
  })

  it('publication d’un clic : dernière version publiée, créneau incomplet refusé avec la raison', async () => {
    const draft = await slot('2033-05-04', '20:00', { titleOverride: 'Soirée spéciale' }, { draft: true })
    const changed = await changedSlot('2033-05-04', '21:00', 'Nouveau titre')
    // émission pas encore choisie : enregistré en brouillon (sans contrôle), refusé à la publication
    const incomplete = await slot('2033-05-04', '22:00', { program: undefined }, { draft: true })
    const progress: number[] = []
    const result = await publishSlots(
      '',
      [
        { id: draft.id, label: draft.label ?? undefined },
        { id: incomplete.id, startsAt: incomplete.startsAt },
        { id: changed.id, label: changed.label ?? undefined },
      ],
      (done) => progress.push(done),
      viaApi(await adminToken()),
    )
    expect(result.published).toBe(2)
    expect(result.interrupted).toBe(0)
    expect(result.refused).toEqual(['04/05/2033 22:00 : Émission : Ce champ est requis.'])
    expect(progress).toEqual([1, 2, 3])
    const seen = await onSite()
    expect(seen).toContainEqual({ id: draft.id, title: 'Soirée spéciale' })
    expect(seen).toContainEqual({ id: changed.id, title: 'Nouveau titre' })
    expect(seen.map((s) => s.id)).not.toContain(incomplete.id)
  })

  it('sans connexion : publication refusée, rien ne change', async () => {
    const draft = await slot('2033-05-05', '20:00', {}, { draft: true })
    const anonymous = (async (url: string | URL | Request, init?: RequestInit) => api(String(url), { method: init?.method, body: init?.body as string })) as typeof fetch
    const result = await publishSlots('', [{ id: draft.id }], undefined, anonymous)
    expect(result.published).toBe(0)
    expect(result.refused).toHaveLength(1)
    expect((await onSite()).map((s) => s.id)).not.toContain(draft.id)
  })
})

/**
 * Émission créée comme dans l'administration : « Ajouter » enregistre aussitôt une fiche vide en brouillon, puis la saisie
 * est enregistrée automatiquement, en brouillon (la fiche principale reste vide tant qu'on ne publie pas).
 */
async function draftProgram(title: string): Promise<number> {
  const doc = await payload.create({ collection: 'programs', draft: true, data: { _status: 'draft' } as never, depth: 0, context: CONTEXT })
  programs.push(doc.id)
  await payload.update({ collection: 'programs', id: doc.id, draft: true, autosave: true, data: { title, genre: 'magazine' }, depth: 0, context: CONTEXT })
  return doc.id
}

describe('émissions jamais publiées', () => {
  it('fiche en ligne vide : un créneau qui l’utilise est refusé à la publication, avec le nom saisi et quoi faire', async () => {
    const id = await draftProgram('Le Yodleur des cimes')
    expect((await payload.findByID({ collection: 'programs', id, depth: 0 })).title ?? null).toBeNull()
    // en brouillon : accepté (rien n'est contrôlé avant la publication)
    const draft = await slot('2033-05-10', '20:00', { program: id }, { draft: true })
    const refused = await payload
      .update({ collection: 'schedule', id: draft.id, data: { _status: 'published' }, depth: 0, context: CONTEXT })
      .then(() => null, (error: unknown) => error)
    expect(refused).toBeInstanceOf(ValidationError)
    expect((refused as ValidationError).data.errors).toEqual([
      expect.objectContaining({ path: 'program', message: expect.stringMatching(/^« Le Yodleur des cimes » n’est pas en ligne : ouvrez-la \(Programme TV › Émissions\)/) }),
    ])
    // même refus par l'API (bouton « Publier » de la grille), sous le champ « Émission »
    const token = await adminToken()
    const viaRest = await publishSlots('', [{ id: draft.id, startsAt: draft.startsAt }], undefined, viaApi(token))
    expect(viaRest.refused).toEqual([expect.stringMatching(/^10\/05\/2033 20:00 : Émission : « Le Yodleur des cimes » n’est pas en ligne/)])
    expect((await onSite()).map((s) => s.id)).not.toContain(draft.id)
  })

  it('repérées dans la grille et publiées d’un clic : le créneau peut ensuite être publié, avec le nom de l’émission', async () => {
    const id = await draftProgram('La Fondue du jeudi')
    const token = await adminToken()
    // le bandeau de la grille cherche les émissions des créneaux affichés : celle-ci, avec le nom saisi
    expect(await findOfflinePrograms('', [program.id, id], undefined, viaApi(token))).toEqual([{ id, title: 'La Fondue du jeudi' }])
    const published = await publishPrograms('', [{ id, title: 'La Fondue du jeudi' }], undefined, viaApi(token))
    expect(published).toEqual({ published: 1, refused: [], interrupted: 0 })
    expect(await findOfflinePrograms('', [program.id, id], undefined, viaApi(token))).toEqual([])
    const draft = await slot('2033-05-11', '20:00', { program: id }, { draft: true })
    expect((await publishSlots('', [{ id: draft.id }], undefined, viaApi(token))).published).toBe(1)
    expect(await onSite()).toContainEqual({ id: draft.id, title: 'La Fondue du jeudi' })
  })

  it('créneau publié avant ce contrôle avec une émission jamais publiée : sans nom sur le site, signalé, recopie refusée', async () => {
    const id = await draftProgram('Le Mag des lacs')
    await publishPrograms('', [{ id, title: 'Le Mag des lacs' }], undefined, viaApi(await adminToken()))
    const live = await slot('2033-05-16', '20:00', { program: id })
    // données d'avant : fiche en ligne de l'émission vide, en brouillon (directement en base, sans les contrôles)
    await payload.db.updateOne({ collection: 'programs', id, data: { _status: 'draft', title: null } })
    expect(await onSite()).toContainEqual({ id: live.id, title: 'Programme' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(parisDateTime('2033-05-16', '12:00'))
    expect((await getDashboardData(payload)).evenings?.offlinePrograms).toEqual({ names: ['« Le Mag des lacs »'], firstDay: '2033-05-16' })
    vi.useRealTimers()
    const copy = await api('/schedule/copy-week', { method: 'POST', token: await adminToken(), body: { from: '2033-05-16', days: 1 } })
    expect(copy.status).toBe(400)
    expect(((await copy.json()) as { error: string }).error).toMatch(/Émission : « Le Mag des lacs » n’est pas en ligne/)
    // publiée d'un clic : le créneau retrouve son nom
    await publishPrograms('', [{ id, title: 'Le Mag des lacs' }], undefined, viaApi(await adminToken()))
    expect(await onSite()).toContainEqual({ id: live.id, title: 'Le Mag des lacs' })
  })

  it('émission retirée du site : son nom reste en ligne (non signalée), mais un nouveau créneau est refusé', async () => {
    const id = await draftProgram('Les Alpages')
    await publishPrograms('', [{ id, title: 'Les Alpages' }], undefined, viaApi(await adminToken()))
    await payload.update({ collection: 'programs', id, data: { _status: 'draft' }, depth: 0, context: CONTEXT })
    expect(await findOfflinePrograms('', [id], undefined, viaApi(await adminToken()))).toEqual([])
    const draft = await slot('2033-05-17', '20:00', { program: id }, { draft: true })
    const result = await publishSlots('', [{ id: draft.id, startsAt: draft.startsAt }], undefined, viaApi(await adminToken()))
    expect(result.refused).toEqual([expect.stringMatching(/Émission : « Les Alpages » n’est pas en ligne/)])
  })
})
