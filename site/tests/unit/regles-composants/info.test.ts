// Rubrique L'Info (src/components/info/time.ts et utils.ts) : libellés de date du fil « En continu » en heure de Paris,
// cartes d'articles (images, accroche, typographie française), texte brut du contenu riche, coupe des textes, partage.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agoLabel, feedLabel } from '@/components/info/time'
import {
  articleImage,
  articleShareImage,
  fallbackVisual,
  frenchSpaces,
  fullDateTime,
  hasOwnContent,
  imageSource,
  kickerLine,
  plainText,
  shortDateTime,
  toTeaser,
  truncate,
} from '@/components/info/utils'
import { frenchSpaces as agendaFrenchSpaces } from '@/components/agenda/utils'
import type { ArticleListItem } from '@/lib/queries/articles'
import { SITE_URL } from '@/lib/site'
import type { Article, Media } from '@/payload-types'

const ROOT = path.resolve(__dirname, '../../..')
const NBSP = ' '

const media = (over: Partial<Media> = {}): Media => ({
  id: 7,
  alt: 'Le lac d’Annecy au lever du soleil',
  url: `${SITE_URL}/api/media/file/lac.webp`,
  width: 2400,
  height: 1350,
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  sizes: {
    card: { url: `${SITE_URL}/api/media/file/lac-960x540.webp`, width: 960, height: 540 },
    thumb: { url: `${SITE_URL}/api/media/file/lac-480x270.webp`, width: 480, height: 270 },
    og: { url: `${SITE_URL}/api/media/file/lac-1200x630.jpg`, width: 1200, height: 630 },
  },
  ...over,
})

type Node = { type: string; text?: string; children?: Node[]; version?: number }
const rich = (...children: Node[]): Article['content'] =>
  ({ root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 } }) as unknown as Article['content']
const text = (t: string): Node => ({ type: 'text', text: t, version: 1 })
const paragraph = (...children: Node[]): Node => ({ type: 'paragraph', children, version: 1 })

afterEach(() => {
  vi.useRealTimers()
})

describe('fil « En continu » : heure, « Hier » ou jour, au calendrier de Paris', () => {
  const now = (iso: string) => Date.parse(iso)

  it('aujourd’hui : l’heure de publication (texte du rendu serveur)', () => {
    expect(feedLabel('2026-10-21T08:12:00.000Z', '10:12', now('2026-10-21T18:00:00.000Z'))).toBe('10:12')
    // publié à 0 h 30 à Paris (22 h 30 UTC la veille) : c'est bien aujourd'hui
    expect(feedLabel('2026-10-20T22:30:00.000Z', '00:30', now('2026-10-21T10:00:00.000Z'))).toBe('00:30')
  })

  it('la veille au calendrier de Paris : « Hier », même une heure plus tôt', () => {
    expect(feedLabel('2026-10-20T21:59:00.000Z', '23:59', now('2026-10-21T10:00:00.000Z'))).toBe('Hier')
    // à 0 h 10 à Paris, un article de 23 h est d'hier
    expect(feedLabel('2026-10-20T21:00:00.000Z', '23:00', now('2026-10-20T22:10:00.000Z'))).toBe('Hier')
  })

  it('avant : le jour et le mois (« 14/10 »), avec les zéros', () => {
    expect(feedLabel('2026-10-14T09:00:00.000Z', '11:00', now('2026-10-21T10:00:00.000Z'))).toBe('14/10')
    expect(feedLabel('2026-03-05T09:00:00.000Z', '10:00', now('2026-03-09T10:00:00.000Z'))).toBe('05/03')
  })

  it('lendemain d’un changement d’heure : la veille reste la veille (journées de 25 h et de 23 h)', () => {
    // lundi 26 octobre 2026, après la nuit de 25 h
    expect(feedLabel('2026-10-25T00:30:00.000Z', '02:30', now('2026-10-26T08:00:00.000Z'))).toBe('Hier')
    expect(feedLabel('2026-10-24T21:59:00.000Z', '23:59', now('2026-10-26T08:00:00.000Z'))).toBe('24/10')
    // lundi 30 mars 2026, après la nuit de 23 h
    expect(feedLabel('2026-03-29T00:30:00.000Z', '01:30', now('2026-03-30T06:00:00.000Z'))).toBe('Hier')
    expect(feedLabel('2026-03-28T22:59:00.000Z', '23:59', now('2026-03-30T06:00:00.000Z'))).toBe('28/03')
  })

  it('premier janvier : le 31 décembre est « Hier », le 30 est « 30/12 »', () => {
    expect(feedLabel('2026-12-31T20:00:00.000Z', '21:00', now('2027-01-01T09:00:00.000Z'))).toBe('Hier')
    expect(feedLabel('2026-12-30T12:00:00.000Z', '13:00', now('2027-01-01T09:00:00.000Z'))).toBe('30/12')
  })

  it('article principal : durée écoulée (« À l’instant », « Il y a 5 min », « Il y a 3 h », « Hier »…)', () => {
    const t = now('2026-10-21T12:00:00.000Z')
    expect(agoLabel('2026-10-21T11:59:30.000Z', t)).toBe('À l’instant')
    expect(agoLabel('2026-10-21T11:55:00.000Z', t)).toBe('Il y a 5 min')
    expect(agoLabel('2026-10-21T09:00:00.000Z', t)).toBe('Il y a 3 h')
    expect(agoLabel('2026-10-20T06:00:00.000Z', t)).toBe('Hier')
    expect(agoLabel('2026-10-18T12:00:00.000Z', t)).toBe('Il y a 3 j')
    expect(agoLabel('2026-10-07T12:00:00.000Z', t)).toBe('Il y a 2 sem.')
    expect(agoLabel('2026-09-01T10:00:00.000Z', t)).toBe('1er septembre 2026')
    // horloge du visiteur en retard : jamais « Il y a -2 min »
    expect(agoLabel('2026-10-21T12:02:00.000Z', t)).toBe('À l’instant')
  })
})

describe('images des articles', () => {
  it('visuel de repli : choix stable d’après l’identifiant, fichier présent (et sa version de partage)', () => {
    expect(fallbackVisual(12)).toBe(fallbackVisual(12))
    expect(fallbackVisual(-3)).toBe(fallbackVisual(3))
    const all = new Set(Array.from({ length: 40 }, (_, i) => fallbackVisual(i)))
    expect(all.size).toBeGreaterThan(10)
    for (const src of all) {
      expect(src).toMatch(/^\/visuels\/[\w-]+\.webp$/)
      expect(existsSync(path.join(ROOT, 'public', src))).toBe(true)
      expect(existsSync(path.join(ROOT, 'public/og', `${path.basename(src, '.webp')}.jpg`))).toBe(true)
    }
  })

  it('imageSource : une adresse du site redevient relative et passe par l’optimiseur', () => {
    expect(imageSource(`${SITE_URL}/api/media/file/lac.webp`)).toEqual({ src: '/api/media/file/lac.webp', unoptimized: false })
    expect(imageSource('/api/media/file/lac.webp?2026')).toEqual({ src: '/api/media/file/lac.webp?2026', unoptimized: false })
    expect(imageSource('/visuels/t-ete-a.webp')).toEqual({ src: '/visuels/t-ete-a.webp', unoptimized: false })
  })

  it('imageSource : une image distante ou hors des chemins autorisés est affichée sans optimiseur', () => {
    expect(imageSource('https://medias.exemple.fr/photo.jpg')).toEqual({ src: 'https://medias.exemple.fr/photo.jpg', unoptimized: true })
    // adresse qui ressemble à celle du site sans l'être
    const lookalike = `${SITE_URL}.exemple.fr/api/media/file/lac.webp`
    expect(imageSource(lookalike)).toEqual({ src: lookalike, unoptimized: true })
    expect(imageSource('//medias.exemple.fr/api/media/file/lac.webp').unoptimized).toBe(true)
    // chemin du site non déclaré dans images.localPatterns (next/image le refuserait)
    expect(imageSource('/og/t-ete-a.jpg')).toEqual({ src: '/og/t-ete-a.jpg', unoptimized: true })
  })

  it('articleImage : média Payload (taille demandée, description, point focal)', () => {
    const image = media({ focalX: 30, focalY: 70 })
    expect(articleImage({ id: 1, image }, 'card')).toEqual({
      src: '/api/media/file/lac-960x540.webp',
      unoptimized: false,
      alt: 'Le lac d’Annecy au lever du soleil',
      width: 960,
      height: 540,
      position: '30% 70%',
    })
    expect(articleImage({ id: 1, image: media() }, 'thumb')).toMatchObject({
      src: '/api/media/file/lac-480x270.webp',
      width: 480,
      height: 270,
      position: undefined,
    })
  })

  it('articleImage : sans média chargé, visuel de repli décoratif en 16/9', () => {
    for (const image of [null, undefined, 42]) {
      expect(articleImage({ id: 5, image }, 'card')).toEqual({ src: fallbackVisual(5), unoptimized: false, alt: '', width: 960, height: 540 })
    }
    // média sans fichier (envoi interrompu)
    expect(articleImage({ id: 5, image: media({ url: null, sizes: {} }) }, 'card').src).toBe(fallbackVisual(5))
  })

  it('articleShareImage : image SEO, puis image de l’article, puis visuel de repli en JPEG 1200 × 630', () => {
    const seo = media({ id: 8, alt: 'Image SEO', sizes: { og: { url: `${SITE_URL}/api/media/file/seo-1200x630.jpg`, width: 1200, height: 630 } } })
    const own = media()
    expect(articleShareImage({ id: 1, title: 'Titre', image: own, meta: { image: seo } })).toEqual({
      url: `${SITE_URL}/api/media/file/seo-1200x630.jpg`,
      width: 1200,
      height: 630,
      alt: 'Image SEO',
    })
    // image SEO non chargée (identifiant seul) : celle de l'article
    expect(articleShareImage({ id: 1, title: 'Titre', image: own, meta: { image: 8 } }).url).toBe(`${SITE_URL}/api/media/file/lac-1200x630.jpg`)
    // média sans description : le titre de l'article
    expect(articleShareImage({ id: 1, title: 'Titre', image: media({ alt: '' }) }).alt).toBe('Titre')
    expect(articleShareImage({ id: 4, title: 'Sans image', image: null, meta: null })).toEqual({
      url: `${SITE_URL}/og/${path.basename(fallbackVisual(4), '.webp')}.jpg`,
      width: 1200,
      height: 630,
      alt: 'Sans image',
    })
  })
})

describe('textes des cartes', () => {
  it('kickerLine : commune puis rubrique, séparées par « · » insécable', () => {
    expect(kickerLine({ city: 'Annemasse', kicker: 'Faits divers', department: 'haute-savoie' })).toBe(`Annemasse${NBSP}· Faits divers`)
    expect(kickerLine({ city: '  Annecy ', kicker: '  Sport  ' })).toBe(`Annecy${NBSP}· Sport`)
  })

  it('kickerLine : département à défaut de commune, région à défaut de département', () => {
    expect(kickerLine({ city: '   ', kicker: 'Société', department: 'isere' })).toBe(`Isère${NBSP}· Société`)
    expect(kickerLine({ department: 'puy-de-dome' })).toBe('Puy-de-Dôme')
    expect(kickerLine({ city: null, kicker: null, department: null })).toBe('Auvergne-Rhône-Alpes')
    expect(kickerLine({ department: 'morbihan', kicker: ' ' })).toBe('Auvergne-Rhône-Alpes')
  })

  // même règle dans L'Info et dans l'agenda
  for (const [name, fn] of [['info', frenchSpaces], ['agenda', agendaFrenchSpaces]] as const) {
    it(`frenchSpaces (${name}) : espace insécable avant : ; ! ? » et après «`, () => {
      expect(fn('Pourquoi ?')).toBe(`Pourquoi${NBSP}?`)
      expect(fn('Alerte : orages ; prudence !')).toBe(`Alerte${NBSP}: orages${NBSP}; prudence${NBSP}!`)
      expect(fn('« Bonjour » et « au revoir »')).toBe(`«${NBSP}Bonjour${NBSP}» et «${NBSP}au revoir${NBSP}»`)
      // rien à changer : pas d'espace, espace déjà insécable, heure, adresse
      expect(fn('Annecy: 20:30')).toBe('Annecy: 20:30')
      expect(fn(`Déjà${NBSP}: bon`)).toBe(`Déjà${NBSP}: bon`)
      expect(fn('https://www.swatter-tv.fr/info?x=1')).toBe('https://www.swatter-tv.fr/info?x=1')
    })
  }

  it('dates des cartes en heure de Paris : « 16 oct. · 16:34 » et « 16 octobre 2026 à 16:34 »', () => {
    expect(shortDateTime('2026-10-16T14:34:00.000Z')).toBe('16 oct. · 16:34')
    expect(fullDateTime('2026-10-16T14:34:00.000Z')).toBe('16 octobre 2026 à 16:34')
    // hiver (UTC+1) et passage de minuit
    expect(shortDateTime('2026-12-04T23:05:00.000Z')).toBe('5 déc. · 00:05')
    expect(fullDateTime('2026-12-31T23:30:00.000Z')).toBe('1er janvier 2027 à 00:30')
  })
})

describe('toTeaser : article prêt pour les cartes (données simples envoyées au client)', () => {
  const article = (over: Partial<ArticleListItem> = {}): ArticleListItem => ({
    id: 31,
    title: 'Fête des lacs : le programme !',
    slug: 'fete-des-lacs',
    excerpt: '  Feu d’artifice : à 22 h.  ',
    department: 'haute-savoie',
    city: 'Annecy',
    kicker: 'Culture',
    image: media(),
    publishedAt: '2026-10-16T14:34:00.000Z',
    updatedAt: '2026-10-16T15:00:00.000Z',
    isInfoOfDay: false,
    ...over,
  })

  it('reprend le titre, l’adresse, l’accroche et les dates (heure de Paris)', () => {
    const t = toTeaser(article())
    expect(t).toMatchObject({
      id: 31,
      title: `Fête des lacs${NBSP}: le programme${NBSP}!`,
      href: '/info/haute-savoie/fete-des-lacs',
      department: 'haute-savoie',
      departmentLabel: 'Haute-Savoie',
      kicker: `Annecy${NBSP}· Culture`,
      excerpt: `Feu d’artifice${NBSP}: à 22 h.`,
      publishedAt: '2026-10-16T14:34:00.000Z',
      clock: '16:34',
      short: '16 oct. · 16:34',
      full: '16 octobre 2026 à 16:34',
      thumb: null,
    })
    expect(t.image).toMatchObject({ src: '/api/media/file/lac-960x540.webp', width: 960, height: 540 })
    // sérialisable tel quel vers un composant client (ni Date, ni objet média complet)
    expect(JSON.parse(JSON.stringify(t))).toEqual(t)
    expect(Object.keys(t.image ?? {}).sort()).toEqual(['alt', 'height', 'position', 'src', 'unoptimized', 'width'])
  })

  it('ne prépare que ce qui sera affiché : vignette, grande image et chapô à la demande', () => {
    const t = toTeaser(article(), { image: false, thumb: true, excerpt: false })
    expect(t.image).toBeNull()
    expect(t.excerpt).toBeNull()
    expect(t.thumb).toMatchObject({ src: '/api/media/file/lac-480x270.webp', width: 480, height: 270 })
  })

  it('chapô vide ou blanc : null ; article sans image : visuel de repli', () => {
    expect(toTeaser(article({ excerpt: '   ' })).excerpt).toBeNull()
    expect(toTeaser(article({ excerpt: null })).excerpt).toBeNull()
    expect(toTeaser(article({ image: null })).image).toMatchObject({ src: fallbackVisual(31), alt: '' })
  })
})

describe('contenu riche (Lexical) : contenu propre et texte brut', () => {
  it('hasOwnContent : faux sans contenu ou avec des paragraphes vides', () => {
    expect(hasOwnContent(null)).toBe(false)
    expect(hasOwnContent(undefined)).toBe(false)
    expect(hasOwnContent(rich())).toBe(false)
    expect(hasOwnContent(rich(paragraph(), paragraph(text('   '))))).toBe(false)
    expect(hasOwnContent(rich(paragraph({ type: 'linebreak', version: 1 })))).toBe(false)
  })

  it('hasOwnContent : vrai avec du texte, même imbriqué, ou un média sans texte', () => {
    expect(hasOwnContent(rich(paragraph(text('Bonjour'))))).toBe(true)
    expect(hasOwnContent(rich({ type: 'list', children: [{ type: 'listitem', children: [{ type: 'link', children: [text('lien')] }] }] }))).toBe(true)
    for (const type of ['upload', 'block', 'inlineBlock', 'relationship', 'horizontalrule']) {
      expect(hasOwnContent(rich(paragraph(), { type }))).toBe(true)
    }
  })

  it('plainText : paragraphes séparés par une espace, sauts de ligne et espaces resserrés', () => {
    expect(plainText(null)).toBe('')
    expect(plainText(rich(paragraph(text('Premier'), { type: 'linebreak' }, text('paragraphe.')), paragraph(text('  Deuxième   '))))).toBe(
      'Premier paragraphe. Deuxième',
    )
    // mise en forme dans une phrase (gras, lien) : les morceaux se suivent sans espace ajoutée
    expect(plainText(rich(paragraph(text('Le '), { type: 'link', children: [text('lac')] }, text(' d’Annecy'))))).toBe('Le lac d’Annecy')
  })

  it('plainText : les éléments d’une liste ne sont pas collés entre eux', () => {
    const list = { type: 'list', children: [{ type: 'listitem', children: [text('Pommes')] }, { type: 'listitem', children: [text('Poires')] }] }
    expect(plainText(rich(paragraph(text('Au marché :')), list))).toBe('Au marché : Pommes Poires')
  })
})

describe('truncate : texte coupé sur un mot, terminé par « … »', () => {
  it('un texte assez court reste intact', () => {
    expect(truncate('Court', 10)).toBe('Court')
    expect(truncate('Exactement dix', 14)).toBe('Exactement dix')
  })

  it('coupe sur le dernier mot entier et ne dépasse jamais la longueur demandée', () => {
    const t = 'Le lac d’Annecy accueille ce week-end la grande fête des lumières'
    const cut = truncate(t, 30)
    expect(cut).toBe('Le lac d’Annecy accueille ce…')
    for (let max = 5; max < t.length; max++) expect(truncate(t, max).length).toBeLessThanOrEqual(max)
  })

  it('ne laisse pas de ponctuation pendante avant « … »', () => {
    expect(truncate('Alerte orange, vigilance renforcée demain matin', 16)).toBe('Alerte orange…')
    expect(truncate('Le programme : concerts, marché et feu d’artifice', 15)).toBe('Le programme…')
    expect(truncate('Sortie (gratuite) au lac', 9)).toBe('Sortie…')
  })

  it('un mot très long est coupé net (pas de texte réduit à presque rien)', () => {
    expect(truncate('Anticonstitutionnellement', 10)).toBe('Anticonst…')
  })

  it('ne coupe pas un caractère en deux (émoji)', () => {
    const cut = truncate('🎆'.repeat(10), 6)
    expect(cut.endsWith('…')).toBe(true)
    // aucune moitié de paire de substitution isolée (elle s'afficherait « � »)
    expect(cut).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/)
  })
})
