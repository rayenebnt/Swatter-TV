// Vidéo de fond des diapositives du carrousel de l'accueil (src/globals/Settings.ts, src/hooks/videoAutoMedia.ts) avec le
// vrai ffmpeg (sauté s'il est absent), réglages enregistrés par l'API comme dans l'administration : image tirée de la
// vidéo quand elle manque, image choisie gardée, vidéo changée ; version légère fond-m<n°>.mp4 préparée en arrière-plan
// (H.264 muet, 20 s et 1920 × 1080 au plus, jamais agrandie, proportions gardées), une seule malgré les enregistrements
// répétés (brouillons automatiques compris) ; sources servies au carrousel ; tableau de bord ; image obligatoire sans
// vidéo ; fichier vidéo remplacé : image et version légère tirées de l'ancien fichier retirées.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDashboardData } from '@/components/admin/dashboard-data'
import { HERO_VIDEO_LIGHT_TYPE } from '@/components/home/heroMedia'
import { heroVideoSource } from '@/components/home/heroVideoSource'
import { backgroundVideosSettled } from '@/hooks/videoAutoMedia'
import type { Media, Setting } from '@/payload-types'
import { apiJson, editorToken, testPayload, unique } from './helpers'

type Slide = NonNullable<Setting['heroSlides']>[number]

const ffmpegOk = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
const CLIP = path.resolve('seed/assets/videos/direct-mont-blanc.mp4')
const work = mkdtempSync(path.join(os.tmpdir(), 'video-fond-'))

let payload: Payload
let editor: string
let image: number
let before: Slide[] = []
const created: number[] = []

const ffmpeg = (args: string[]) => {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr)
}

/** Fichier envoyé dans la médiathèque. */
async function upload(filePath: string, alt = 'Vidéo des tests') {
  const doc = await payload.create({ collection: 'media', data: { alt }, filePath })
  created.push(doc.id)
  return doc.id
}

/** Fichiers automatiques nommés `name` (doublons « -1 » compris). */
async function autoFiles(name: string): Promise<Media[]> {
  const { docs } = await payload.find({ collection: 'media', where: { filename: { like: name } }, depth: 0, pagination: false })
  return docs.filter((m) => new RegExp(`^${name}(-\\d+)?\\.\\w+$`).test(m.filename ?? ''))
}

/** Pistes et durée d'un fichier de la médiathèque (ffprobe). */
function probe(filename: string) {
  const out = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration', '-of', 'json', path.resolve(process.env.MEDIA_DIR!, filename)], {
    encoding: 'utf8',
  })
  return JSON.parse(out.stdout) as { streams: { codec_type: string; codec_name: string; width: number; height: number; pix_fmt: string }[]; format: { duration: string } }
}

/** Réglages enregistrés par l'API (publication, ou brouillon automatique) ; diapositives renvoyées avec leurs images. */
async function saveSlides(heroSlides: Partial<Slide>[], draft = false) {
  const res = await apiJson<{ result: Setting; errors?: { message: string }[] }>(`/globals/settings?depth=1${draft ? '&draft=true&autosave=true' : ''}`, {
    method: 'POST',
    token: editor,
    body: draft ? { heroSlides } : { heroSlides, _status: 'published' },
  })
  return { status: res.status, slides: (res.body.result?.heroSlides ?? []) as Slide[], body: res.body }
}

const filename = (m: Slide['image']) => (m && typeof m === 'object' ? m.filename : null)

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  image = await upload(path.resolve('public/og/hero-matin.jpg'), 'Image choisie')
  before = ((await payload.findGlobal({ slug: 'settings', depth: 0 })).heroSlides ?? []) as Slide[]
})

afterAll(async () => {
  await backgroundVideosSettled()
  await payload.updateGlobal({ slug: 'settings', data: { heroSlides: before, _status: 'published' }, depth: 0, context: { disableRevalidate: true } }).catch(() => undefined)
  for (const id of created.reverse()) await payload.delete({ collection: 'media', id }).catch(() => undefined)
  for (const prefix of ['video-m', 'fond-m', 'apercu-m']) {
    const { docs } = await payload.find({ collection: 'media', where: { filename: { like: prefix } }, depth: 0, pagination: false })
    for (const doc of docs) await payload.delete({ collection: 'media', id: doc.id }).catch(() => undefined)
  }
  rmSync(work, { recursive: true, force: true })
})

describe('diapositive sans vidéo de fond', () => {
  it('image de fond obligatoire : refusée à la publication, avec un message', async () => {
    const { status, body } = await saveSlides([{ kind: 'custom', titleLine1: unique('Sans image'), image: null, video: null }])
    expect(status).toBe(400)
    expect(JSON.stringify(body)).toContain('Ajoutez une image de fond (ou une vidéo de fond : l’image en sera tirée).')
  })
})

describe.runIf(ffmpegOk)('vidéo de fond (ffmpeg)', () => {
  let clip: number
  let first: Slide

  beforeAll(async () => {
    clip = await upload(CLIP)
  })

  it('sans image : image tirée de la vidéo (video-m<n°>) ; version légère fond-m<n°>.mp4 préparée en arrière-plan', async () => {
    const { status, slides } = await saveSlides([{ kind: 'custom', titleLine1: unique('Essai vidéo'), image: null, video: clip }])
    expect(status).toBe(200)
    first = slides[0]
    expect(filename(first.image)).toMatch(new RegExp(`^video-m${clip}(-\\d+)?\\.webp$`))
    expect((first.image as Media).alt).toMatch(/^Image de la vidéo : Essai vidéo/)
    await backgroundVideosSettled()
    const light = await autoFiles(`fond-m${clip}`)
    expect(light).toHaveLength(1)
    expect(light[0]).toMatchObject({ filename: `fond-m${clip}.mp4`, mimeType: 'video/mp4' })
    const info = probe(light[0].filename!)
    // une seule piste, vidéo H.264 (le son est retiré), dimensions de la source gardées (jamais agrandie)
    expect(info.streams).toEqual([{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, pix_fmt: 'yuv420p' }])
    expect(Number(info.format.duration)).toBeLessThanOrEqual(20.1)
  })

  it('enregistrements suivants (brouillon automatique compris) : même image, une seule version légère', async () => {
    const again = await saveSlides([{ ...first, image: (first.image as Media).id, video: clip }])
    const draft = await saveSlides([{ ...first, image: (first.image as Media).id, video: clip, titleLine1: unique('Brouillon') }], true)
    for (const { status, slides } of [again, draft]) {
      expect(status).toBe(200)
      expect((slides[0].image as Media).id).toBe((first.image as Media).id)
    }
    await backgroundVideosSettled()
    expect(await autoFiles(`fond-m${clip}`)).toHaveLength(1)
    expect(await autoFiles(`video-m${clip}`)).toHaveLength(1)
  })

  it('carrousel : la version légère d’abord ; tableau de bord : vidéo en ligne', async () => {
    const original = await payload.findByID({ collection: 'media', id: clip, depth: 0 })
    const sources = await heroVideoSource(original)
    expect(sources[0]).toEqual({ src: `/api/media/file/fond-m${clip}.mp4`, type: HERO_VIDEO_LIGHT_TYPE })
    // clip de démonstration léger (moins de 12 Mo) : servi aussi, pour les navigateurs sans H.264
    expect(sources[1]).toEqual({ src: expect.stringMatching(/\/api\/media\/file\/direct-mont-blanc[\w-]*\.mp4$/), type: 'video/mp4' })
    expect((await getDashboardData(payload)).heroVideos).toEqual({ ready: 1, pending: [], failed: [] })
  })

  it('autre vidéo : image tirée remplacée, image choisie gardée ; vidéo verticale réduite à 1080 de haut, proportions gardées', async () => {
    const vertical = path.join(work, 'verticale.mp4')
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=25', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vertical])
    const other = await upload(vertical)
    const { status, slides } = await saveSlides([
      { ...first, image: (first.image as Media).id, video: other },
      { kind: 'custom', titleLine1: unique('Image choisie'), image, video: other },
    ])
    expect(status).toBe(200)
    expect(filename(slides[0].image)).toMatch(new RegExp(`^video-m${other}(-\\d+)?\\.webp$`))
    expect((slides[1].image as Media).id).toBe(image)
    await backgroundVideosSettled()
    const [light] = await autoFiles(`fond-m${other}`)
    const info = probe(light.filename!)
    expect(info.streams[0]).toMatchObject({ codec_name: 'h264', width: 608, height: 1080 })
  })

  it('fichier vidéo remplacé dans la médiathèque : image et version légère tirées de l’ancien fichier retirées', async () => {
    expect(await autoFiles(`fond-m${clip}`)).toHaveLength(1)
    const shorter = path.join(work, 'plus-courte.mp4')
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', shorter])
    await payload.update({ collection: 'media', id: clip, data: {}, filePath: shorter })
    expect(await autoFiles(`fond-m${clip}`)).toHaveLength(0)
    expect(await autoFiles(`video-m${clip}`)).toHaveLength(0)
  })
})
