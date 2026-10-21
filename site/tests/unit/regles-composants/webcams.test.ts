// Webcams (src/components/webcams/utils.ts) : webcam « Bientôt en direct » sans lien de flux, vignette (média Payload,
// stockage S3 ou visuel de repli) et données simples transmises au lecteur.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isComingSoon, panDuration, toWebcamView, webcamPoster } from '@/components/webcams/utils'
import type { WebcamItem } from '@/lib/queries/webcams'
import { SITE_URL } from '@/lib/site'
import type { Media } from '@/payload-types'

const ROOT = path.resolve(__dirname, '../../..')

const media = (over: Partial<Media> = {}): Media => ({
  id: 9,
  alt: 'Le port d’Aix-les-Bains',
  url: `${SITE_URL}/api/media/file/port.webp`,
  width: 1920,
  height: 1080,
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  sizes: { card: { url: `${SITE_URL}/api/media/file/port-960x540.webp`, width: 960, height: 540 } },
  ...over,
})

const cam = (over: Partial<WebcamItem> = {}): WebcamItem => ({
  id: 4,
  name: 'Lac du Bourget',
  place: 'Port d’Aix-les-Bains',
  department: 'savoie',
  slug: 'lac-du-bourget',
  provider: 'iframe',
  embedUrl: 'https://webcam.example.fr/embed/123',
  image: media(),
  temperature: '13°',
  ...over,
})

describe('webcam « Bientôt en direct » : lien du flux pas encore renseigné', () => {
  it('sans lien, lien vide ou fait d’espaces : bientôt en direct', () => {
    expect(isComingSoon({ embedUrl: null })).toBe(true)
    expect(isComingSoon({ embedUrl: undefined })).toBe(true)
    expect(isComingSoon({ embedUrl: '' })).toBe(true)
    expect(isComingSoon({ embedUrl: '   \n' })).toBe(true)
  })

  it('avec un lien : en direct', () => {
    expect(isComingSoon({ embedUrl: 'https://webcam.example.fr/embed/123' })).toBe(false)
    expect(isComingSoon({ embedUrl: '  https://webcam.example.fr/flux.m3u8  ' })).toBe(false)
  })
})

describe('vignette de la webcam', () => {
  it('image d’aperçu : taille « card » de Payload, en chemin local, avec sa description', () => {
    expect(webcamPoster(cam())).toEqual({ src: '/api/media/file/port-960x540.webp', width: 960, height: 540, alt: 'Le port d’Aix-les-Bains' })
  })

  it('image sans description : « Webcam <nom> »', () => {
    expect(webcamPoster(cam({ image: media({ alt: null }) })).alt).toBe('Webcam Lac du Bourget')
    expect(webcamPoster(cam({ image: media({ alt: '' }) })).alt).toBe('Webcam Lac du Bourget')
  })

  it('image sans taille « card » (envoi ancien) : le fichier d’origine et ses dimensions', () => {
    expect(webcamPoster(cam({ image: media({ sizes: {} }) }))).toMatchObject({ src: '/api/media/file/port.webp', width: 1920, height: 1080 })
  })

  it('stockage S3 servi directement par le fournisseur : adresse absolue conservée', () => {
    const bucket = 'https://swatter.s3.eu-west-3.amazonaws.com'
    const s3 = media({ url: `${bucket}/port.webp`, sizes: { card: { url: `${bucket}/port-960x540.webp`, width: 960, height: 540 } } })
    expect(webcamPoster(cam({ image: s3 })).src).toBe('https://swatter.s3.eu-west-3.amazonaws.com/port-960x540.webp')
  })

  it('stockage S3 servi par Payload (/api/media/file/…) : chemin local, optimisé par next/image', () => {
    const site = 'https://www.swatter-tv.fr/api/media/file'
    const s3 = media({ url: `${site}/port.webp`, sizes: { card: { url: `${site}/port-960x540.webp?v=2` } } })
    expect(webcamPoster(cam({ image: s3 })).src).toBe('/api/media/file/port-960x540.webp?v=2')
  })

  it('sans image (ou image non chargée) : visuel de la chaîne, choisi d’après l’identifiant, décoratif', () => {
    for (const image of [null, undefined, 12]) {
      const poster = webcamPoster(cam({ id: 4, image }))
      expect(poster).toMatchObject({ width: 960, height: 540, alt: '' })
      expect(poster.src).toMatch(/^\/visuels\/[\w-]+\.webp$/)
    }
    expect(webcamPoster(cam({ id: 4, image: null })).src).toBe(webcamPoster(cam({ id: 10, image: null })).src)
    expect(webcamPoster(cam({ id: 4, image: null })).src).not.toBe(webcamPoster(cam({ id: 5, image: null })).src)
  })

  it('visuels de repli : fichiers présents dans public/visuels (et leur version de partage)', () => {
    const all = new Set(Array.from({ length: 12 }, (_, id) => webcamPoster(cam({ id, image: null })).src))
    expect(all.size).toBeGreaterThan(3)
    for (const src of all) {
      expect(existsSync(path.join(ROOT, 'public', src))).toBe(true)
      expect(existsSync(path.join(ROOT, 'public/og', `${path.basename(src, '.webp')}.jpg`))).toBe(true)
    }
  })

  it('panoramique lent des cartes : durées décalées d’une carte à la suivante, en boucle', () => {
    const durations = Array.from({ length: 8 }, (_, i) => panDuration(i))
    expect(durations).toEqual(['24s', '28s', '20s', '26s', '24s', '28s', '20s', '26s'])
    for (let i = 1; i < durations.length; i++) expect(durations[i]).not.toBe(durations[i - 1])
  })
})

describe('toWebcamView : données simples transmises au lecteur', () => {
  it('reprend nom, lieu, type de flux, lien, température et vignette', () => {
    expect(toWebcamView(cam())).toEqual({
      id: 4,
      slug: 'lac-du-bourget',
      name: 'Lac du Bourget',
      place: 'Port d’Aix-les-Bains',
      provider: 'iframe',
      embedUrl: 'https://webcam.example.fr/embed/123',
      temperature: '13°',
      poster: { src: '/api/media/file/port-960x540.webp', width: 960, height: 540, alt: 'Le port d’Aix-les-Bains' },
    })
  })

  it('valeurs vides ou faites d’espaces : null (lien retiré = « Bientôt en direct »)', () => {
    const view = toWebcamView(cam({ place: '  ', embedUrl: '   ', temperature: '' }))
    expect(view.place).toBeNull()
    expect(view.embedUrl).toBeNull()
    expect(view.temperature).toBeNull()
    expect(isComingSoon({ embedUrl: view.embedUrl })).toBe(true)
  })

  it('espaces autour du lien et du lieu retirés', () => {
    const view = toWebcamView(cam({ place: '  Sommet  ', embedUrl: '  https://webcam.example.fr/flux.m3u8 ', provider: 'hls' }))
    expect(view.place).toBe('Sommet')
    expect(view.embedUrl).toBe('https://webcam.example.fr/flux.m3u8')
    expect(view.provider).toBe('hls')
  })

  it('webcam sans adresse : identifiant de repli « webcam-<id> » (ancre de la page Webcams)', () => {
    expect(toWebcamView(cam({ slug: null })).slug).toBe('webcam-4')
    expect(toWebcamView(cam({ slug: '' })).slug).toBe('webcam-4')
  })

  it('ni objet média ni département transmis au navigateur : seulement des valeurs sérialisables', () => {
    const view = toWebcamView(cam())
    expect(Object.keys(view).sort()).toEqual(['embedUrl', 'id', 'name', 'place', 'poster', 'provider', 'slug', 'temperature'])
    expect(JSON.parse(JSON.stringify(view))).toEqual(view)
  })
})
