// Vignette YouTube automatique (src/hooks/videoAutoMedia.ts) avec le faux YouTube des tests (port de YOUTUBE_THUMB_BASE),
// aperçu animé (diaporama des 3 images de la vidéo, ffmpeg), tailles de repli, YouTube injoignable, aucun téléchargement
// pendant un décalage du Top 10 ; puis suppression des fiches
// vides abandonnées par la tâche horaire (src/lib/drafts-cleanup.ts : plus de 24 h, jamais publiées, sans titre).
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import type { CollectionSlug, Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteEmptyDrafts } from '@/lib/drafts-cleanup'
import { DRAFT_COLLECTIONS } from '@/lib/publication'
import { startYoutubeMock } from '../e2e/youtube-mock'
import { apiJson, editorToken, testPayload } from './helpers'

type Doc = { id: number } & Record<string, unknown>
type Media = { id: number; filename?: string | null; alt?: string | null; credit?: string | null; url?: string | null }

/** Port du faux YouTube : celui de YOUTUBE_THUMB_BASE (vitest.config.ts). */
const PORT = Number(new URL(process.env.YOUTUBE_THUMB_BASE || 'http://127.0.0.1:8773/vi').port)
const JPEG = readFileSync(path.resolve('public/og/hero-matin.jpg'))
const DAY = 24 * 3600_000

let payload: Payload
let editor: string
let image: number
const created: { collection: CollectionSlug; id: number }[] = []

const track = <T extends { id: number }>(collection: CollectionSlug, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

/** Identifiant YouTube (11 caractères) propre à chaque test. */
let n = 0
const videoId = (prefix = 'dr') => `${prefix}${Date.now().toString(36).slice(-5)}${String(++n).padStart(4, '0')}`.slice(0, 11).padEnd(11, 'x')

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  const filePath = path.resolve('public/og/hero-matin.jpg')
  image = track('media', await payload.create({ collection: 'media', data: { alt: 'Image choisie' }, filePath })).id
})

afterAll(async () => {
  vi.restoreAllMocks()
  for (const { collection, id } of created.reverse()) {
    await payload.delete({ collection, id, context: { disableRevalidate: true, top10Reorder: true } }).catch(() => undefined)
  }
})

/** Vidéo ou replay YouTube publié par l’API REST, sans image. */
async function youtube(collection: 'videos' | 'replays', youtubeUrl: string, extra: Record<string, unknown> = {}): Promise<Doc> {
  const body = { title: `Vidéo YouTube ${videoId('t')}`, source: { provider: 'youtube', youtubeUrl }, _status: 'published', ...extra }
  const res = await apiJson<{ doc: Doc }>(`/${collection}?depth=0`, { method: 'POST', token: editor, body })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return track(collection, res.body.doc)
}

/** Fichiers automatiques de la médiathèque nommés `base` (youtube-<id>, apercu-y<id>…). */
async function autoFiles(base: string): Promise<Media[]> {
  const { docs } = await payload.find({ collection: 'media', where: { filename: { like: base } }, depth: 0, pagination: false })
  for (const doc of docs) if (!created.some((c) => c.collection === 'media' && c.id === doc.id)) track('media', doc)
  return docs.filter((m) => new RegExp(`^${base}(-\\d+)?\\.\\w+$`).test(m.filename ?? ''))
}

/** Images de la médiathèque téléchargées pour une vidéo YouTube. */
const thumbnails = (id: string) => autoFiles(`youtube-${id}`)
/** Aperçus animés d'une vidéo YouTube. */
const previews = (id: string) => autoFiles(`apercu-y${id}`)

/** ffmpeg installé sur la machine des tests (sinon, pas d'aperçu animé : les vérifications d'aperçu sont sautées). */
const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0

const stop = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  })

describe('vignette YouTube automatique (faux YouTube)', () => {
  let server: Server

  beforeAll(async () => {
    server = await startYoutubeMock(PORT)
  })

  afterAll(async () => {
    await stop(server)
  })

  it('vidéo YouTube enregistrée sans image : l’image de la vidéo arrive dans la médiathèque et sert de vignette', async () => {
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    const [media] = await thumbnails(id)
    expect(media).toBeDefined()
    expect(video.thumbnail).toBe(media.id)
    expect(media.alt).toBe(video.title)
    expect(media.credit).toBe('YouTube')
    // visible du public avec la page de la vidéo
    const pub = await apiJson<{ thumbnail: Media }>(`/videos/${video.id}?depth=1`)
    expect(pub.body.thumbnail.id).toBe(media.id)
    expect(pub.body.thumbnail.url).toMatch(/\/api\/media\/file\/youtube-/)
  })

  it.runIf(hasFfmpeg)('aperçu animé : diaporama MP4 des 3 images de la vidéo, muet, 16:9, léger, crédité YouTube', async () => {
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    const [preview] = await previews(id)
    expect(preview).toBeDefined()
    expect(video.preview).toBe(preview.id)
    const full = await payload.findByID({ collection: 'media', id: preview.id, depth: 0 })
    expect(full).toMatchObject({ mimeType: 'video/mp4', credit: 'YouTube', filename: `apercu-y${id}.mp4` })
    expect(full.filesize).toBeLessThan(1024 * 1024)
    const probe = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration', '-of', 'json', path.resolve(process.env.MEDIA_DIR!, full.filename!)], { encoding: 'utf8' })
    const info = JSON.parse(probe.stdout) as { streams: { codec_type: string; codec_name: string; width: number; height: number; pix_fmt: string }[]; format: { duration: string } }
    expect(info.streams).toEqual([{ codec_type: 'video', codec_name: 'h264', width: 960, height: 540, pix_fmt: 'yuv420p' }])
    expect(Number(info.format.duration)).toBeGreaterThanOrEqual(4.5)
    expect(Number(info.format.duration)).toBeLessThanOrEqual(6)
  })

  it('replay YouTube : même règle', async () => {
    const id = videoId()
    const replay = await youtube('replays', `https://youtu.be/${id}`)
    const [media] = await thumbnails(id)
    expect(replay.thumbnail).toBe(media.id)
  })

  it('même vidéo en replay et dans « Vidéos » : une seule image (et un seul aperçu), partagée', async () => {
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    const replay = await youtube('replays', `https://www.youtube.com/live/${id}`)
    const media = await thumbnails(id)
    expect(media).toHaveLength(1)
    expect([video.thumbnail, replay.thumbnail]).toEqual([media[0].id, media[0].id])
    if (hasFfmpeg) {
      const anim = await previews(id)
      expect(anim).toHaveLength(1)
      expect([video.preview, replay.preview]).toEqual([anim[0].id, anim[0].id])
    }
  })

  it('liens YouTube courants (watch, youtu.be, shorts, embed, live) et identifiant seul', async () => {
    const urls = [
      (id: string) => `https://www.youtube.com/watch?feature=share&v=${id}`,
      (id: string) => `https://youtu.be/${id}?si=partage`,
      (id: string) => `https://www.youtube.com/shorts/${id}`,
      (id: string) => `https://www.youtube.com/embed/${id}`,
      (id: string) => id,
    ]
    for (const url of urls) {
      const id = videoId()
      const video = await youtube('videos', url(id))
      const [media] = await thumbnails(id)
      expect(video.thumbnail, url(id)).toBe(media?.id)
    }
  })

  it('image choisie par l’équipe : rien n’est téléchargé', async () => {
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`, { thumbnail: image })
    expect(video.thumbnail).toBe(image)
    expect(await thumbnails(id)).toHaveLength(0)
  })

  it('lien YouTube qui ne désigne pas une vidéo : enregistré sans image', async () => {
    const video = await youtube('videos', 'https://www.youtube.com/@swattertv')
    expect(video.thumbnail ?? null).toBeNull()
  })

  it('vignette retirée puis remise à vide : l’image déjà téléchargée est reprise, pas téléchargée deux fois', async () => {
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    const res = await apiJson<{ doc: Doc }>(`/videos/${video.id}?depth=0`, { method: 'PATCH', token: editor, body: { thumbnail: null } })
    expect(res.status).toBe(200)
    expect(res.body.doc.thumbnail).toBe(video.thumbnail)
    expect(await thumbnails(id)).toHaveLength(1)
  })

  it('l’image d’une autre vidéo dont l’identifiant ne diffère que par un « _ » n’est pas reprise', async () => {
    const id = `${videoId('u').slice(0, 5)}_${videoId('v').slice(0, 5)}`
    const other = id.replace('_', 'Q')
    const file = { data: JPEG, mimetype: 'image/jpeg', name: `youtube-${other}.jpg`, size: JPEG.length }
    const decoy = track('media', await payload.create({ collection: 'media', data: { alt: 'Autre vidéo' }, file }))
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    expect(video.thumbnail).not.toBe(decoy.id)
    const [own] = await thumbnails(id)
    expect(video.thumbnail).toBe(own.id)
  })
})

describe('vignette YouTube : tailles de repli', () => {
  let server: Server | undefined
  const requests: string[] = []

  afterEach(async () => {
    if (server) await stop(server)
    server = undefined
    requests.length = 0
  })

  /** Faux serveur d’images : `files` donne, pour chaque nom de fichier, l’image servie (absente : 404). */
  async function serve(files: Record<string, Buffer>) {
    server = createServer((req, res) => {
      const name = (req.url ?? '').split('/').pop() ?? ''
      requests.push(name)
      const file = files[name]
      res.writeHead(file ? 200 : 404, { 'content-type': 'image/jpeg' })
      res.end(file)
    })
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(PORT, '127.0.0.1', () => resolve())
    })
  }

  it('sans « maxresdefault » (vidéo non HD) : « sddefault »', async () => {
    await serve({ 'sddefault.jpg': JPEG })
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    // (les images de l'aperçu, maxres1.jpg…, sont demandées à part)
    expect(requests.filter((name) => name.includes('default'))).toEqual(['maxresdefault.jpg', 'sddefault.jpg'])
    expect(video.thumbnail).toBe((await thumbnails(id))[0].id)
  })

  it('image minuscule (l’image grise « indisponible » de YouTube) ignorée : taille suivante', async () => {
    await serve({ 'maxresdefault.jpg': JPEG.subarray(0, 1000), 'hqdefault.jpg': JPEG })
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    expect(requests.filter((name) => name.includes('default'))).toEqual(['maxresdefault.jpg', 'sddefault.jpg', 'hqdefault.jpg'])
    expect(video.thumbnail).toBe((await thumbnails(id))[0].id)
  })

  it('aucune image utilisable : enregistrée sans image, avec un avertissement', async () => {
    await serve({ 'maxresdefault.jpg': JPEG.subarray(0, 500), 'sddefault.jpg': JPEG.subarray(0, 500) })
    const warn = vi.spyOn(payload.logger, 'warn').mockImplementation(() => undefined)
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    expect(video.thumbnail ?? null).toBeNull()
    expect(warn.mock.calls.some(([message]) => String(message).includes(`Image YouTube introuvable pour la vidéo ${id}`))).toBe(true)
    warn.mockRestore()
  })
})

describe('vignette YouTube : YouTube injoignable', () => {
  it('vidéo enregistrée sans image (visuel de repli sur le site) et avertissement dans le journal', async () => {
    const warn = vi.spyOn(payload.logger, 'warn').mockImplementation(() => undefined)
    const id = videoId()
    const video = await youtube('videos', `https://www.youtube.com/watch?v=${id}`)
    expect(video._status).toBe('published')
    expect(video.thumbnail ?? null).toBeNull()
    expect(warn.mock.calls.some(([message]) => String(message).includes(id))).toBe(true)
    warn.mockRestore()
    expect((await apiJson(`/videos/${video.id}`)).status).toBe(200)
  })

  it('décalage dans le Top 10 : aucun téléchargement pour les vidéos décalées', async () => {
    // vidéos classées par d’autres tests : sorties du classement le temps du test (écriture directe, sans décalage)
    const { docs } = await payload.find({ collection: 'videos', where: { top10Rank: { exists: true } }, pagination: false, depth: 0 })
    const foreign = docs.flatMap((d) => (typeof d.top10Rank === 'number' ? [{ id: d.id, rank: d.top10Rank }] : []))
    for (const f of foreign) await payload.db.updateOne({ collection: 'videos', id: f.id, data: { top10Rank: null } })
    const mine: number[] = []
    let server: Server | undefined
    const warn = vi.spyOn(payload.logger, 'warn').mockImplementation(() => undefined)
    try {
      // vidéo YouTube restée sans image (YouTube injoignable à son enregistrement), classée 10e
      const id = videoId()
      const shifted = await youtube('videos', `https://www.youtube.com/watch?v=${id}`, { top10Rank: 10 })
      mine.push(shifted.id)
      expect(shifted.thumbnail ?? null).toBeNull()
      // YouTube de nouveau joignable : une autre vidéo prend la 10e place, la première sort du classement
      server = await startYoutubeMock(PORT)
      const next = videoId()
      mine.push((await youtube('videos', `https://www.youtube.com/watch?v=${next}`, { top10Rank: 10 })).id)
      expect(await thumbnails(next)).toHaveLength(1)
      const after = await payload.findByID({ collection: 'videos', id: shifted.id, depth: 0 })
      expect(after.top10Rank ?? null).toBeNull()
      expect(after.thumbnail ?? null).toBeNull()
      expect(await thumbnails(id)).toHaveLength(0)
    } finally {
      warn.mockRestore()
      if (server) await stop(server)
      for (const id of mine) await payload.db.updateOne({ collection: 'videos', id, data: { top10Rank: null } })
      for (const f of foreign) await payload.db.updateOne({ collection: 'videos', id: f.id, data: { top10Rank: f.rank } })
    }
  })
})

describe('fiches vides abandonnées (tâche horaire)', () => {
  /** Fiche ouverte avec « Ajouter » puis quittée sans rien écrire : brouillon vide, jamais publié. */
  const empty = async (collection: (typeof DRAFT_COLLECTIONS)[number], data: Record<string, unknown> = {}) =>
    track(collection, (await payload.create({ collection, data: data as never, draft: true, context: { disableRevalidate: true } })) as unknown as Doc)

  const exists = async (collection: CollectionSlug, id: number) => (await payload.count({ collection, where: { id: { equals: id } } })).totalDocs === 1

  /** Lance le ménage « plus tard » ; renvoie le nombre de fiches supprimées, ou l’erreur. */
  const cleanup = (inMs: number) => deleteEmptyDrafts(payload, Date.now() + inMs).then((deleted) => ({ deleted }), (error: Error) => ({ error: error.message }))

  it('la tâche se termine sans erreur et compte les fiches supprimées, dans toutes les rubriques', async () => {
    for (const collection of DRAFT_COLLECTIONS) await empty(collection)
    const result = await cleanup(25 * 3600_000)
    expect(result).not.toHaveProperty('error')
    expect((result as { deleted: number }).deleted).toBeGreaterThanOrEqual(DRAFT_COLLECTIONS.length)
  })

  for (const collection of DRAFT_COLLECTIONS) {
    it(`${collection} : fiche vide de plus de 24 h supprimée`, async () => {
      const doc = await empty(collection)
      await cleanup(DAY + 60_000)
      expect(await exists(collection, doc.id)).toBe(false)
    })
  }

  it('titre effacé (chaîne vide) : supprimée aussi', async () => {
    const doc = await empty('articles', { title: '' })
    await cleanup(DAY + 60_000)
    expect(await exists('articles', doc.id)).toBe(false)
  })

  it('fiche vide de moins de 24 h : gardée', async () => {
    const doc = await empty('videos')
    await cleanup(DAY - 60_000)
    expect(await exists('videos', doc.id)).toBe(true)
  })

  it('brouillon jamais publié mais déjà titré (enregistrement automatique) : gardé', async () => {
    const doc = await empty('pages')
    await payload.update({ collection: 'pages', id: doc.id, data: { title: 'Le groupe' }, draft: true, autosave: true, context: { disableRevalidate: true } })
    await cleanup(2 * DAY)
    expect(await exists('pages', doc.id)).toBe(true)
  })

  it('fiche publiée une fois, retirée du site puis vidée de son titre : gardée', async () => {
    const doc = track('events', await payload.create({
      collection: 'events',
      data: { title: 'Fête du village', startDate: '2031-07-14T18:00:00.000Z', city: 'Thyez', department: 'haute-savoie', _status: 'published' },
      context: { disableRevalidate: true },
    }))
    await payload.update({ collection: 'events', id: doc.id, data: { _status: 'draft' }, context: { disableRevalidate: true } })
    await payload.update({ collection: 'events', id: doc.id, data: { title: '' }, draft: true, autosave: true, context: { disableRevalidate: true } })
    await cleanup(2 * DAY)
    expect(await exists('events', doc.id)).toBe(true)
  })

  it('contenu en ligne dont le brouillon en cours a perdu son titre : gardé', async () => {
    const data = { title: 'Info en ligne', department: 'cantal' as const, publishedAt: '2025-06-01T08:00:00.000Z', _status: 'published' as const }
    const doc = track('articles', await payload.create({ collection: 'articles', data, context: { disableRevalidate: true } }))
    await payload.update({ collection: 'articles', id: doc.id, data: { title: '' }, draft: true, autosave: true, context: { disableRevalidate: true } })
    await cleanup(2 * DAY)
    expect(await exists('articles', doc.id)).toBe(true)
    expect((await apiJson<Doc>(`/articles/${doc.id}`)).body.title).toBe('Info en ligne')
  })
})
