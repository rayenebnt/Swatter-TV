// Médias et images de partage (src/lib/media.ts, src/lib/og.ts) : adresse locale optimisable, taille demandée ou repli,
// média absent ou non chargé, stockage S3, description et point focal ; images Open Graph en JPEG 1200 × 630.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mediaAlt, mediaFocal, mediaSize, mediaUrl } from '@/lib/media'
import { ogImage, ogVisual } from '@/lib/og'
import { SITE_URL } from '@/lib/site'
import { SHARE_VISUAL } from '@/components/video/utils'
import type { Media } from '@/payload-types'

const ROOT = path.resolve(__dirname, '../../..')

const media = (over: Partial<Media> = {}): Media => ({
  id: 3,
  alt: 'Le Mont-Blanc au coucher du soleil',
  url: 'http://localhost:3000/api/media/file/mont-blanc.webp',
  width: 2400,
  height: 1600,
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  sizes: {
    card: { url: 'http://localhost:3000/api/media/file/mont-blanc-960x540.webp', width: 960, height: 540 },
    og: { url: 'http://localhost:3000/api/media/file/mont-blanc-1200x630.jpg', width: 1200, height: 630 },
  },
  ...over,
})

describe('mediaUrl : adresse d’un média en chemin local', () => {
  it('média absent ou relation non chargée (identifiant seul) : rien', () => {
    for (const m of [null, undefined, 3, '3']) {
      expect(mediaUrl(m)).toBeNull()
      expect(mediaUrl(m, 'card')).toBeNull()
    }
  })

  it('adresse absolue de Payload (serverURL) : le chemin /api/media/file/… seul, pour l’optimiseur d’images', () => {
    expect(mediaUrl(media())).toBe('/api/media/file/mont-blanc.webp')
    expect(mediaUrl(media({ url: 'https://www.swatter-tv.fr/api/media/file/mont-blanc.webp' }))).toBe('/api/media/file/mont-blanc.webp')
  })

  it('taille demandée si elle existe, sinon le fichier d’origine', () => {
    expect(mediaUrl(media(), 'card')).toBe('/api/media/file/mont-blanc-960x540.webp')
    // image trop petite pour cette taille (Payload laisse l'adresse vide) ou envoyée avant sa création
    expect(mediaUrl(media({ sizes: { card: { url: null, width: null, height: null } } }), 'card')).toBe('/api/media/file/mont-blanc.webp')
    expect(mediaUrl(media({ sizes: undefined }), 'hero')).toBe('/api/media/file/mont-blanc.webp')
    expect(mediaUrl(media(), 'poster')).toBe('/api/media/file/mont-blanc.webp')
  })

  it('média sans fichier ni taille : rien', () => {
    expect(mediaUrl(media({ url: null, sizes: {} }), 'card')).toBeNull()
    expect(mediaUrl(media({ url: null, sizes: {} }))).toBeNull()
  })

  it('paramètres de l’adresse et caractères encodés conservés', () => {
    expect(mediaUrl(media({ url: 'http://localhost:3000/api/media/file/l%C3%A9man.webp?2026-10-01' }))).toBe('/api/media/file/l%C3%A9man.webp?2026-10-01')
  })

  it('stockage S3 servi par Payload : chemin local ; servi directement par le fournisseur : adresse absolue conservée', () => {
    expect(mediaUrl(media({ url: 'https://www.swatter-tv.fr/api/media/file/s3-photo.webp' }))).toBe('/api/media/file/s3-photo.webp')
    const direct = 'https://swatter.s3.eu-west-3.amazonaws.com/medias/photo.webp'
    expect(mediaUrl(media({ url: direct, sizes: {} }), 'card')).toBe(direct)
    const r2 = 'https://pub-123.r2.dev/photo-960x540.webp'
    expect(mediaUrl(media({ sizes: { card: { url: r2 } } }), 'card')).toBe(r2)
  })

  it('chemin déjà relatif gardé tel quel ; adresse illisible renvoyée telle quelle', () => {
    expect(mediaUrl(media({ url: '/api/media/file/a.webp' }))).toBe('/api/media/file/a.webp')
    expect(mediaUrl(media({ url: 'pas une adresse' }))).toBe('pas une adresse')
  })
})

describe('mediaSize, mediaAlt, mediaFocal', () => {
  it('mediaSize : dimensions de la taille demandée, sinon du fichier d’origine, sinon 16/9 (1600 × 900)', () => {
    expect(mediaSize(media(), 'card')).toEqual({ width: 960, height: 540 })
    expect(mediaSize(media(), 'hero')).toEqual({ width: 2400, height: 1600 })
    expect(mediaSize(media())).toEqual({ width: 2400, height: 1600 })
    expect(mediaSize(media({ width: null, height: null, sizes: {} }), 'card')).toEqual({ width: 1600, height: 900 })
    expect(mediaSize(null)).toEqual({ width: 1600, height: 900 })
    expect(mediaSize(12, 'card')).toEqual({ width: 1600, height: 900 })
  })

  it('mediaSize suit mediaUrl : taille vide (non générée) → dimensions du fichier d’origine affiché', () => {
    const m = media({ sizes: { card: { url: null, width: null, height: null } } })
    expect(mediaUrl(m, 'card')).toBe('/api/media/file/mont-blanc.webp')
    expect(mediaSize(m, 'card')).toEqual({ width: 2400, height: 1600 })
  })

  it('mediaAlt : description du média, sinon le texte de repli (vide par défaut)', () => {
    expect(mediaAlt(media())).toBe('Le Mont-Blanc au coucher du soleil')
    expect(mediaAlt(media({ alt: '' }), 'Titre de la page')).toBe('Titre de la page')
    expect(mediaAlt(media({ alt: null }))).toBe('')
    expect(mediaAlt(null, 'Repli')).toBe('Repli')
    expect(mediaAlt(5, 'Repli')).toBe('Repli')
    expect(mediaAlt(undefined)).toBe('')
  })

  it('mediaFocal : point focal choisi, rien pour le centre par défaut (le cadrage CSS s’applique)', () => {
    expect(mediaFocal(media({ focalX: 25, focalY: 80 }))).toBe('25% 80%')
    expect(mediaFocal(media({ focalX: 0, focalY: 0 }))).toBe('0% 0%')
    expect(mediaFocal(media({ focalX: 50, focalY: 50 }))).toBeUndefined()
    expect(mediaFocal(media({ focalX: 50, focalY: 20 }))).toBe('50% 20%')
    expect(mediaFocal(media({ focalX: null, focalY: 40 }))).toBeUndefined()
    expect(mediaFocal(media())).toBeUndefined()
    expect(mediaFocal(null)).toBeUndefined()
  })
})

describe('images de partage (Open Graph) : JPEG 1200 × 630', () => {
  it('ogVisual : visuel de repli /visuels/<nom>.webp → /og/<nom>.jpg ; toute autre adresse inchangée', () => {
    expect(ogVisual('/visuels/t-ete-a.webp')).toBe('/og/t-ete-a.jpg')
    expect(ogVisual('/visuels/hero-crepuscule.webp')).toBe('/og/hero-crepuscule.jpg')
    expect(ogVisual('/visuels/sous/dossier.webp')).toBe('/visuels/sous/dossier.webp')
    expect(ogVisual('/visuels/t-ete-a.png')).toBe('/visuels/t-ete-a.png')
    expect(ogVisual('https://exemple.fr/visuels/t-ete-a.webp')).toBe('https://exemple.fr/visuels/t-ete-a.webp')
  })

  it('chaque visuel de repli a sa version de partage dans public/og (et l’image par défaut des pages vidéo aussi)', () => {
    const visuals = path.join(ROOT, 'public/visuels')
    const names = ['hero-crepuscule', 'hero-matin', 'hero-nuit', 't-ete-a', 't-hiver-b', 't-orage-a']
    for (const name of names) {
      expect(existsSync(path.join(visuals, `${name}.webp`))).toBe(true)
      expect(existsSync(path.join(ROOT, 'public', ogVisual(`/visuels/${name}.webp`)))).toBe(true)
    }
    expect(existsSync(path.join(ROOT, 'public', ogVisual(SHARE_VISUAL)))).toBe(true)
  })

  it('média avec sa taille « og » en JPEG : adresse absolue, dimensions et description', () => {
    expect(ogImage(media(), '/visuels/t-ete-a.webp')).toEqual({
      url: `${SITE_URL}/api/media/file/mont-blanc-1200x630.jpg`,
      width: 1200,
      height: 630,
      alt: 'Le Mont-Blanc au coucher du soleil',
    })
    // le texte alternatif fourni l'emporte ; extension en majuscules et paramètre d'adresse acceptés
    const upper = media({ sizes: { og: { url: 'http://localhost:3000/api/media/file/photo-1200x630.JPEG?v=3', width: 1200, height: 630 } } })
    expect(ogImage(upper, '/visuels/t-ete-a.webp', 'Titre')).toEqual({
      url: `${SITE_URL}/api/media/file/photo-1200x630.JPEG?v=3`,
      width: 1200,
      height: 630,
      alt: 'Titre',
    })
  })

  it('média envoyé avant la taille « og » : sa taille « card » (jamais le WebP d’origine annoncé comme JPEG)', () => {
    const old = media({ sizes: { card: { url: 'http://localhost:3000/api/media/file/vieux-960x540.webp', width: 960, height: 540 } } })
    expect(ogImage(old, '/visuels/t-ete-a.webp')).toEqual({
      url: `${SITE_URL}/api/media/file/vieux-960x540.webp`,
      width: 960,
      height: 540,
      alt: 'Le Mont-Blanc au coucher du soleil',
    })
  })

  it('média sans description : pas de texte alternatif vide', () => {
    expect(ogImage(media({ alt: '' }), '/visuels/t-ete-a.webp')).not.toHaveProperty('alt', '')
    expect(ogImage(media({ alt: null }), '/visuels/t-ete-a.webp').alt).toBeUndefined()
  })

  it('sans média : le visuel de repli converti en JPEG, en adresse absolue', () => {
    expect(ogImage(null, '/visuels/t-hiver-a.webp')).toEqual({ url: `${SITE_URL}/og/t-hiver-a.jpg`, width: 1200, height: 630 })
    expect(ogImage(undefined, '/visuels/t-hiver-a.webp', 'Agenda')).toEqual({ url: `${SITE_URL}/og/t-hiver-a.jpg`, width: 1200, height: 630, alt: 'Agenda' })
    // relation non chargée : comme sans média
    expect(ogImage(4, '/visuels/t-hiver-a.webp').url).toBe(`${SITE_URL}/og/t-hiver-a.jpg`)
    // repli déjà absolu (image distante) : inchangé
    expect(ogImage(null, 'https://i.ytimg.com/vi/abc/hqdefault.jpg').url).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg')
  })

  it('média sans fichier exploitable : repli', () => {
    expect(ogImage(media({ url: null, sizes: {} }), '/visuels/t-ete-b.webp').url).toBe(`${SITE_URL}/og/t-ete-b.jpg`)
  })
})
