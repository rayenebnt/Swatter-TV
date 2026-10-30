// Couverture et aperçu animé automatiques (src/hooks/videoAutoMedia.ts), ffmpeg simulé (src/hooks/ffmpeg.ts) : clés et noms
// des fichiers automatiques, chaque source (fichier envoyé, lien direct, YouTube, Bunny), réutilisation, changement de
// source (image automatique remplacée, image choisie gardée), échecs sans erreur, pas de nouvel essai pendant 10 min,
// ffmpeg absent, enregistrements simultanés.
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CollectionBeforeValidateHook } from 'payload'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ffmpegReady, probeVideo, slideshow, videoClip, videoCover } from '@/hooks/ffmpeg'
import { TOP10_REORDER } from '@/hooks/top10'
import { autoKey, coverBase, hasBase, isAutoFilename, previewBase, remoteUrl, resetVideoAutoMedia, RETRY_AFTER_MS, videoAutoMedia } from '@/hooks/videoAutoMedia'

vi.mock('@/hooks/ffmpeg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/ffmpeg')>()),
  ffmpegReady: vi.fn(async () => true),
  probeVideo: vi.fn(async () => ({ duration: 60, width: 1280, height: 720 })),
  videoCover: vi.fn(async () => Buffer.from('couverture')),
  videoClip: vi.fn(async () => Buffer.from('extrait')),
  slideshow: vi.fn(async () => Buffer.from('diaporama')),
}))

const YT = 'dQw4w9WgXcQ'
const THUMBS = 'http://127.0.0.1:9/vi'
const sha = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 12)

type Media = { id: number; filename: string; mimeType?: string; url?: string | null; credit?: string | null; alt?: string }
type Where = { or: { filename: { like: string } }[] }
type Created = { collection: string; data: { alt: string; credit?: string }; file: { data: Buffer; mimetype: string; name: string; size: number }; req: unknown }
const like = (filename: string, value: string) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.'), 'i').test(filename)

/** Fausse requête : médiathèque en mémoire (« like » en ILIKE, findByID), créations ajoutées à la médiathèque. */
function fakeReq(library: Media[] = []) {
  let next = 100
  const req = {
    payload: {
      find: vi.fn(async ({ where }: { where: Where }) => ({ docs: library.filter((m) => where.or.some((w) => like(m.filename, w.filename.like))) })),
      findByID: vi.fn(async ({ id }: { id: number }) => library.find((m) => m.id === Number(id)) ?? null),
      create: vi.fn(async ({ data, file }: Created) => {
        const doc = { id: next++, filename: file.name, mimeType: file.mimetype, ...data }
        library.push(doc)
        return doc
      }),
      logger: { warn: vi.fn() },
    },
  }
  return req
}
type Req = ReturnType<typeof fakeReq>
type HookArgs = Parameters<CollectionBeforeValidateHook>[0]
const run = (req: Req, data: Record<string, unknown> | undefined, originalDoc?: Record<string, unknown>, context: Record<string, unknown> = {}) =>
  videoAutoMedia({ data, originalDoc, req, context, operation: originalDoc ? 'update' : 'create', collection: { slug: 'videos' } } as unknown as HookArgs) as Promise<Record<string, unknown>>
const created = (req: Req) => req.payload.create.mock.calls.map(([args]) => args as unknown as Created)
const warnings = (req: Req) => req.payload.logger.warn.mock.calls.map(([message]) => String(message))

let responses: Record<string, () => Response>
const fetchMock = vi.fn(async (url: string | URL | Request) => (responses[String(url)] ?? (() => new Response('introuvable', { status: 404 })))())
const image = (bytes = 50_000) => () => new Response(new Uint8Array(bytes), { status: 200 })

const mediaDir = mkdtempSync(path.join(os.tmpdir(), 'medias-'))
writeFileSync(path.join(mediaDir, 'balade.mp4'), 'vidéo')
const clip = (over: Partial<Media> = {}): Media => ({ id: 12, filename: 'balade.mp4', mimeType: 'video/mp4', url: '/api/media/file/balade.mp4', credit: 'Swatter TV Info', ...over })

beforeEach(() => {
  responses = {}
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('YOUTUBE_THUMB_BASE', THUMBS)
  vi.stubEnv('MEDIA_DIR', mediaDir)
  vi.stubEnv('BUNNY_CDN_HOST', '')
  resetVideoAutoMedia()
  vi.mocked(ffmpegReady).mockClear().mockResolvedValue(true)
  vi.mocked(probeVideo).mockClear().mockResolvedValue({ duration: 60, width: 1280, height: 720 })
  vi.mocked(videoCover).mockReset().mockResolvedValue(Buffer.from('couverture'))
  vi.mocked(videoClip).mockReset().mockResolvedValue(Buffer.from('extrait'))
  vi.mocked(slideshow).mockReset().mockResolvedValue(Buffer.from('diaporama'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

afterAll(() => {
  rmSync(mediaDir, { recursive: true, force: true })
})

describe('clés et noms des fichiers automatiques', () => {
  it('clé de la vidéo selon la source', () => {
    expect(autoKey({ provider: 'youtube', youtubeUrl: ` https://youtu.be/${YT}?si=x ` })).toBe(`y${YT}`)
    expect(autoKey({ provider: 'youtube', youtubeUrl: 'https://www.youtube.com/@swattertv' })).toBeNull()
    for (const file of [12, '12', { id: 12, url: '/api/media/file/a.mp4' }]) expect(autoKey({ provider: 'upload', file })).toBe('m12')
    for (const file of [null, undefined, '', { url: 'x' }, 'abc']) expect(autoKey({ provider: 'upload', file })).toBeNull()
    expect(autoKey({ provider: 'url', url: ' https://cdn.exemple.fr/clip.mp4 ' })).toBe(`u${sha('https://cdn.exemple.fr/clip.mp4')}`)
    expect(autoKey({ provider: 'url', url: 'https://cdn.exemple.fr/live.m3u8' })).toMatch(/^u[0-9a-f]{12}$/)
    for (const url of ['ftp://exemple.fr/a.mp4', 'file:///etc/passwd', 'javascript:alert(1)', '/api/media/file/a.mp4', '', null]) {
      expect(autoKey({ provider: 'url', url }), String(url)).toBeNull()
    }
    // Bunny : seulement si l'hôte de la zone de diffusion est connu
    expect(autoKey({ provider: 'bunny', bunnyVideoId: 'abc-123' })).toBeNull()
    vi.stubEnv('BUNNY_CDN_HOST', 'vz-test.b-cdn.net')
    expect(autoKey({ provider: 'bunny', bunnyVideoId: ' abc-123 ' })).toBe('babc-123')
    expect(autoKey({ provider: 'bunny', bunnyVideoId: '../abc' })).toBeNull()
    expect(autoKey({ provider: 'twitch' })).toBeNull()
    expect(autoKey(null)).toBeNull()
  })

  it('noms : youtube-<id>, video-<clé>, bunny-<id> pour la couverture ; apercu-<clé> pour l’aperçu (aucun pour Bunny)', () => {
    expect(coverBase(`y${YT}`)).toBe(`youtube-${YT}`)
    expect(coverBase('m12')).toBe('video-m12')
    expect(coverBase('u0123456789ab')).toBe('video-u0123456789ab')
    expect(coverBase('babc-123')).toBe('bunny-abc-123')
    expect(previewBase(`y${YT}`)).toBe(`apercu-y${YT}`)
    expect(previewBase('m12')).toBe('apercu-m12')
    expect(previewBase('babc-123')).toBeNull()
  })

  it('fichiers automatiques reconnus à leur nom (doublons « -1 » compris), jamais une image envoyée par l’équipe', () => {
    for (const name of [`youtube-${YT}.webp`, `youtube-${YT}-2.jpg`, 'video-m12.webp', 'video-u0123456789ab.webp', 'bunny-abc-123.webp', 'apercu-m12.mp4', `apercu-y${YT}.mp4`, 'apercu-u0123456789ab-1.mp4']) {
      expect(isAutoFilename(name), name).toBe(true)
    }
    for (const name of ['lac-annecy.webp', 'video-m12-copie.webp', 'ma-video-m12.webp', 'video-12.webp', 'apercu-x12.mp4', 'youtube-court.webp', 'video-uABC.webp']) {
      expect(isAutoFilename(name), name).toBe(false)
    }
    expect(hasBase('video-m1.webp', 'video-m1')).toBe(true)
    expect(hasBase('video-m1-3.webp', 'video-m1')).toBe(true)
    expect(hasBase('video-m10.webp', 'video-m1')).toBe(false)
    expect(remoteUrl(' https://exemple.fr/a b.mp4 ')).toBe('https://exemple.fr/a%20b.mp4')
  })
})

describe('fichier envoyé dans la médiathèque', () => {
  const upload = (over: Record<string, unknown> = {}) => ({ title: 'Balade au Semnoz', source: { provider: 'upload', file: 12 }, ...over })

  it('couverture video-m<n°>.jpg et aperçu apercu-m<n°>.mp4 tirés du fichier du disque (lu une fois par ffprobe), crédit repris', async () => {
    const req = fakeReq([clip()])
    const data = upload()
    expect(await run(req, data)).toEqual({ ...data, thumbnail: 100, preview: 101 })
    const input = { path: path.join(mediaDir, 'balade.mp4') }
    expect(videoCover).toHaveBeenCalledWith(input, { duration: 60, width: 1280, height: 720 })
    expect(videoClip).toHaveBeenCalledWith(input, { duration: 60, width: 1280, height: 720 })
    expect(probeVideo).toHaveBeenCalledTimes(1)
    const [cover, preview] = created(req)
    expect(cover).toMatchObject({ collection: 'media', data: { alt: 'Balade au Semnoz', credit: 'Swatter TV Info' }, file: { name: 'video-m12.jpg', mimetype: 'image/jpeg', size: 10 } })
    expect(preview).toMatchObject({ data: { alt: 'Aperçu animé : Balade au Semnoz', credit: 'Swatter TV Info' }, file: { name: 'apercu-m12.mp4', mimetype: 'video/mp4' } })
    expect(cover.req).toBe(req)
  })

  it('fichier absent du disque : lu par son adresse (sur le serveur local si c’est une adresse du site, sinon telle quelle)', async () => {
    vi.stubEnv('PORT', '4123')
    const elsewhere = (url: string) => {
      const req = fakeReq([clip({ filename: 'ailleurs.mp4', url })])
      return Object.assign(req, { payload: { ...req.payload, config: { serverURL: 'https://www.swatter-tv.fr/' } } })
    }
    for (const url of ['/api/media/file/ailleurs.mp4', 'https://www.swatter-tv.fr/api/media/file/ailleurs.mp4']) {
      resetVideoAutoMedia()
      vi.mocked(videoCover).mockClear()
      await run(elsewhere(url), upload())
      expect(vi.mocked(videoCover).mock.calls[0][0], url).toEqual({ url: 'http://127.0.0.1:4123/api/media/file/ailleurs.mp4' })
    }
    // stockage S3 servi directement par le seau
    resetVideoAutoMedia()
    vi.mocked(videoCover).mockClear()
    await run(elsewhere('https://seau.s3.exemple.fr/ailleurs.mp4'), upload())
    expect(vi.mocked(videoCover).mock.calls[0][0]).toEqual({ url: 'https://seau.s3.exemple.fr/ailleurs.mp4' })
  })

  it('enregistrement suivant (enregistrement automatique) : rien à refaire, aucune requête', async () => {
    const req = fakeReq([clip()])
    const data = { title: 'Balade au Semnoz', thumbnail: 100, preview: 101 }
    expect(await run(req, data, { source: { provider: 'upload', file: 12 }, thumbnail: 100, preview: 101 })).toBe(data)
    expect(req.payload.find).not.toHaveBeenCalled()
    expect(videoCover).not.toHaveBeenCalled()
  })

  it('fichiers déjà dans la médiathèque (même vidéo dans « Vidéos » et en replay…) : repris, sans ffmpeg', async () => {
    const req = fakeReq([clip(), { id: 40, filename: 'video-m12.webp' }, { id: 41, filename: 'apercu-m12-1.mp4' }, { id: 42, filename: 'video-m120.webp' }])
    expect(await run(req, upload())).toMatchObject({ thumbnail: 40, preview: 41 })
    expect(videoCover).not.toHaveBeenCalled()
    expect(videoClip).not.toHaveBeenCalled()
    expect(req.payload.create).not.toHaveBeenCalled()
  })

  it('fichier qui n’est pas une vidéo, ou introuvable : enregistré sans couverture ni aperçu, avertissement', async () => {
    const req = fakeReq([clip({ mimeType: 'image/jpeg' })])
    const data = upload()
    expect(await run(req, data)).toBe(data)
    expect(warnings(req).some((w) => w.includes('n’est pas une vidéo'))).toBe(true)
    resetVideoAutoMedia()
    const missing = fakeReq()
    expect(await run(missing, data)).toBe(data)
    expect(warnings(missing).some((w) => w.includes('introuvable dans la médiathèque'))).toBe(true)
  })
})

describe('lien direct (MP4 ou flux HLS)', () => {
  it('lu à son adresse, fichiers video-u<empreinte> et apercu-u<empreinte>, sans crédit', async () => {
    const url = 'https://cdn.exemple.fr/live/playlist.m3u8'
    const req = fakeReq()
    const result = await run(req, { title: 'Le direct', source: { provider: 'url', url } })
    expect(result).toMatchObject({ thumbnail: 100, preview: 101 })
    expect(videoCover).toHaveBeenCalledWith({ url }, expect.anything())
    expect(created(req).map((c) => c.file.name)).toEqual([`video-u${sha(url)}.jpg`, `apercu-u${sha(url)}.mp4`])
    expect(created(req)[0].data).toEqual({ alt: 'Le direct' })
  })

  it('autre protocole que http(s) : rien n’est lu ; l’ancien aperçu est retiré, la couverture reste', async () => {
    const req = fakeReq()
    const data = { source: { provider: 'url', url: 'file:///etc/passwd' } }
    expect(await run(req, data, { thumbnail: 7, preview: 8, source: { provider: 'url', url: 'https://exemple.fr/a.mp4' } })).toEqual({ ...data, preview: null })
    expect(videoCover).not.toHaveBeenCalled()
    expect(req.payload.find).not.toHaveBeenCalled()
  })
})

describe('YouTube : aperçu en diaporama des 3 images de la vidéo', () => {
  const youtube = { title: 'Le journal', source: { provider: 'youtube', youtubeUrl: `https://www.youtube.com/watch?v=${YT}` } }
  const serve = (names: string[], bytes?: number) => {
    for (const name of names) responses[`${THUMBS}/${YT}/${name}.jpg`] = image(bytes)
  }

  it('images HD (maxres1-3) : diaporama apercu-y<id>.mp4, crédit YouTube ; couverture comme avant', async () => {
    serve(['maxresdefault', 'maxres1', 'maxres2', 'maxres3'])
    const req = fakeReq()
    expect(await run(req, youtube)).toMatchObject({ thumbnail: 100, preview: 101 })
    expect(vi.mocked(slideshow).mock.calls[0][0]).toHaveLength(3)
    expect(created(req).map((c) => [c.file.name, c.data.credit])).toEqual([
      [`youtube-${YT}.jpg`, 'YouTube'],
      [`apercu-y${YT}.mp4`, 'YouTube'],
    ])
  })

  it('série HD incomplète : sd1-3 (recadrées par le diaporama), sinon mq1-3', async () => {
    serve(['maxresdefault', 'maxres1', 'maxres2', 'sd1', 'sd2', 'sd3'])
    await run(fakeReq(), youtube)
    const tried = fetchMock.mock.calls.map(([url]) => String(url).split('/').pop())
    expect(tried).toEqual(expect.arrayContaining(['maxres3.jpg', 'sd1.jpg', 'sd2.jpg', 'sd3.jpg']))
    expect(tried).not.toContain('mq1.jpg')
    expect(slideshow).toHaveBeenCalledTimes(1)

    resetVideoAutoMedia()
    responses = {}
    serve(['maxresdefault', 'mq1', 'mq2', 'mq3'], 5000)
    expect(await run(fakeReq(), youtube)).toMatchObject({ preview: 101 })
  })

  it('aucune série complète : pas d’aperçu (avertissement), la couverture est quand même posée', async () => {
    serve(['maxresdefault'])
    const req = fakeReq()
    const result = await run(req, youtube)
    expect(result.thumbnail).toBe(100)
    expect(result.preview).toBeUndefined()
    expect(slideshow).not.toHaveBeenCalled()
    expect(warnings(req).some((w) => w.includes(`Aperçu animé impossible pour la vidéo YouTube ${YT}`))).toBe(true)
  })
})

describe('Bunny Stream', () => {
  it('hôte de diffusion connu : son image (bunny-<id>), pas d’aperçu', async () => {
    vi.stubEnv('BUNNY_CDN_HOST', 'https://vz-test.b-cdn.net/')
    responses['https://vz-test.b-cdn.net/abc-123/thumbnail.jpg'] = image()
    const req = fakeReq()
    const result = await run(req, { title: 'Bunny', source: { provider: 'bunny', bunnyVideoId: 'abc-123' } })
    expect(result).toMatchObject({ thumbnail: 100 })
    expect(result.preview).toBeUndefined()
    expect(created(req).map((c) => c.file.name)).toEqual(['bunny-abc-123.jpg'])
    expect(videoCover).not.toHaveBeenCalled()
  })

  it('sans hôte : source non prise en charge, aperçu retiré, couverture (même automatique) laissée', async () => {
    const req = fakeReq([{ id: 5, filename: 'video-m12.webp' }])
    const data = { source: { provider: 'bunny', bunnyVideoId: 'abc-123' } }
    expect(await run(req, data, { thumbnail: 5, preview: 6, source: { provider: 'upload', file: 12 } })).toEqual({ ...data, preview: null })
  })
})

describe('changement de source', () => {
  const before = { title: 'Balade', thumbnail: 5, preview: 6, source: { provider: 'youtube', youtubeUrl: YT } }
  const now = { source: { provider: 'upload', file: 12 } }

  it('couverture automatique de l’ancienne vidéo : remplacée ; aperçu refait', async () => {
    const req = fakeReq([clip(), { id: 5, filename: `youtube-${YT}.webp` }, { id: 6, filename: `apercu-y${YT}.mp4` }])
    expect(await run(req, { ...now, thumbnail: 5, preview: 6 }, before)).toMatchObject({ thumbnail: 100, preview: 101 })
  })

  it('image choisie par l’équipe : jamais remplacée ; aperçu refait', async () => {
    const req = fakeReq([clip(), { id: 5, filename: 'mon-image.webp' }, { id: 6, filename: `apercu-y${YT}.mp4` }])
    const result = await run(req, now, before)
    expect(result.thumbnail).toBeUndefined()
    expect(result.preview).toBe(100)
    expect(videoCover).not.toHaveBeenCalled()
  })

  it('même vidéo, aperçu manquant : seul l’aperçu est fabriqué', async () => {
    const req = fakeReq([clip(), { id: 5, filename: 'video-m12.webp' }])
    const result = await run(req, { title: 'Balade' }, { thumbnail: 5, preview: null, source: now.source })
    expect(result).toEqual({ title: 'Balade', preview: 100 })
    expect(videoCover).not.toHaveBeenCalled()
  })

  it('nouvelle vidéo illisible : la couverture tirée de l’ancienne vidéo est retirée (visuel de remplacement), l’aperçu aussi', async () => {
    vi.mocked(videoCover).mockRejectedValue(new Error('Invalid data found when processing input'))
    vi.mocked(videoClip).mockRejectedValue(new Error('Invalid data found when processing input'))
    const req = fakeReq([clip(), { id: 5, filename: `youtube-${YT}.webp` }])
    expect(await run(req, now, before)).toEqual({ ...now, thumbnail: null, preview: null })
    expect(warnings(req).filter((w) => w.includes('Invalid data found'))).toHaveLength(2)
  })
})

describe('robustesse', () => {
  const upload = { title: 'Balade', source: { provider: 'upload', file: 12 } }

  it('échec : pas de nouvel essai pendant 10 min (enregistrements automatiques), puis nouvel essai', async () => {
    vi.mocked(videoCover).mockRejectedValue(new Error('délai de 30 s dépassé'))
    const req = fakeReq([clip()])
    const start = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(start)
    await run(req, upload)
    expect(videoCover).toHaveBeenCalledTimes(1)
    vi.spyOn(Date, 'now').mockReturnValue(start + RETRY_AFTER_MS - 1000)
    await run(req, upload)
    expect(videoCover).toHaveBeenCalledTimes(1)
    expect(warnings(req).filter((w) => w.includes('délai de 30 s dépassé'))).toHaveLength(1)
    vi.spyOn(Date, 'now').mockReturnValue(start + RETRY_AFTER_MS + 1000)
    vi.mocked(videoCover).mockResolvedValue(Buffer.from('couverture'))
    expect((await run(req, upload)).thumbnail).toBeTypeOf('number')
    expect(videoCover).toHaveBeenCalledTimes(2)
  })

  it('ffmpeg absent : signalé une fois, rien de fabriqué pour un fichier ; la couverture YouTube reste téléchargée', async () => {
    vi.mocked(ffmpegReady).mockImplementation(async (onMissing) => {
      onMissing?.('ffmpeg')
      return false
    })
    const req = fakeReq([clip()])
    expect(await run(req, upload)).toBe(upload)
    await run(req, upload)
    expect(videoCover).not.toHaveBeenCalled()
    expect(warnings(req).filter((w) => w.includes('ffmpeg introuvable'))).toHaveLength(1)
    responses[`${THUMBS}/${YT}/maxresdefault.jpg`] = image()
    const result = await run(req, { title: 'YouTube', source: { provider: 'youtube', youtubeUrl: YT } })
    expect(result.thumbnail).toBeTypeOf('number')
    expect(result.preview).toBeUndefined()
    expect(slideshow).not.toHaveBeenCalled()
  })

  it('deux enregistrements simultanés de la même vidéo : un seul traitement', async () => {
    let finish = () => {}
    vi.mocked(videoCover).mockImplementation(() => new Promise((resolve) => (finish = () => resolve(Buffer.from('couverture')))))
    const req = fakeReq([clip()])
    const both = Promise.all([run(req, upload), run(req, upload)])
    await vi.waitFor(() => expect(videoCover).toHaveBeenCalled())
    finish()
    await both
    expect(videoCover).toHaveBeenCalledTimes(1)
    expect(videoClip).toHaveBeenCalledTimes(1)
  })

  it('erreur imprévue (médiathèque injoignable) : enregistrement sans couverture ni aperçu, jamais d’erreur', async () => {
    const req = fakeReq([clip()])
    req.payload.find.mockRejectedValue(new Error('connexion perdue'))
    expect(await run(req, upload)).toBe(upload)
    expect(warnings(req).some((w) => w.includes('connexion perdue'))).toBe(true)
  })

  it('décalage dans le Top 10 (context.top10Reorder) ou données absentes : rien', async () => {
    const req = fakeReq([clip()])
    expect(await run(req, upload, undefined, { [TOP10_REORDER]: true })).toBe(upload)
    expect(await run(req, undefined)).toBeUndefined()
    expect(req.payload.find).not.toHaveBeenCalled()
  })
})
