// Images adaptées au téléphone : photo entière sur fond flou quand un cadre en couperait trop (src/lib/media.ts :
// orientation et seuils, mêmes valeurs que les requêtes de conteneur de globals.css ; WholeFrame de MediaImage : deux images
// aux mêmes sources), carrousel de l'accueil (src/components/home/heroMedia.ts et HeroImage.tsx : photo entière ou image qui
// couvre le cadre portrait, largeur réellement affichée), fichiers insérés dans un texte riche
// (src/components/ui/proseUpload.ts), affiches de l'agenda (vignette et encart vedette), vignettes du Top 10 (largeur
// affichée), lecteur coupé (video.css) et point focal des vignettes de webcams.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { featureRatio, posterThumbSizes } from '@/components/agenda/utils'
import { HeroImage } from '@/components/home/HeroImage'
import { heroMobilePosition, heroMobileSizes, heroMobileSource, heroWhole } from '@/components/home/heroMedia'
import { MediaImage } from '@/components/ui/MediaImage'
import { PROSE_SIZES, proseUpload } from '@/components/ui/proseUpload'
import { top10Sizes } from '@/components/video/Top10Section'
import { webcamPoster } from '@/components/webcams/utils'
import { coverShare, mediaOrientation, ratioOrientation, WHOLE_FRAMES, wholeIn, wholeOrientation, type Orientation } from '@/lib/media'
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

describe('photo entière sur fond flou : orientation de la photo et proportions du cadre', () => {
  it('orientation : en largeur (16:9 et plus), moyenne (3:2, 4:3), presque carrée, en hauteur (4:5, 3:4), très haute (2:3, 9:16)', () => {
    expect([16 / 9, 2, 3 / 2, 4 / 3, 1, 0.9, 4 / 5, 3 / 4, 2 / 3, 9 / 16].map(ratioOrientation)).toEqual(['l', 'l', 'm', 'm', 's', 's', 'p', 'p', 't', 't'])
    expect(mediaOrientation(media())).toBe('l')
    expect(mediaOrientation(media({ width: 1080, height: 1350, sizes: {} }), 'hero')).toBe('p')
    // sans dimensions ni média : 16:9, comme les visuels de repli
    expect(mediaOrientation(null)).toBe('l')
  })

  it('part visible d’une photo qui couvre son cadre', () => {
    expect(coverShare(16 / 9, 16 / 9)).toBe(1)
    expect(coverShare(16 / 9, 390 / 760)).toBeCloseTo(0.289, 3)
    expect(coverShare(0.8, 16 / 9)).toBeCloseTo(0.45, 3)
  })

  it('seuils : la photo s’affiche entière quand le cadre en couperait plus de 40 % environ, sinon elle le couvre', () => {
    // téléphone (carrousel 390 × 760), vignette du Top 10 (176 × 264), tuile « À la une » sur téléphone (4:3,3), carte 16:9
    expect(wholeIn('l', 390 / 760)).toBe(true)
    expect(wholeIn('l', 176 / 264)).toBe(true)
    expect(wholeIn('l', 4 / 3.3)).toBe(false)
    expect(wholeIn('l', 16 / 9)).toBe(false)
    expect(wholeIn('m', 0.78)).toBe(true)
    expect(wholeIn('m', 1)).toBe(false)
    expect(wholeIn('s', 390 / 760)).toBe(true)
    expect(wholeIn('s', 0.78)).toBe(false)
    expect(wholeIn('s', 16 / 9)).toBe(true)
    // photo en hauteur : couvre un cadre en hauteur, entière dans un bandeau (lecteur, image d'un article)
    expect(wholeIn('p', 390 / 760)).toBe(false)
    expect(wholeIn('p', 1)).toBe(false)
    expect(wholeIn('p', 16 / 9)).toBe(true)
    expect(wholeIn('t', 1.2)).toBe(true)
    // à chaque seuil, la photo typique de l'orientation garde 55 à 65 % d'elle-même en couvrant le cadre
    const typical: Record<Orientation, number> = { l: 16 / 9, m: 1.42, s: 1, p: 0.75, t: 0.6 }
    for (const [o, { below, above }] of Object.entries(WHOLE_FRAMES) as [Orientation, { below?: number; above?: number }][]) {
      for (const frame of [below, above].filter((f): f is number => f !== undefined)) {
        expect(coverShare(typical[o], frame), `${o} à ${frame}`).toBeGreaterThan(0.55)
        expect(coverShare(typical[o], frame), `${o} à ${frame}`).toBeLessThan(0.65)
      }
    }
  })

  it('globals.css : mêmes seuils dans les requêtes de conteneur que WHOLE_FRAMES (photo entière et fond affichés)', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8')
    const blocks = [...css.matchAll(/@container whole \(aspect-ratio ([<>]) ([\d.]+)\) \{([^}]*\}[^}]*\})\s*\}/g)]
    const found = blocks.map(([, op, value, body]) => {
      expect(body).toContain('object-fit: contain')
      expect(body).toContain('.whole__bg { display: block; }')
      return { op, value: Number(value), orientations: [...new Set([...body.matchAll(/data-o='(\w)'/g)].map((m) => m[1]))] }
    })
    const expected = Object.entries(WHOLE_FRAMES).flatMap(([o, { below, above }]) => [
      ...(below !== undefined ? [{ op: '<', value: below, orientations: [o] }] : []),
      ...(above !== undefined ? [{ op: '>', value: above, orientations: [o] }] : []),
    ])
    expect(found).toHaveLength(expected.length)
    expect(found).toEqual(expect.arrayContaining(expected))
    // « phone » : le conteneur ne répond plus au-delà de 760 px
    expect(css).toMatch(/@media \(min-width: 761px\) \{\s*\.whole\[data-whole='phone'\] \{ container-type: normal; \}/)
  })

  it('cadre aux proportions fixes (lecteur 16:9) : orientation seulement si la photo doit s’y afficher entière', () => {
    expect(wholeOrientation(media({ width: 1080, height: 1350, sizes: {} }), 16 / 9, 'hero')).toBe('p')
    expect(wholeOrientation(media({ width: 1600, height: 1600, sizes: {} }), 16 / 9, 'hero')).toBe('s')
    expect(wholeOrientation(media(), 16 / 9, 'hero')).toBeUndefined()
    expect(wholeOrientation(null, 16 / 9)).toBeUndefined()
  })
})

describe('lecteur « Vidéo indisponible » et direct coupé : affiche entière atténuée (video.css)', () => {
  /** Déclarations des règles de video.css qui visent ce sélecteur (« opacity: .3; filter: … »), commentaires retirés. */
  const rule = (selector: string) => {
    const css = readFileSync(join(process.cwd(), 'src/styles/video.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.split(',').some((x) => x.trim().replace(/\s+/g, ' ') === selector))
      .map(([, , body]) => body.trim())
      .join(' ')
  }

  it('tout le cadre est atténué, fond flou compris, comme une affiche simple ; la photo ne l’est pas une seconde fois', () => {
    // affiche simple (elle couvre le cadre) : la photo seule est atténuée, sur le fond sombre du lecteur
    expect(rule('.vp--off .vp__poster')).toContain('opacity: .3')
    expect(rule('.direct-off .vp__poster')).toContain('opacity: .45')
    // photo entière (WholeFrame) : le cadre .whole porte l'atténuation, sans quoi le fond flou resterait à pleine luminosité
    expect(rule('.vp--off .whole')).toContain('opacity: .3')
    expect(rule('.vp--off .whole')).toContain('filter: grayscale(.5)')
    expect(rule('.direct-off .whole')).toContain('opacity: .45')
    expect(rule('.vp--off .whole .vp__poster')).toMatch(/opacity: 1;.*filter: none/)
  })
})

describe('Top 10 : largeur affichée de la vignette (attribut sizes)', () => {
  it('photo en largeur (16:9, 4:3) : entière sur fond flou, à la largeur de la vignette (176 px, 150 px sur téléphone)', () => {
    expect(top10Sizes(media())).toBe('(max-width: 760px) 150px, 176px')
    expect(top10Sizes(media({ width: 1600, height: 1200, sizes: {} }))).toBe('(max-width: 760px) 150px, 176px')
  })

  it('photo carrée ou en hauteur : elle couvre la vignette par sa hauteur, plus large qu’elle (sinon image floue)', () => {
    expect(top10Sizes(media({ width: 1600, height: 1600, sizes: {} }))).toBe('(max-width: 760px) 225px, 264px')
    expect(top10Sizes(media({ width: 1080, height: 1350, sizes: {} }))).toBe('(max-width: 760px) 180px, 211px')
    // très haute (9:16) : plus étroite que la vignette, elle la couvre par sa largeur
    expect(top10Sizes(media({ width: 1080, height: 1920, sizes: {} }))).toBe('(max-width: 760px) 150px, 176px')
  })

  it('sans vignette : le visuel de repli (16:9) couvre la vignette par sa hauteur', () => {
    expect(top10Sizes(null)).toBe('(max-width: 760px) 400px, 469px')
    expect(top10Sizes(12)).toBe('(max-width: 760px) 400px, 469px')
  })
})

/** Balises <img> d'un rendu HTML, avec leurs attributs. */
function imgs(html: string): Record<string, string>[] {
  return [...html.matchAll(/<img ([^>]*)\/?>/g)].map(([, attrs]) => Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])))
}

/** Balises <source> des <picture> d'un rendu HTML. */
const sources = (html: string) => [...html.matchAll(/<picture>(<source [^>]*\/?>)/g)].map((m) => m[1])

describe('WholeFrame (MediaImage « whole ») : deux images aux mêmes sources', () => {
  const render = (props: Parameters<typeof MediaImage>[0]) => renderToStaticMarkup(createElement(MediaImage, props))

  it('photo et fond : mêmes srcset, sizes et src (un seul fichier téléchargé) ; fond décoratif et différé', () => {
    const html = render({ media: media(), size: 'hero', fill: true, whole: true, sizes: '176px', priority: true })
    // React précharge lui-même une image prioritaire (même srcset et sizes : même fichier)
    expect(html).toMatch(/^(<link rel="preload" as="image" imageSrcSet="[^"]+" imageSizes="176px" fetchPriority="high"\/>)?<span class="whole" data-o="l">/)
    const [bg, fg] = imgs(html)
    expect(bg.class).toBe('whole__bg')
    expect(fg.class).toBe('whole__fg')
    for (const key of ['srcSet', 'sizes', 'src']) expect(bg[key], key).toBe(fg[key])
    expect(fg.sizes).toBe('176px')
    expect(bg).toMatchObject({ alt: '', 'aria-hidden': 'true', loading: 'lazy' })
    expect(bg).not.toHaveProperty('fetchPriority')
    // image principale : chargée tout de suite et en priorité (pas de préchargement : deux images)
    expect(fg).toMatchObject({ alt: 'Le lac d’Annecy au lever du soleil', loading: 'eager', fetchPriority: 'high' })
    // cadrage de la photo qui couvre le cadre : point focal en variable (la photo entière se cadre en CSS)
    expect(render({ media: media({ focalX: 80, focalY: 40 }), size: 'hero', fill: true, whole: true })).toContain('--focal:80% 40%')
  })

  it('orientation de la photo affichée ; « phone » : seulement sous 760 px ; visuel de repli : image simple qui couvre', () => {
    expect(render({ media: media({ width: 1080, height: 1350, sizes: {} }), size: 'hero', fill: true, whole: true })).toContain('data-o="p"')
    expect(render({ media: media(), size: 'hero', fill: true, whole: 'phone' })).toContain('data-whole="phone"')
    const fallback = render({ media: null, fill: true, whole: true, fallbackSrc: '/visuels/t-ete-a.webp' })
    expect(fallback).not.toContain('whole')
    expect(imgs(fallback)).toHaveLength(1)
  })

  it('avec une source « téléphone » : deux balises <picture> identiques, orientation de l’image pour téléphone', () => {
    const poster = media({ width: 2400, height: 1350 })
    const html = render({ media: poster, size: 'card', fill: true, whole: 'phone', sizes: '330px', mobile: { media: poster, sizes: '112px' } })
    expect(html).toContain('data-o="l" data-whole="phone"')
    const [first, second] = sources(html)
    expect(first).toBe(second)
    expect(first).toContain('sizes="112px"')
    const [bg, fg] = imgs(html)
    for (const key of ['srcSet', 'sizes', 'src']) expect(bg[key], key).toBe(fg[key])
    expect(fg.class).toBe('whole__fg img-mobile')
  })
})

describe('carrousel : photo entière sur fond flou (data-whole)', () => {
  const portrait = media({ id: 8, width: 1080, height: 1350, sizes: {} })
  const square = media({ id: 9, width: 1600, height: 1600, sizes: {} })

  it('photo en largeur : entière sur téléphone et sur tablette tenue en hauteur', () => {
    expect(heroWhole(media(), null)).toBe('phone tall')
    expect(heroWhole(media({ width: 1600, height: 1200, sizes: {} }), null)).toBe('phone tall')
  })

  it('photo carrée : entière sur téléphone seulement ; photo en hauteur : couvre le cadre', () => {
    expect(heroWhole(square, null)).toBe('phone')
    expect(heroWhole(portrait, null)).toBeUndefined()
  })

  it('image pour téléphone : c’est elle qui compte sur téléphone (l’image de fond, sur tablette)', () => {
    expect(heroWhole(media(), portrait)).toBe('tall')
    expect(heroWhole(portrait, media({ id: 10 }))).toBe('phone')
    // image pour téléphone non chargée (identifiant seul) : l'image de fond
    expect(heroWhole(media(), 12)).toBe('phone tall')
  })

  it('visuel de repli (pas d’image de fond) : il couvre toujours le cadre', () => {
    expect(heroWhole(null, null)).toBeUndefined()
  })
})

describe('carrousel sur téléphone : source « téléphone »', () => {
  it('image pour téléphone en hauteur : elle remplace l’image de fond et couvre le cadre, centrée par défaut', () => {
    const phone = media({ id: 8, width: 1080, height: 1350, sizes: {} })
    expect(heroMobileSource(media(), phone, '/visuels/hero-nuit.webp')).toEqual({ media: phone, size: 'hero', sizes: '761px', position: '50% 50%' })
    // son point focal, au centre du cadre (seulement en largeur : l'image, moins haute que le cadre en proportion, garde toute sa hauteur)
    expect(heroMobileSource(media(), { ...phone, focalX: 40, focalY: 30 }, '/visuels/hero-nuit.webp').position).toBe('18.2% 50%')
    expect(heroMobileSource(media(), { ...phone, focalX: 20, focalY: 30 }, '/visuels/hero-nuit.webp').position).toBe('0% 50%')
  })

  it('photo entière (en largeur, sans image pour téléphone) : pleine largeur de l’écran, sans recadrage', () => {
    const background = media({ focalX: 85, focalY: 40 })
    expect(heroMobileSource(background, null, '/visuels/hero-nuit.webp')).toEqual({ media: background, size: 'hero', fallbackSrc: '/visuels/hero-nuit.webp', sizes: '100vw', position: undefined })
    // image pour téléphone en largeur : entière elle aussi
    expect(heroMobileSource(media(), media({ id: 11 }), '/visuels/hero-nuit.webp')).toMatchObject({ sizes: '100vw', position: undefined })
  })

  it('image de fond en hauteur : elle couvre le cadre portrait, recadrée autour de son point focal (cadrage CSS sans point focal)', () => {
    const background = media({ width: 1080, height: 1350, sizes: {} })
    expect(heroMobileSource(background, null, '/visuels/hero-nuit.webp')).toEqual({ media: background, size: 'hero', fallbackSrc: '/visuels/hero-nuit.webp', sizes: '761px', position: undefined })
    expect(heroMobileSource({ ...background, focalX: 20, focalY: 40 }, null, '/visuels/hero-nuit.webp').position).toBe('0% 50%')
    expect(heroMobilePosition(media({ focalX: 60, focalY: 40 }))).toBe('64.5% 50%')
  })

  it('image pour téléphone non chargée (identifiant seul) ou absente, image de fond absente : repli sur le visuel, qui couvre le cadre', () => {
    expect(heroMobileSource(media(), 12, '/visuels/hero-nuit.webp').media).toEqual(media())
    expect(heroMobileSource(null, null, '/visuels/hero-matin.webp')).toEqual({ media: null, size: 'hero', fallbackSrc: '/visuels/hero-matin.webp', sizes: '1691px', position: undefined })
  })
})

describe('carrousel : rendu de l’image de fond (HeroImage)', () => {
  const render = (props: Parameters<typeof HeroImage>[0]) => renderToStaticMarkup(createElement(HeroImage, props))

  it('photo entière : fond flou puis photo, une seule source pour tous les écrans, première diapositive prioritaire', () => {
    const html = render({ background: media(), phone: null, fallbackSrc: '/visuels/hero-nuit.webp', priority: true })
    expect(html).not.toContain('<picture')
    const [bg, fg] = imgs(html)
    expect(bg).toMatchObject({ class: 'slide__backdrop', alt: '', 'aria-hidden': 'true', loading: 'lazy', sizes: '100vw' })
    expect(fg).toMatchObject({ class: 'slide__photo', alt: '', loading: 'eager', fetchPriority: 'high', sizes: '100vw' })
    for (const key of ['srcSet', 'sizes', 'src']) expect(bg[key], key).toBe(fg[key])
    expect(fg.src).toContain('lac-2400x1350.webp')
    // proportions de la photo (pas de saut de mise en page), sans les styles de remplissage de next/image
    expect(fg.style).toContain('--ratio-m:1.7778')
    expect(fg.style).not.toContain('position')
    expect(render({ background: media(), phone: null, fallbackSrc: '/visuels/hero-nuit.webp', priority: false })).not.toContain('fetchPriority')
  })

  it('photo en hauteur : pas de fond, <picture> avec la source « téléphone » qui couvre le cadre portrait', () => {
    const html = render({ background: media({ width: 1080, height: 1350, sizes: {} }), phone: null, fallbackSrc: '/visuels/hero-nuit.webp', priority: true })
    expect(imgs(html)).toHaveLength(1)
    expect(sources(html)).toHaveLength(1)
    expect(sources(html)[0]).toMatch(/^<source media="\(max-width: 760px\)" srcSet="[^"]+" sizes="761px"\/?>$/)
  })

  it('image pour téléphone en hauteur et image de fond en largeur : fond flou (tablette) et photo, mêmes <picture>', () => {
    const phone = media({ id: 8, url: '/api/media/file/portrait.webp', width: 1080, height: 1350, sizes: {} })
    const [first, second, ...rest] = sources(render({ background: media(), phone, fallbackSrc: '/visuels/hero-nuit.webp', priority: false }))
    expect(rest).toHaveLength(0)
    expect(first).toBe(second)
    expect(first).toContain('portrait.webp')
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
    // photo en largeur : entière sur fond flou, à la largeur de la vignette
    expect(posterThumbSizes(media({ width: 1600, height: 900 }))).toBe('112px')
    // presque carrée ou 4:3 : elle couvre la vignette par sa hauteur
    expect(posterThumbSizes(media({ width: 1000, height: 1000 }))).toBe('150px')
    expect(posterThumbSizes(media({ width: 1600, height: 1200 }))).toBe('200px')
    // sans affiche (visuel de repli 16:9, qui couvre la vignette)
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
