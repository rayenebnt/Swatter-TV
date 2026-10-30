// Couverture et aperçu animé tirés des vidéos (src/hooks/videoAutoMedia.ts) avec le vrai ffmpeg (sauté s'il est absent) :
// fichier envoyé (clip de démonstration), aucun doublon aux enregistrements suivants, image choisie gardée, changement de
// source, vidéo verticale cadrée en 16:9, lien direct MP4 et flux HLS servis par un petit serveur local, ffmpeg introuvable
// (enregistrement sans erreur) ; envoi d'une vidéo de plus de 20 Mo par l'API REST (multipart, fichier temporaire).
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import config from '@payload-config'
import { handleEndpoints, type CollectionSlug, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Media } from '@/payload-types'
import { apiJson, editorToken, SITE, testPayload, unique } from './helpers'

type Doc = { id: number; thumbnail?: number | null; preview?: number | null } & Record<string, unknown>

const ffmpegOk = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
const CLIP = path.resolve('seed/assets/videos/direct-mont-blanc.mp4')
const work = mkdtempSync(path.join(os.tmpdir(), 'couverture-apercu-'))

let payload: Payload
let editor: string
let image: number
let server: Server | undefined
let base = ''
const created: { collection: CollectionSlug; id: number }[] = []

const track = <T extends { id: number }>(collection: CollectionSlug, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

/** Vidéo ou replay publié par l'API REST (comme l'administration), sans image sauf si `extra` en donne une. */
async function post(collection: 'videos' | 'replays', source: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<Doc> {
  const res = await apiJson<{ doc: Doc }>(`/${collection}?depth=0`, { method: 'POST', token: editor, body: { title: unique('Vidéo tirée'), source, _status: 'published', ...extra } })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return track(collection, res.body.doc)
}

async function patch(collection: 'videos' | 'replays', id: number, body: Record<string, unknown>, query = ''): Promise<Doc> {
  const res = await apiJson<{ doc: Doc }>(`/${collection}/${id}?depth=0${query}`, { method: 'PATCH', token: editor, body })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.doc
}

const media = (id: number | null | undefined) => payload.findByID({ collection: 'media', id: id as number, depth: 0 })

/** Fichiers automatiques nommés `base` (doublons « -1 » compris). */
async function autoFiles(name: string): Promise<Media[]> {
  const { docs } = await payload.find({ collection: 'media', where: { filename: { like: name } }, depth: 0, pagination: false })
  return docs.filter((m) => new RegExp(`^${name}(-\\d+)?\\.\\w+$`).test(m.filename ?? ''))
}

/** Pistes et durée d'un fichier de la médiathèque (ffprobe). */
function probe(filename: string) {
  const out = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration', '-of', 'json', path.resolve(process.env.MEDIA_DIR!, filename)], { encoding: 'utf8' })
  return JSON.parse(out.stdout) as { streams: { codec_type: string; codec_name: string; width: number; height: number; pix_fmt: string }[]; format: { duration: string } }
}

/** Vidéo envoyée dans la médiathèque (fichier du disque). */
const upload = async (filePath: string, data: Record<string, unknown> = {}) =>
  track('media', await payload.create({ collection: 'media', data: { alt: 'Vidéo des tests', ...data }, filePath })).id

const ffmpeg = (args: string[]) => {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr)
}

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  image = track('media', await payload.create({ collection: 'media', data: { alt: 'Image choisie' }, filePath: path.resolve('public/og/hero-matin.jpg') })).id
})

afterAll(async () => {
  for (const { collection, id } of created.reverse()) {
    await payload.delete({ collection, id, context: { disableRevalidate: true, top10Reorder: true } }).catch(() => undefined)
  }
  // fichiers automatiques créés par ces tests
  for (const prefix of ['video-m', 'video-u', 'apercu-m', 'apercu-u']) {
    const { docs } = await payload.find({ collection: 'media', where: { filename: { like: prefix } }, depth: 0, pagination: false })
    for (const doc of docs) await payload.delete({ collection: 'media', id: doc.id }).catch(() => undefined)
  }
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  rmSync(work, { recursive: true, force: true })
})

describe.runIf(ffmpegOk)('fichier envoyé dans la médiathèque (ffmpeg)', () => {
  let clip: number
  let auto: Doc
  let manual: Doc

  beforeAll(async () => {
    clip = await upload(CLIP, { credit: 'Swatter TV Info' })
  })

  it('couverture video-m<n°> (JPEG 16:9 devenu WebP) et aperçu apercu-m<n°> (MP4 H.264 muet, 960×540, 5 s, < 1 Mo)', async () => {
    auto = await post('videos', { provider: 'upload', file: clip })
    const cover = await media(auto.thumbnail)
    expect(cover.filename).toMatch(new RegExp(`^video-m${clip}(-\\d+)?\\.webp$`))
    expect(cover).toMatchObject({ width: 1280, height: 720, credit: 'Swatter TV Info', alt: auto.title })
    const preview = await media(auto.preview)
    expect(preview).toMatchObject({ filename: `apercu-m${clip}.mp4`, mimeType: 'video/mp4', credit: 'Swatter TV Info' })
    expect(preview.filesize).toBeLessThan(1024 * 1024)
    const info = probe(preview.filename!)
    expect(info.streams).toEqual([{ codec_type: 'video', codec_name: 'h264', width: 960, height: 540, pix_fmt: 'yuv420p' }])
    expect(Number(info.format.duration)).toBeCloseTo(5, 0)
    // en ligne avec la fiche
    const pub = await apiJson<{ thumbnail: Media; preview: Media }>(`/videos/${auto.id}?depth=1`)
    expect(pub.body.preview.url).toMatch(new RegExp(`/api/media/file/apercu-m${clip}\\.mp4$`))
  })

  it('enregistrements suivants (modification, enregistrement automatique du brouillon) : mêmes fichiers, aucun doublon', async () => {
    const again = await patch('videos', auto.id, { title: unique('Titre changé') })
    const draft = await patch('videos', auto.id, { title: unique('Brouillon') }, '&draft=true&autosave=true')
    for (const doc of [again, draft]) expect([doc.thumbnail, doc.preview]).toEqual([auto.thumbnail, auto.preview])
    // un replay du même fichier reprend les mêmes
    const replay = await post('replays', { provider: 'upload', file: clip })
    expect([replay.thumbnail, replay.preview]).toEqual([auto.thumbnail, auto.preview])
    expect(await autoFiles(`video-m${clip}`)).toHaveLength(1)
    expect(await autoFiles(`apercu-m${clip}`)).toHaveLength(1)
  })

  it('image choisie par l’équipe : gardée (l’aperçu est quand même posé)', async () => {
    manual = await post('videos', { provider: 'upload', file: clip }, { thumbnail: image })
    expect(manual.thumbnail).toBe(image)
    expect(manual.preview).toBe(auto.preview)
  })

  it('autre vidéo : couverture automatique remplacée, image choisie gardée, aperçu refait ; vidéo verticale cadrée en 16:9', async () => {
    const vertical = path.join(work, 'verticale.mp4')
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=25', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vertical])
    const other = await upload(vertical)
    const source = { provider: 'upload', file: other }
    const changed = await patch('videos', auto.id, { source })
    const cover = await media(changed.thumbnail)
    expect(cover.filename).toMatch(new RegExp(`^video-m${other}(-\\d+)?\\.webp$`))
    // 1280 de haut : couverture 1920×1080, vidéo entière au centre sur fond flouté
    expect([cover.width, cover.height]).toEqual([1920, 1080])
    expect((await media(changed.preview)).filename).toBe(`apercu-m${other}.mp4`)
    const kept = await patch('videos', manual.id, { source })
    expect(kept.thumbnail).toBe(image)
    expect(kept.preview).toBe(changed.preview)
  })

  it('fichier remplacé dans le même média : couverture et aperçu de l’ancien fichier supprimés ; la fiche, enregistrée avec les anciens numéros (formulaire resté ouvert), les retrouve tirés du nouveau fichier', async () => {
    const first = path.join(work, 'premier.mp4')
    const second = path.join(work, 'second.mp4')
    ffmpeg(['-i', CLIP, '-c', 'copy', first])
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', second])
    const file = await upload(first)
    const doc = await post('videos', { provider: 'upload', file })
    const [oldCover, oldPreview] = [doc.thumbnail as number, doc.preview as number]
    expect((await media(oldCover)).filename).toMatch(new RegExp(`^video-m${file}(-\\d+)?\\.webp$`))

    await payload.update({ collection: 'media', id: file, data: {}, filePath: second })
    for (const id of [oldCover, oldPreview]) expect(await payload.findByID({ collection: 'media', id, depth: 0, disableErrors: true }), `média ${id}`).toBeNull()
    const stored = await payload.findByID({ collection: 'videos', id: doc.id, depth: 0, draft: true })
    expect([stored.thumbnail ?? null, stored.preview ?? null]).toEqual([null, null])

    const saved = await patch('videos', doc.id, { title: unique('Nouveau montage'), thumbnail: oldCover, preview: oldPreview })
    expect(saved.thumbnail).not.toBe(oldCover)
    expect((await media(saved.thumbnail)).filename).toMatch(new RegExp(`^video-m${file}(-\\d+)?\\.webp$`))
    expect((await media(saved.preview)).filename).toMatch(new RegExp(`^apercu-m${file}(-\\d+)?\\.mp4$`))
    expect(saved.preview).not.toBe(oldPreview)
  })

  it('ffmpeg introuvable (FFMPEG_PATH, FFPROBE_PATH) : enregistrement sans erreur, sans couverture ni aperçu, signalé dans le journal', async () => {
    const copy = path.join(work, 'copie.mp4')
    ffmpeg(['-i', CLIP, '-c', 'copy', copy])
    const other = await upload(copy)
    const warn = vi.spyOn(payload.logger, 'warn').mockImplementation(() => undefined)
    vi.stubEnv('FFMPEG_PATH', path.join(work, 'inexistant', 'ffmpeg'))
    vi.stubEnv('FFPROBE_PATH', path.join(work, 'inexistant', 'ffprobe'))
    try {
      const doc = await post('videos', { provider: 'upload', file: other })
      expect(doc._status).toBe('published')
      expect([doc.thumbnail ?? null, doc.preview ?? null]).toEqual([null, null])
      await patch('videos', doc.id, { title: unique('Encore') })
      expect(warn.mock.calls.filter(([message]) => String(message).includes('introuvable')).length).toBe(1)
    } finally {
      vi.unstubAllEnvs()
      warn.mockRestore()
    }
  })
})

describe.runIf(ffmpegOk)('lien direct : MP4 et flux HLS servis par un petit serveur local (ffmpeg)', () => {
  beforeAll(async () => {
    const hls = path.join(work, 'hls')
    mkdirSync(hls, { recursive: true })
    ffmpeg(['-i', CLIP, '-c', 'copy', '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(hls, 'segment%02d.ts'), path.join(hls, 'index.m3u8')])
    // serveur de fichiers avec requêtes partielles (Range), comme un CDN
    server = createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
      const file = name === '/clip.mp4' ? CLIP : name.startsWith('/hls/') ? path.join(hls, path.basename(name)) : ''
      if (!file || !existsSync(file)) {
        res.writeHead(404)
        res.end()
        return
      }
      const size = statSync(file).size
      const type = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : file.endsWith('.ts') ? 'video/mp2t' : 'video/mp4'
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
      if (range) {
        const start = range[1] ? Number(range[1]) : 0
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
        res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
        createReadStream(file, { start, end }).pipe(res)
      } else {
        res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size })
        createReadStream(file).pipe(res)
      }
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  for (const [label, file] of [
    ['MP4', '/clip.mp4'],
    ['HLS (.m3u8)', '/hls/index.m3u8'],
  ] as const) {
    it(`${label} : couverture video-u<empreinte> et aperçu apercu-u<empreinte>`, async () => {
      const doc = await post('replays', { provider: 'url', url: `${base}${file}` })
      const cover = await media(doc.thumbnail)
      expect(cover.filename).toMatch(/^video-u[0-9a-f]{12}(-\d+)?\.webp$/)
      expect(cover.credit ?? null).toBeNull()
      const preview = await media(doc.preview)
      expect(preview.filename).toMatch(/^apercu-u[0-9a-f]{12}\.mp4$/)
      expect(preview.filename!.slice(7, 20)).toBe(cover.filename!.slice(6, 19))
      expect(probe(preview.filename!).streams[0]).toMatchObject({ codec_name: 'h264', width: 960, height: 540 })
    })
  }
})

describe('envoi de fichiers lourds', () => {
  it('limites configurées : 500 Mo par fichier, écrits dans un fichier temporaire (jamais entièrement en mémoire)', () => {
    expect(config).toBeDefined()
    expect(payload.config.upload).toMatchObject({ useTempFiles: true, limits: { fileSize: 500 * 1024 * 1024 } })
    expect(payload.config.upload.requestSizeLimit).toBeGreaterThan(500 * 1024 * 1024)
  })

  it.runIf(ffmpegOk)('vidéo de plus de 20 Mo envoyée par l’API REST (multipart) : acceptée, copiée telle quelle, fichier temporaire supprimé', async () => {
    const big = path.join(work, 'lourde.mp4')
    // bruit sans perte : incompressible, plus de 20 Mo en 3 s
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=25,noise=alls=80:allf=t', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv420p', big])
    const size = statSync(big).size
    expect(size).toBeGreaterThan(20 * 1024 * 1024)
    const temp = path.join(os.tmpdir(), 'swatter-envois')
    const tempBefore = existsSync(temp) ? readdirSync(temp) : []
    const form = new FormData()
    form.append('file', new Blob([readFileSync(big)], { type: 'video/mp4' }), 'lourde.mp4')
    form.append('_payload', JSON.stringify({ alt: 'Vidéo lourde' }))
    const request = new Request(`${SITE}/api/media`, { method: 'POST', headers: { authorization: `JWT ${editor}`, origin: SITE }, body: form })
    const response = await handleEndpoints({ config, request })
    const body = (await response.json()) as { doc?: Media; errors?: unknown }
    expect(response.status, JSON.stringify(body)).toBe(201)
    const doc = track('media', body.doc as Media)
    expect(doc).toMatchObject({ mimeType: 'video/mp4', filesize: size })
    expect(statSync(path.resolve(process.env.MEDIA_DIR!, doc.filename!)).size).toBe(size)
    expect(readdirSync(temp).filter((f) => !tempBefore.includes(f))).toEqual([])
  })
})
