// Tests d'intégration des imports : tâche planifiée GET /api/cron/import (secret exigé ; météo depuis un faux Open-Meteo,
// vidéos de la chaîne depuis un faux YouTube, fiches vides abandonnées supprimées) et bouton « Importer maintenant »
// (POST /api/youtube/import, réservé à l'équipe connectée). Les faux services écoutent sur les ports des adresses
// données au site (OPEN_METEO_URL, YOUTUBE_BASE de vitest.config.ts).
import type { Server } from 'node:http'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parisDay } from '@/lib/format'
import type { YoutubeImportResult } from '@/lib/import/youtube'
import { METEO_CITIES } from '@/lib/meteo'
import type { Forecast } from '@/lib/meteo-types'
import type { Media, Program } from '@/payload-types'
import { MOCK_CHANNEL_ID, MOCK_PROGRAM, MOCK_VIDEOS, startYoutubeMock } from '../e2e/youtube-mock'
import { startOpenMeteoMock } from '../mocks/open-meteo.mjs'
import { adminToken, apiJson, editorToken, testPayload } from './helpers'
import { createProgram, createVideo, signup, unpublish } from './api-outils'

type CronResult = {
  meteo: { ok: boolean; skipped?: boolean; error?: string }
  youtube: YoutubeImportResult
  drafts: { deleted: number; error?: string }
}

const SECRET = 'secret-cron-des-tests'
/** Adresse de chaîne que le faux YouTube reconnaît (page /@swattertv-test). */
const CHANNEL = 'https://www.youtube.com/@swattertv-test'
const CONTEXT = { disableRevalidate: true }
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

const port = (url: string | undefined) => Number(new URL(url ?? 'http://127.0.0.1').port)
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()))

let payload: Payload
let meteoServer: Server
let youtubeServer: Server

beforeAll(async () => {
  payload = await testPayload()
  meteoServer = (await startOpenMeteoMock(port(process.env.OPEN_METEO_URL))) as Server
  youtubeServer = await startYoutubeMock(port(process.env.YOUTUBE_BASE))
  // émission dont le replay de 45 minutes du faux YouTube est un numéro
  await createProgram({ title: MOCK_PROGRAM })
})

afterAll(async () => {
  await Promise.all([close(meteoServer), close(youtubeServer)])
})

afterEach(() => {
  vi.useRealTimers()
})

const cron = (options: { authorization?: string; query?: string } = {}) =>
  apiJson<CronResult>(`/cron/import${options.query ?? ''}`, { headers: options.authorization === undefined ? {} : { authorization: options.authorization } })
const runCron = () => cron({ authorization: `Bearer ${SECRET}` })
const importNow = async (options: { token?: string; cookie?: string; headers?: Record<string, string> } = {}) =>
  apiJson<YoutubeImportResult & { error?: string }>('/youtube/import', { method: 'POST', ...options })

/** Fiche « Chaîne YouTube » renseignée comme dans l'administration (identifiant de chaîne pas encore connu). */
async function setChannel(data: Record<string, unknown> = {}) {
  await payload.updateGlobal({
    slug: 'youtube',
    data: {
      channel: CHANNEL,
      autoImport: true,
      replayMinutes: 20,
      publishMode: 'published',
      category: 'divertissement',
      channelId: null,
      channelFrom: null,
      ...data,
    },
    context: CONTEXT,
  })
}

/** Fiches de « Vidéos » ou « Replays » d'une vidéo YouTube (brouillons et contenus retirés du site compris). */
async function imported<T extends 'videos' | 'replays'>(collection: T, id: string) {
  return (await payload.find({ collection, where: { 'source.youtubeUrl': { equals: watchUrl(id) } }, depth: 1, pagination: false })).docs
}

/** Efface les fiches créées par un import précédent (chaque test part de zéro). */
async function forgetImports() {
  const urls = MOCK_VIDEOS.map((v) => watchUrl(v.id))
  for (const collection of ['videos', 'replays'] as const) {
    await payload.delete({ collection, where: { 'source.youtubeUrl': { in: urls } }, context: CONTEXT })
  }
}

describe('tâche planifiée : secret', () => {
  it('tâche planifiée : refusée sans le secret ou avec un mauvais (401) ; rien n’est importé', async () => {
    const before = await payload.findGlobal({ slug: 'meteo', depth: 0 })
    const attempts: { authorization?: string; query?: string }[] = [
      {},
      { authorization: 'Bearer mauvais-secret' },
      { authorization: 'Bearer ' },
      { authorization: `Bearer ${SECRET}-et-plus` },
      { authorization: `Bearer ${SECRET.toUpperCase()}` },
      // une session de l'équipe ne remplace pas le secret
      { authorization: `JWT ${await adminToken()}` },
      { query: '?secret=mauvais-secret' },
      { query: '?secret=' },
    ]
    for (const attempt of attempts) {
      const res = await cron(attempt)
      expect(res.status, JSON.stringify(attempt)).toBe(401)
      expect(res.body, JSON.stringify(attempt)).toEqual({ error: 'Non autorisé' })
    }
    expect((await payload.findGlobal({ slug: 'meteo', depth: 0 })).updatedAt).toBe(before.updatedAt)
  })

  it('tâche planifiée : sans CRON_SECRET configuré, elle est toujours refusée (même avec un secret vide)', async () => {
    vi.stubEnv('CRON_SECRET', '')
    try {
      for (const attempt of [{}, { authorization: 'Bearer ' }, { query: '?secret=' }, { authorization: `Bearer ${SECRET}` }]) {
        const res = await cron(attempt)
        expect(res.status, JSON.stringify(attempt)).toBe(401)
        expect(res.body).toEqual({ error: 'Non autorisé' })
      }
    } finally {
      vi.unstubAllEnvs()
    }
    expect((await runCron()).status).toBe(200)
  })

  it('tâche planifiée : le secret est accepté dans « Authorization: Bearer … » (quelle que soit la casse de « Bearer ») ou dans ?secret=', async () => {
    for (const attempt of [{ authorization: `Bearer ${SECRET}` }, { authorization: `bearer ${SECRET}` }, { query: `?secret=${SECRET}` }]) {
      const res = await cron(attempt)
      expect(res.status, JSON.stringify(attempt)).toBe(200)
      expect(Object.keys(res.body).sort()).toEqual(['drafts', 'meteo', 'youtube'])
    }
  })
})

describe('tâche planifiée : météo', () => {
  it('météo : importée depuis Open-Meteo dans le global « meteo » (5 jours, ville principale et villes suivies)', async () => {
    await payload.updateGlobal({ slug: 'meteo', data: { autoUpdate: true, _status: 'published' }, context: CONTEXT })
    const res = await runCron()
    expect(res.status).toBe(200)
    expect(res.body.meteo).toEqual({ ok: true })

    const meteo = await payload.findGlobal({ slug: 'meteo', depth: 0 })
    expect(meteo._status).toBe('published')
    const forecast = meteo.forecast as Forecast
    expect(forecast.region).toBe('Auvergne-Rhône-Alpes')
    expect(forecast.source).toBe('Open-Meteo (CC BY 4.0)')
    expect(Date.parse(forecast.updatedAt)).toBeGreaterThan(Date.now() - 60_000)
    expect(forecast.days).toHaveLength(5)
    expect(forecast.days[0].date).toBe(parisDay())
    for (let i = 1; i < 5; i++) expect(Date.parse(forecast.days[i].date) - Date.parse(forecast.days[i - 1].date)).toBe(86_400_000)
    const [today] = forecast.days
    expect(today.main.city).toBe('Annecy')
    // température actuelle du faux service (17,4 °C), arrondie
    expect(today.main.now).toBe(17)
    expect(today.cities.map((c) => c.name)).toEqual(METEO_CITIES.map((c) => c.name))
    expect(today.views?.map((v) => v.main.city)).toEqual(METEO_CITIES.slice(1).map((c) => c.name))
    expect(today.parts.map((p) => p.label)).toEqual(['Matin', 'Après-midi', 'Soirée'])
    expect(today.bulletin).toContain('Annecy')
  })

  it('météo : mise à jour automatique décochée → étape ignorée, prévisions conservées', async () => {
    await payload.updateGlobal({ slug: 'meteo', data: { autoUpdate: true, _status: 'published' }, context: CONTEXT })
    await runCron()
    const before = await payload.findGlobal({ slug: 'meteo', depth: 0 })
    await payload.updateGlobal({ slug: 'meteo', data: { autoUpdate: false, _status: 'published' }, context: CONTEXT })
    try {
      const res = await runCron()
      expect(res.status).toBe(200)
      expect(res.body.meteo).toEqual({ ok: false, skipped: true, error: 'mise à jour automatique désactivée dans l’administration (Réglages › Météo)' })
      expect((await payload.findGlobal({ slug: 'meteo', depth: 0 })).forecast).toEqual(before.forecast)
    } finally {
      await payload.updateGlobal({ slug: 'meteo', data: { autoUpdate: true, _status: 'published' }, context: CONTEXT })
    }
  })

  it('météo : Open-Meteo injoignable → erreur signalée, prévisions conservées, le reste de la tâche continue', async () => {
    await payload.updateGlobal({ slug: 'meteo', data: { autoUpdate: true, _status: 'published' }, context: CONTEXT })
    await runCron()
    const before = await payload.findGlobal({ slug: 'meteo', depth: 0 })
    await close(meteoServer)
    try {
      const res = await runCron()
      expect(res.status).toBe(200)
      expect(res.body.meteo.ok).toBe(false)
      // connexion refusée ou coupée, selon que le client HTTP réutilise ou non une connexion ouverte
      expect(res.body.meteo.error).toMatch(/ECONNREFUSED|ECONNRESET|socket hang up/)
      // les autres étapes ont bien tourné
      expect(res.body.youtube).toHaveProperty('ok')
      expect(res.body.drafts).toHaveProperty('deleted')
      expect((await payload.findGlobal({ slug: 'meteo', depth: 0 })).forecast).toEqual(before.forecast)
    } finally {
      meteoServer = (await startOpenMeteoMock(port(process.env.OPEN_METEO_URL))) as Server
    }
  })
})

describe('tâche planifiée : chaîne YouTube', () => {
  it('YouTube : Shorts et vidéos courtes dans « Vidéos », émission longue dans « Replays » (rattachée à son émission), avec vignette', async () => {
    await forgetImports()
    await setChannel()
    const res = await runCron()
    expect(res.status).toBe(200)
    expect(res.body.youtube).toEqual({ ok: true, created: 3, videos: 2, replays: 1, skipped: 0, total: 3, ids: ['swTest00003', 'swTest00002', 'swTest00001'] })

    const [short] = await imported('videos', 'swTest00001')
    expect(short).toMatchObject({
      title: 'Test import — Le marché d’Annecy',
      description: 'Description de « Test import — Le marché d’Annecy ».',
      category: 'divertissement',
      publishedAt: '2026-10-10T08:00:00.000Z',
      _status: 'published',
    })
    // Short : durée inconnue dans le flux, aucune page à lire
    expect(short.duration ?? null).toBeNull()
    const [clip] = await imported('videos', 'swTest00002')
    expect(clip).toMatchObject({ title: 'Test import — Balade au Semnoz', duration: '04:05', publishedAt: '2026-10-12T08:00:00.000Z', _status: 'published' })
    const [show] = await imported('replays', 'swTest00003')
    expect(show).toMatchObject({
      title: 'Test import émission — numéro du 14 octobre',
      duration: '45 min',
      broadcastAt: '2026-10-14T08:00:00.000Z',
      _status: 'published',
    })
    expect((show.program as Program | null)?.title).toBe(MOCK_PROGRAM)
    // une seule rubrique par vidéo
    expect(await imported('replays', 'swTest00001')).toEqual([])
    expect(await imported('replays', 'swTest00002')).toEqual([])
    expect(await imported('videos', 'swTest00003')).toEqual([])
    // vignette téléchargée depuis YouTube dans la médiathèque
    for (const [doc, id] of [
      [short, 'swTest00001'],
      [clip, 'swTest00002'],
      [show, 'swTest00003'],
    ] as const) {
      expect((doc.thumbnail as Media | null)?.filename).toMatch(new RegExp(`^youtube-${id}(-\\d+)?\\.\\w+$`))
    }

    const channel = await payload.findGlobal({ slug: 'youtube', depth: 0 })
    expect(channel).toMatchObject({
      channelId: MOCK_CHANNEL_ID,
      channelFrom: CHANNEL,
      lastError: null,
      lastResult: '2 vidéos dans « Vidéos » et 1 vidéo dans « Replays » (sur 3 vidéos lues sur la chaîne)',
    })
    expect(Date.parse(channel.lastImportAt ?? '')).toBeGreaterThan(Date.now() - 60_000)

    // passage suivant : rien de nouveau, aucun doublon
    const again = await runCron()
    expect(again.body.youtube).toMatchObject({ ok: true, created: 0, videos: 0, replays: 0, skipped: 3, total: 3 })
    for (const [collection, id] of [
      ['videos', 'swTest00001'],
      ['videos', 'swTest00002'],
      ['replays', 'swTest00003'],
    ] as const) {
      expect(await imported(collection, id)).toHaveLength(1)
    }
    expect((await payload.findGlobal({ slug: 'youtube', depth: 0 })).lastResult).toBe('rien à ajouter : 3 vidéos de la chaîne, toutes déjà sur le site')
  })

  it('YouTube : une vidéo retirée du site n’est pas recréée ; une vidéo supprimée l’est, avec la même vignette', async () => {
    await setChannel()
    await runCron()
    const [clip] = await imported('videos', 'swTest00002')
    await unpublish('videos', clip.id)
    const [show] = await imported('replays', 'swTest00003')
    const thumbnails = async () => (await payload.count({ collection: 'media', where: { filename: { like: 'youtube-swTest00003' } } })).totalDocs
    const thumbnailsBefore = await thumbnails()
    await payload.delete({ collection: 'replays', id: show.id, context: CONTEXT })

    const res = await runCron()
    expect(res.body.youtube).toMatchObject({ ok: true, created: 1, videos: 0, replays: 1, skipped: 2 })
    const clips = await imported('videos', 'swTest00002')
    expect(clips).toHaveLength(1)
    expect(clips[0]._status).toBe('draft')
    const shows = await imported('replays', 'swTest00003')
    expect(shows).toHaveLength(1)
    // image déjà dans la médiathèque : réutilisée, pas téléchargée une seconde fois
    expect((shows[0].thumbnail as Media | null)?.id).toBe((show.thumbnail as Media | null)?.id)
    expect(await thumbnails()).toBe(thumbnailsBefore)
  })

  it('YouTube : vidéos importées en brouillon si la fiche « Chaîne YouTube » le demande', async () => {
    await forgetImports()
    await setChannel({ publishMode: 'draft', category: 'sport' })
    const res = await runCron()
    expect(res.body.youtube).toMatchObject({ ok: true, created: 3 })
    const [clip] = await imported('videos', 'swTest00002')
    expect(clip).toMatchObject({ _status: 'draft', category: 'sport' })
    expect((await imported('replays', 'swTest00003'))[0]?._status).toBe('draft')
    await forgetImports()
  })

  it('YouTube : import automatique décoché → la tâche planifiée n’importe rien ; « Importer maintenant » importe quand même', async () => {
    await forgetImports()
    await setChannel({ autoImport: false })
    const res = await runCron()
    expect(res.status).toBe(200)
    expect(res.body.youtube).toEqual({ ok: false, created: 0, videos: 0, replays: 0, skipped: 0, total: 0, ids: [], error: 'import automatique désactivé' })
    expect(await imported('videos', 'swTest00001')).toEqual([])

    const now = await importNow({ token: await editorToken() })
    expect(now.status).toBe(200)
    expect(now.body).toMatchObject({ ok: true, created: 3, videos: 2, replays: 1 })
    expect(await imported('videos', 'swTest00001')).toHaveLength(1)
  })

  it('YouTube : sans chaîne renseignée, l’étape est signalée (tâche planifiée) ou refusée avec un message clair (502, « Importer maintenant »)', async () => {
    await setChannel({ channel: '' })
    const message = 'aucune chaîne YouTube renseignée (Vidéos › Chaîne YouTube)'
    const res = await runCron()
    expect(res.status).toBe(200)
    expect(res.body.youtube).toMatchObject({ ok: false, created: 0, error: message })
    const now = await importNow({ token: await editorToken() })
    expect(now.status).toBe(502)
    expect(now.body).toMatchObject({ ok: false, created: 0, error: message })
  })

  it('YouTube : une chaîne introuvable répond 502 avec l’erreur, notée dans la fiche « Chaîne YouTube »', async () => {
    await setChannel({ channel: 'https://www.youtube.com/@chaine-inconnue' })
    const message = 'chaîne « @chaine-inconnue » introuvable sur YouTube : vérifiez l’adresse'
    const now = await importNow({ token: await editorToken() })
    expect(now.status).toBe(502)
    expect(now.body).toMatchObject({ ok: false, created: 0, error: message })
    const channel = await payload.findGlobal({ slug: 'youtube', depth: 0 })
    expect(channel.lastError).toBe(message)
    expect(Date.parse(channel.lastImportAt ?? '')).toBeGreaterThan(Date.now() - 60_000)
  })

  it('« Importer maintenant » : réservé à l’équipe connectée (visiteur, membre et secret de la tâche planifiée refusés)', async () => {
    await setChannel()
    const m = await signup()
    const refused: { cookie?: string; headers?: Record<string, string> }[] = [
      {},
      { cookie: m.jar.header() },
      { headers: { authorization: `Bearer ${SECRET}` } },
    ]
    for (const options of refused) {
      const res = await importNow(options)
      expect(res.status, JSON.stringify(options)).toBe(401)
      expect(res.body, JSON.stringify(options)).toEqual({ error: 'Connectez-vous pour lancer l’import.' })
    }
    for (const token of [await editorToken(), await adminToken()]) {
      const res = await importNow({ token })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ ok: true, total: 3 })
    }
  })
})

describe('tâche planifiée : fiches vides abandonnées', () => {
  /** Fiche ouverte avec « Ajouter » (brouillon jamais publié) ; `data` vide : sans titre. */
  const create = (collection: 'videos' | 'articles' | 'programs', data: Record<string, unknown> = {}) =>
    payload.create({ collection, draft: true, data: data as never, context: CONTEXT }) as Promise<{ id: number }>
  const exists = async (collection: 'videos' | 'articles' | 'programs', id: number) =>
    (await payload.count({ collection, where: { id: { equals: id } } })).totalDocs === 1

  it('brouillons : les fiches jamais publiées restées sans titre plus de 24 h sont supprimées, pas les autres', async () => {
    // fiches ouvertes il y a 25 h
    vi.setSystemTime(Date.now() - 25 * 3600_000)
    let emptyVideo: { id: number }
    let emptyArticle: { id: number }
    let titled: { id: number }
    let live: { id: number }
    let retired: { id: number }
    try {
      emptyVideo = await create('videos')
      emptyArticle = await create('articles')
      titled = await create('videos', { title: 'Brouillon avec un titre' })
      // contenu en ligne dont le dernier brouillon (enregistrement automatique) n'a plus de titre
      live = await createVideo()
      await payload.update({ collection: 'videos', id: live.id, draft: true, data: { title: '' }, context: CONTEXT })
      // contenu retiré du site, sans titre dans son dernier brouillon : il a déjà été publié
      retired = await createVideo()
      await unpublish('videos', retired.id)
      await payload.update({ collection: 'videos', id: retired.id, draft: true, data: { title: '' }, context: CONTEXT })
    } finally {
      vi.useRealTimers()
    }
    // fiche ouverte il y a 2 h seulement
    vi.setSystemTime(Date.now() - 2 * 3600_000)
    let recent: { id: number }
    try {
      recent = await create('videos')
    } finally {
      vi.useRealTimers()
    }

    const res = await runCron()
    expect(res.status).toBe(200)
    expect(await exists('videos', emptyVideo.id)).toBe(false)
    expect(await exists('articles', emptyArticle.id)).toBe(false)
    for (const doc of [titled, live, retired, recent]) expect(await exists('videos', doc.id)).toBe(true)
  })

  it('brouillons : le ménage passe par toutes les rubriques à brouillons (émissions comprises), sans erreur, et compte juste', async () => {
    vi.setSystemTime(Date.now() - 25 * 3600_000)
    let emptyVideo: { id: number }
    let emptyProgram: { id: number }
    try {
      emptyVideo = await create('videos')
      emptyProgram = await create('programs')
    } finally {
      vi.useRealTimers()
    }
    const res = await runCron()
    expect(res.status).toBe(200)
    expect(res.body.drafts.error).toBeUndefined()
    expect(res.body.drafts.deleted).toBeGreaterThanOrEqual(2)
    expect(await exists('videos', emptyVideo.id)).toBe(false)
    expect(await exists('programs', emptyProgram.id)).toBe(false)
  })
})
