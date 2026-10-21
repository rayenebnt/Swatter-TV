// Vignette YouTube automatique (src/hooks/youtubeThumbnail.ts) avec une fausse requête et un faux fetch (aucun accès à
// Internet) : téléchargement de la plus grande image disponible, réutilisation d'une image déjà téléchargée, échecs.
import type { CollectionBeforeValidateHook } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOP10_REORDER } from '@/hooks/top10'
import { thumbnailUnlessYoutube, youtubeThumbnail } from '@/hooks/youtubeThumbnail'

const ID = 'dQw4w9WgXcQ'
const BASE = 'http://127.0.0.1:9/vi'
const LINK = `https://www.youtube.com/watch?v=${ID}`

type Media = { id: number; filename: string }
/** Fausse requête : médiathèque en mémoire (recherche « like » simulée en ILIKE), création notée. */
function fakeReq(library: Media[] = []) {
  return {
    payload: {
      find: vi.fn(async ({ where }: { where: { filename: { like: string } } }) => {
        // « like » de Payload : ILIKE '%…%', où « _ » est un joker
        const pattern = new RegExp(where.filename.like.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.'), 'i')
        return { docs: library.filter((m) => pattern.test(m.filename)) }
      }),
      create: vi.fn(async () => ({ id: 77 })),
      logger: { warn: vi.fn() },
    },
  }
}
type Req = ReturnType<typeof fakeReq>

type HookArgs = Parameters<CollectionBeforeValidateHook>[0]
const run = (req: Req, data: Record<string, unknown> | undefined, originalDoc?: Record<string, unknown>, context: Record<string, unknown> = {}) =>
  youtubeThumbnail({ data, originalDoc, req, context, operation: originalDoc ? 'update' : 'create', collection: { slug: 'videos' } } as unknown as HookArgs)

const image = (bytes: number) => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'image/jpeg' } })
let responses: Record<string, () => Response | Promise<Response>>
const fetchMock = vi.fn(async (url: string | URL | Request) => {
  const answer = responses[String(url)]
  return answer ? answer() : new Response('introuvable', { status: 404 })
})

beforeEach(() => {
  responses = {}
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('YOUTUBE_THUMB_BASE', `${BASE}/`)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const youtube = (over: Record<string, unknown> = {}) => ({ title: 'Le journal des Alpes', source: { provider: 'youtube', youtubeUrl: LINK }, ...over })

describe('vidéo YouTube enregistrée sans image', () => {
  it('l’image « maxresdefault » est téléchargée dans la médiathèque et devient la vignette', async () => {
    responses[`${BASE}/${ID}/maxresdefault.jpg`] = () => image(50_000)
    const req = fakeReq()
    const data = youtube()
    expect(await run(req, data)).toEqual({ ...data, thumbnail: 77 })
    expect(req.payload.create).toHaveBeenCalledTimes(1)
    type File = { data: Buffer; mimetype: string; name: string; size: number }
    const [args] = req.payload.create.mock.calls[0] as unknown as [{ collection: string; data: unknown; file: File; req: unknown }]
    expect(args.collection).toBe('media')
    expect(args.data).toEqual({ alt: 'Le journal des Alpes', credit: 'YouTube' })
    expect(args.file).toMatchObject({ mimetype: 'image/jpeg', name: `youtube-${ID}.jpg`, size: 50_000 })
    expect(args.file.data.length).toBe(50_000)
    expect(args.req).toBe(req)
  })

  it('pas d’image HD : « sddefault », puis « hqdefault » ; l’image grise « indisponible » (minuscule) est écartée', async () => {
    responses[`${BASE}/${ID}/sddefault.jpg`] = () => image(1_500)
    responses[`${BASE}/${ID}/hqdefault.jpg`] = () => image(20_000)
    const req = fakeReq()
    expect((await run(req, youtube()))?.thumbnail).toBe(77)
    const tried = fetchMock.mock.calls.map(([url]) => String(url))
    expect(tried).toEqual([`${BASE}/${ID}/maxresdefault.jpg`, `${BASE}/${ID}/sddefault.jpg`, `${BASE}/${ID}/hqdefault.jpg`])
    expect((req.payload.create.mock.calls[0] as unknown as [{ file: { size: number } }])[0].file.size).toBe(20_000)
  })

  it('YouTube injoignable ou trop lent : enregistrement sans image et avertissement dans le journal', async () => {
    for (const name of ['maxresdefault', 'sddefault', 'hqdefault']) {
      responses[`${BASE}/${ID}/${name}.jpg`] = () => {
        throw new TypeError('fetch failed')
      }
    }
    const req = fakeReq()
    const data = youtube()
    expect(await run(req, data)).toBe(data)
    expect(req.payload.create).not.toHaveBeenCalled()
    expect(req.payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining(ID))
  })

  it('chaque téléchargement est borné dans le temps (AbortSignal)', async () => {
    await run(fakeReq(), youtube())
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect(call[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('titre de la vidéo comme description de l’image (fiche d’origine à défaut), sinon « Image de la vidéo »', async () => {
    responses[`${BASE}/${ID}/maxresdefault.jpg`] = () => image(50_000)
    const alt = async (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) => {
      const req = fakeReq()
      await run(req, data, originalDoc)
      return (req.payload.create.mock.calls[0] as unknown as [{ data: { alt: string } }])[0].data.alt
    }
    expect(await alt(youtube({ title: '  Le journal  ' }))).toBe('Le journal')
    expect(await alt({ source: { provider: 'youtube', youtubeUrl: LINK } }, { title: 'Titre enregistré' })).toBe('Titre enregistré')
    expect(await alt(youtube({ title: '   ' }))).toBe('Image de la vidéo')
  })

  it('adresse des images remplaçable (YOUTUBE_THUMB_BASE, barre finale retirée) ; par défaut i.ytimg.com', async () => {
    vi.stubEnv('YOUTUBE_THUMB_BASE', '')
    await run(fakeReq(), youtube())
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`)
  })

  it('formats de lien acceptés : youtu.be, shorts, live, embed ou identifiant seul', async () => {
    const yt = 'https://www.youtube.com'
    const links = [`https://youtu.be/${ID}`, `${yt}/shorts/${ID}`, `${yt}/live/${ID}?si=x`, `${yt}/embed/${ID}`, ID]
    for (const link of links) {
      fetchMock.mockClear()
      await run(fakeReq(), youtube({ source: { provider: 'youtube', youtubeUrl: link } }))
      expect(String(fetchMock.mock.calls[0]?.[0]), link).toBe(`${BASE}/${ID}/maxresdefault.jpg`)
    }
  })
})

describe('image déjà dans la médiathèque', () => {
  it('même vidéo (déjà en replay, vignette retirée puis remise…) : l’image existante est réutilisée, sans téléchargement', async () => {
    for (const filename of [`youtube-${ID}.jpg`, `youtube-${ID}-2.jpg`, `youtube-${ID}.webp`]) {
      const req = fakeReq([{ id: 5, filename }])
      expect((await run(req, youtube()))?.thumbnail, filename).toBe(5)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(req.payload.create).not.toHaveBeenCalled()
    }
  })

  it('recherche approximative vérifiée : l’image d’une autre vidéo n’est jamais reprise', async () => {
    responses[`https://i.ytimg.com/vi/ab_defghijk/maxresdefault.jpg`] = () => image(50_000)
    vi.stubEnv('YOUTUBE_THUMB_BASE', '')
    const other = [
      { id: 1, filename: 'youtube-abXdefghijk.jpg' }, // « _ » joker du like
      { id: 2, filename: 'youtube-AB_DEFGHIJK.jpg' }, // autre casse : autre vidéo
      { id: 3, filename: 'youtube-ab_defghijk-copie.jpg' },
      { id: 4, filename: 'ancien-youtube-ab_defghijk.jpg' },
    ]
    const req = fakeReq(other)
    const result = await run(req, youtube({ source: { provider: 'youtube', youtubeUrl: 'https://youtu.be/ab_defghijk' } }))
    expect(req.payload.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'media', where: { filename: { like: 'youtube-ab_defghijk' } } }))
    expect(result?.thumbnail).toBe(77)
  })
})

describe('rien à faire', () => {
  it('image déjà choisie, dans le formulaire ou dans la fiche enregistrée', async () => {
    const req = fakeReq()
    const withImage = youtube({ thumbnail: 3 })
    expect(await run(req, withImage)).toBe(withImage)
    const unchanged = { title: 'Titre' }
    expect(await run(req, unchanged, { thumbnail: 3, source: { provider: 'youtube', youtubeUrl: LINK } })).toBe(unchanged)
    expect(req.payload.find).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('image retirée (champ vidé) d’une vidéo YouTube : une nouvelle image est récupérée', async () => {
    responses[`${BASE}/${ID}/maxresdefault.jpg`] = () => image(50_000)
    const req = fakeReq()
    expect((await run(req, youtube({ thumbnail: null }), { thumbnail: 3 }))?.thumbnail).toBe(77)
  })

  it('source lue dans la fiche enregistrée quand le formulaire ne la renvoie pas', async () => {
    responses[`${BASE}/${ID}/maxresdefault.jpg`] = () => image(50_000)
    const req = fakeReq()
    expect((await run(req, { title: 'Titre' }, { source: { provider: 'youtube', youtubeUrl: LINK } }))?.thumbnail).toBe(77)
  })

  it('autre source que YouTube, lien vide ou qui ne désigne pas une vidéo : rien', async () => {
    const req = fakeReq()
    for (const source of [
      { provider: 'bunny', bunnyVideoId: 'abc' },
      { provider: 'url', url: 'https://exemple.fr/video.mp4' },
      { provider: 'youtube', youtubeUrl: '' },
      { provider: 'youtube' },
      { provider: 'youtube', youtubeUrl: 'https://www.youtube.com/@swattertv' },
      null,
    ]) {
      const data = { title: 'Titre', source }
      expect(await run(req, data)).toBe(data)
    }
    expect(req.payload.find).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('décalage de place dans le Top 10 (context.top10Reorder) ou données absentes : rien', async () => {
    const req = fakeReq()
    const data = youtube()
    expect(await run(req, data, undefined, { [TOP10_REORDER]: true })).toBe(data)
    expect(await run(req, undefined)).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('thumbnailUnlessYoutube : image obligatoire, sauf pour une vidéo YouTube', () => {
  it('image fournie, ou vidéo YouTube : valide', () => {
    expect(thumbnailUnlessYoutube(12, { siblingData: { source: { provider: 'bunny' } } })).toBe(true)
    expect(thumbnailUnlessYoutube(null, { siblingData: { source: { provider: 'youtube' } } })).toBe(true)
  })

  it('autre source sans image : message en français', () => {
    for (const siblingData of [{ source: { provider: 'bunny' } }, { source: { provider: 'url' } }, { source: { provider: 'upload' } }, {}]) {
      expect(thumbnailUnlessYoutube(null, { siblingData })).toBe('Ajoutez une image : elle est obligatoire, sauf pour une vidéo YouTube.')
    }
  })
})
