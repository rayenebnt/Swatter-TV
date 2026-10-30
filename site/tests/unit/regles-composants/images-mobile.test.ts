// Images adaptées au téléphone : source « téléphone » du carrousel (src/components/home/heroMedia.ts : image dédiée ou
// image de fond recadrée, largeur réellement affichée), fichiers insérés dans un texte riche (src/components/ui/proseUpload.ts),
// affiches de l'agenda (vignette et encart vedette) et point focal des vignettes de webcams.
import { describe, expect, it } from 'vitest'
import { featureRatio, posterThumbSizes } from '@/components/agenda/utils'
import { heroMobilePosition, heroMobileSizes, heroMobileSource } from '@/components/home/heroMedia'
import { PROSE_SIZES, proseUpload } from '@/components/ui/proseUpload'
import { webcamPoster } from '@/components/webcams/utils'
import type { WebcamItem } from '@/lib/queries/webcams'
import type { Media } from '@/payload-types'

const media = (over: Partial<Media> = {}): Media => ({
  id: 5,
  alt: 'Le lac d’Annecy au lever du soleil',
  url: 'http://localhost:3000/api/media/file/lac.webp',
  mimeType: 'image/webp',
  filename: 'lac.webp',
  width: 2400,
  height: 1350,
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  sizes: {
    hero: { url: 'http://localhost:3000/api/media/file/lac-2400x1350.webp', width: 2400, height: 1350 },
    card: { url: 'http://localhost:3000/api/media/file/lac-960x540.webp', width: 960, height: 540 },
  },
  ...over,
})

describe('carrousel sur téléphone : largeur affichée de l’image (attribut sizes)', () => {
  it('image paysage : elle couvre le cadre portrait par sa hauteur, puis le zoom de départ l’agrandit (bien plus que 100vw)', () => {
    // cadre de référence 450 × 820 (390 × 760 et le débord de 30 px), zoom 1,16
    expect(heroMobileSizes(16 / 9)).toBe('1691px')
    expect(heroMobileSizes(1200 / 1700)).toBe('671px')
    expect(heroMobileSizes(0.8)).toBe('761px')
  })

  it('image plus étroite que le cadre : elle suit la largeur de l’écran (débord et zoom compris)', () => {
    expect(heroMobileSizes(0.5)).toBe('calc(116vw + 70px)')
    expect(heroMobileSizes(390 / 760)).toBe('calc(116vw + 70px)')
  })
})

describe('carrousel sur téléphone : source « téléphone » de la balise <picture>', () => {
  it('image pour téléphone renseignée : elle remplace l’image de fond, centrée par défaut', () => {
    const phone = media({ id: 8, width: 1080, height: 1350, sizes: {} })
    expect(heroMobileSource(media(), phone, '/visuels/hero-nuit.webp')).toEqual({ media: phone, size: 'hero', sizes: '761px', position: '50% 50%' })
    // son point focal, au centre du cadre (seulement en largeur : l'image, moins haute que le cadre en proportion, garde toute sa hauteur)
    expect(heroMobileSource(media(), { ...phone, focalX: 40, focalY: 30 }, '/visuels/hero-nuit.webp').position).toBe('18.2% 50%')
    expect(heroMobileSource(media(), { ...phone, focalX: 20, focalY: 30 }, '/visuels/hero-nuit.webp').position).toBe('0% 50%')
  })

  it('sans image pour téléphone : l’image de fond, recadrée autour de son point focal (cadrage CSS sans point focal)', () => {
    const background = media()
    expect(heroMobileSource(background, null, '/visuels/hero-nuit.webp')).toEqual({
      media: background,
      size: 'hero',
      fallbackSrc: '/visuels/hero-nuit.webp',
      sizes: '1691px',
      position: undefined,
    })
    // sujet à droite (conseillé pour l'ordinateur) : fenêtre contre le bord droit, le sujet reste dans le cadre
    expect(heroMobileSource(media({ focalX: 85, focalY: 40 }), null, '/visuels/hero-nuit.webp').position).toBe('100% 50%')
    expect(heroMobilePosition(media({ focalX: 60, focalY: 40 }))).toBe('64.5% 50%')
  })

  it('image pour téléphone non chargée (identifiant seul) ou absente, image de fond absente : repli sur le visuel', () => {
    expect(heroMobileSource(media(), 12, '/visuels/hero-nuit.webp').media).toEqual(media())
    expect(heroMobileSource(null, null, '/visuels/hero-matin.webp')).toEqual({ media: null, size: 'hero', fallbackSrc: '/visuels/hero-matin.webp', sizes: '1691px', position: undefined })
  })
})

describe('fichier inséré dans un texte riche', () => {
  const node = (value: unknown, fields: Record<string, unknown> | null = null, relationTo = 'media') =>
    ({ relationTo, value, fields }) as Parameters<typeof proseUpload>[0]

  it('image : le média entier (pour l’image d’origine ou « hero », jamais une découpe), texte alternatif et crédit', () => {
    const m = media({ credit: '© Swatter TV Info' })
    expect(proseUpload(node(m))).toEqual({ kind: 'image', media: m, alt: 'Le lac d’Annecy au lever du soleil', credit: 'Swatter TV Info' })
    // texte alternatif saisi dans le bloc prioritaire ; crédit vide ou fait d'espaces : rien
    expect(proseUpload(node(media({ credit: '  ' }), { alt: ' Vue du lac ' }))).toMatchObject({ alt: 'Vue du lac', credit: null })
    expect(proseUpload(node(media({ alt: null, credit: null })))).toMatchObject({ alt: '', credit: null })
  })

  it('vidéo : lecteur du navigateur sur le fichier, en chemin local', () => {
    const clip = media({ mimeType: 'video/mp4', url: 'http://localhost:3000/api/media/file/clip.mp4', alt: null, width: null, height: null, sizes: {} })
    expect(proseUpload(node(clip))).toEqual({ kind: 'video', media: clip, src: '/api/media/file/clip.mp4', label: 'Vidéo' })
    expect(proseUpload(node({ ...clip, alt: 'Le direct' }))).toMatchObject({ label: 'Le direct' })
  })

  it('autre fichier : un lien ; média non chargé, d’une autre collection ou sans fichier : rien', () => {
    expect(proseUpload(node(media({ mimeType: 'application/pdf', filename: 'tarifs.pdf', url: '/api/media/file/tarifs.pdf' })))).toEqual({ kind: 'file', src: '/api/media/file/tarifs.pdf', name: 'tarifs.pdf' })
    expect(proseUpload(node(5))).toBeNull()
    expect(proseUpload(node('5'))).toBeNull()
    expect(proseUpload(node(null))).toBeNull()
    expect(proseUpload(node(media(), null, 'users'))).toBeNull()
    expect(proseUpload(node(media({ url: null })))).toBeNull()
  })

  it('largeur affichée : toute la largeur moins les marges sur téléphone, la colonne de texte au-delà', () => {
    expect(PROSE_SIZES).toBe('(max-width: 760px) calc(100vw - 32px), 780px')
  })
})

describe('affiches de l’agenda sur téléphone', () => {
  it('vignette des cartes : largeur affichée de l’affiche d’origine dans le cadre de 112 × 150 px', () => {
    expect(posterThumbSizes(media({ width: 1200, height: 1700 }))).toBe('112px')
    expect(posterThumbSizes(media({ width: 1600, height: 900 }))).toBe('267px')
    // sans affiche (visuel de repli 16:9)
    expect(posterThumbSizes(null)).toBe('267px')
  })

  it('encart vedette : proportions de l’affiche, entre 4:5 (portrait) et 3:2 (paysage)', () => {
    expect(featureRatio(media({ width: 1200, height: 1700 }))).toBe('0.8')
    expect(featureRatio(media({ width: 1000, height: 1000 }))).toBe('1')
    expect(featureRatio(media({ width: 1200, height: 1000 }))).toBe('1.2')
    expect(featureRatio(media({ width: 1600, height: 900 }))).toBe('1.5')
    expect(featureRatio(null)).toBe('1.5')
  })
})

describe('vignette des webcams : point focal', () => {
  const cam = (image: Media | null): WebcamItem => ({
    id: 4,
    name: 'Lac du Bourget',
    place: null,
    department: 'savoie',
    slug: 'lac-du-bourget',
    provider: 'iframe',
    embedUrl: null,
    image,
    temperature: null,
  })

  it('point focal choisi : position dans la vignette « card » (cartes 4:3 plus étroites que la vignette 16:9)', () => {
    expect(webcamPoster(cam(media({ focalX: 30, focalY: 70 }))).position).toBe('30% 70%')
    // photo 4:3 : vignette 16:9 coupée en hauteur autour du point
    expect(webcamPoster(cam(media({ width: 1600, height: 1200, focalX: 30, focalY: 70 }))).position).toBe('30% 60%')
  })

  it('point focal au centre, ou pas d’image : pas de position (cadrage CSS), clé absente', () => {
    expect(Object.keys(webcamPoster(cam(media())))).not.toContain('position')
    expect(Object.keys(webcamPoster(cam(media({ focalX: 50, focalY: 50 }))))).not.toContain('position')
    expect(webcamPoster(cam(null))).not.toHaveProperty('position')
  })
})
