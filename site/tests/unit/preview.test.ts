// Aperçu (src/lib/preview.ts) : chemin de redirection sûr de /apercu?chemin=… (safePath), page et endroit montrés par
// l'aperçu en direct pour chaque collection et global (previewFocus, previewPath), adresse absolue de l'aperçu (previewUrl).
import type { PayloadRequest } from 'payload'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { previewFocus, previewPath, previewUrl, safePath } from '@/lib/preview'
import { ASCII_HEADER, ATTACKS, EXTERNAL, SITE, landing } from './attaques-redirection'

// adresse du site lue au chargement de src/lib/site.ts (vi.hoisted s'exécute avant les imports ci-dessus)
vi.hoisted(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.swatter-tv.fr')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) }) as unknown as PayloadRequest

describe('safePath : page ouverte par /apercu?chemin=…', () => {
  it('garde un chemin interne, avec ses paramètres et son ancre', () => {
    for (const p of ['/', '/videos/ma-video', '/info/region/un-article', '/programme-tv?jour=2026-10-21', '/programme-tv#journal', '/webcams', '/admin']) {
      expect(safePath(p), p).toBe(p)
    }
  })

  it('valeur absente ou vide : l’accueil', () => {
    expect(safePath(null)).toBe('/')
    expect(safePath(undefined)).toBe('/')
    expect(safePath('')).toBe('/')
  })

  it('refuse une adresse d’un autre site, même déguisée', () => {
    for (const v of EXTERNAL) expect(safePath(v), JSON.stringify(v)).toBe('/')
  })

  it('aucune tentative ne mène hors du site', () => {
    for (const v of ATTACKS) {
      const r = safePath(v)
      expect(r.startsWith('/') && !r.startsWith('//'), JSON.stringify(v)).toBe(true)
      expect(landing(r).origin, JSON.stringify(v)).toBe(SITE)
      expect(r, JSON.stringify(v)).toMatch(ASCII_HEADER)
    }
  })

  it('refuse les caractères de contrôle et la barre oblique inverse (« /\\t/autre-site » deviendrait « //autre-site »)', () => {
    for (const v of ['/\t/evil.example', '/a\u0000b', '/a\u001fb', '/a\u007fb', '/videos\\x', '/\\evil.example', '/videos/x\n']) {
      expect(safePath(v), JSON.stringify(v)).toBe('/')
    }
  })

  it('une tabulation, une barre ou une barre inverse encodées (%09, %2f, %5c) restent un simple chemin du site', () => {
    for (const v of ['/%09/evil.example', '/%2f%2fevil.example', '/%5cevil.example', '/%2e%2e%2f%2fevil.example']) {
      expect(safePath(v), v).toBe(v)
      expect(landing(safePath(v)).origin, v).toBe(SITE)
    }
  })

  it('normalise le chemin (« /./ », « /a/../ », %2e) et refuse ce qui deviendrait « //autre-site »', () => {
    expect(safePath('/./videos/x')).toBe('/videos/x')
    expect(safePath('/a/../videos')).toBe('/videos')
    expect(safePath('/%2e%2e/videos')).toBe('/videos')
    expect(safePath('/.//evil.example')).toBe('/')
    expect(safePath('/a/..//evil.example')).toBe('/')
    expect(safePath('/%2e%2e//evil.example')).toBe('/')
  })

  it('encode en ASCII les caractères accentués et les espaces (en-tête Location)', () => {
    expect(safePath('/info/isère/fête des lumières?q=été#là')).toBe('/info/is%C3%A8re/f%C3%AAte%20des%20lumi%C3%A8res?q=%C3%A9t%C3%A9#l%C3%A0')
    expect(safePath('/\u2028x')).toMatch(ASCII_HEADER)
  })
})

describe('previewFocus : page et endroit montrés pour chaque collection', () => {
  it('vidéos : la page de la vidéo, sinon la rubrique', () => {
    expect(previewFocus('videos', undefined, { slug: 'ma-video' })).toEqual({ path: '/videos/ma-video' })
    expect(previewFocus('videos', undefined, {})).toEqual({ path: '/videos' })
    expect(previewFocus('videos', undefined, { slug: '' })).toEqual({ path: '/videos' })
  })

  it('articles : la page de l’article (dans son département, « region » sinon), sinon l’info', () => {
    expect(previewFocus('articles', undefined, { slug: 'un-article', department: 'isere' })).toEqual({ path: '/info/isere/un-article' })
    expect(previewFocus('articles', undefined, { slug: 'info-de-geneve', department: 'autres-regions' })).toEqual({ path: '/info/autres-regions/info-de-geneve' })
    expect(previewFocus('articles', undefined, { slug: 'un-article', department: null })).toEqual({ path: '/info/region/un-article' })
    expect(previewFocus('articles', undefined, { department: 'isere' })).toEqual({ path: '/info' })
  })

  it('événements, replays et pages : leur page, sinon la rubrique (l’accueil pour une page)', () => {
    expect(previewFocus('events', undefined, { slug: 'fete-des-lumieres' })).toEqual({ path: '/agenda/fete-des-lumieres' })
    expect(previewFocus('events', undefined, {})).toEqual({ path: '/agenda' })
    expect(previewFocus('replays', undefined, { slug: 'journal-du-21' })).toEqual({ path: '/replay/journal-du-21' })
    expect(previewFocus('replays', undefined, { slug: null })).toEqual({ path: '/replay' })
    expect(previewFocus('pages', undefined, { slug: 'mentions-legales' })).toEqual({ path: '/mentions-legales' })
    expect(previewFocus('pages', undefined, {})).toEqual({ path: '/' })
  })

  it('émissions : leur fiche dans le programme (ancre), sinon le programme', () => {
    expect(previewFocus('programs', undefined, { slug: 'le-journal' })).toEqual({ path: '/programme-tv#le-journal' })
    expect(previewFocus('programs', undefined, {})).toEqual({ path: '/programme-tv' })
  })

  it('webcams : la page Webcams, centrée sur la vignette de la webcam', () => {
    expect(previewFocus('webcams', undefined, { slug: 'lac-d-annecy' })).toEqual({ path: '/webcams', target: 'webcam-lac-d-annecy' })
    expect(previewFocus('webcams', undefined, { slug: 'geneve', department: 'plus' })).toEqual({ path: '/webcams', target: 'webcam-geneve' })
    expect(previewFocus('webcams', undefined, {})).toEqual({ path: '/webcams' })
  })

  it('publicités : la bannière, sur l’accueil ou dans l’info selon l’emplacement', () => {
    expect(previewFocus('ads', undefined, { placement: 'home-leaderboard' })).toEqual({ path: '/', target: 'ad' })
    expect(previewFocus('ads', undefined, { placement: 'inner-leaderboard' })).toEqual({ path: '/info', target: 'ad' })
    expect(previewFocus('ads', undefined, {})).toEqual({ path: '/', target: 'ad' })
  })

  it('autres collections (médiathèque, comptes, membres, messages…) : l’accueil', () => {
    for (const c of ['media', 'users', 'members', 'messages', 'redirects', 'member-history', undefined]) {
      expect(previewFocus(c, undefined, { slug: 'x', id: 3 }), String(c)).toEqual({ path: '/' })
    }
  })
})

describe('previewFocus : créneau de la grille (soirée de 18 h à 0 h 30, journée TV de 0 h 30 à 0 h 30, heure de Paris)', () => {
  const slot = (startsAt: string | null, id: number | string | null = 12) => previewFocus('schedule', undefined, { id, startsAt })

  it('le jour du créneau dans la grille, et le créneau lui-même', () => {
    expect(slot('2026-10-21T18:30:00.000Z')).toEqual({ path: '/programme-tv?jour=2026-10-21', target: 'slot-12' })
    expect(slot('2026-10-21T18:30:00.000Z', '12')).toEqual({ path: '/programme-tv?jour=2026-10-21', target: 'slot-12' })
  })

  it('de 0 h à 0 h 30, la soirée de la veille (heure d’été)', () => {
    // 00:00, 00:29 et 00:30 à Paris (UTC+2) le 22 octobre 2026
    expect(slot('2026-10-21T22:00:00.000Z').path).toBe('/programme-tv?jour=2026-10-21')
    expect(slot('2026-10-21T22:29:00.000Z').path).toBe('/programme-tv?jour=2026-10-21')
    expect(slot('2026-10-22T00:15:00+02:00').path).toBe('/programme-tv?jour=2026-10-21')
    expect(slot('2026-10-21T22:30:00.000Z').path).toBe('/programme-tv?jour=2026-10-22')
  })

  it('de 0 h à 0 h 30, la soirée de la veille (heure d’hiver, passage à l’année suivante)', () => {
    // 00:15, 00:29 et 00:30 à Paris (UTC+1) le 1er janvier 2027 : soirée du 31 décembre jusqu'à 0 h 30
    expect(slot('2026-12-31T23:15:00.000Z').path).toBe('/programme-tv?jour=2026-12-31')
    expect(slot('2026-12-31T23:29:00.000Z').path).toBe('/programme-tv?jour=2026-12-31')
    expect(slot('2026-12-31T23:30:00.000Z').path).toBe('/programme-tv?jour=2027-01-01')
  })

  it('nuit du passage à l’heure d’hiver (25 octobre 2026, 3 h → 2 h)', () => {
    // 00:15 (heure d'été, UTC+2) : encore le 24 ; 00:30 : le 25 ; 02:30 vécu deux fois : le 25 ; 00:15 le 26 (UTC+1) : encore le 25
    expect(slot('2026-10-24T22:15:00.000Z').path).toBe('/programme-tv?jour=2026-10-24')
    expect(slot('2026-10-24T22:30:00.000Z').path).toBe('/programme-tv?jour=2026-10-25')
    expect(slot('2026-10-25T01:30:00.000Z').path).toBe('/programme-tv?jour=2026-10-25')
    expect(slot('2026-10-25T23:15:00.000Z').path).toBe('/programme-tv?jour=2026-10-25')
    expect(slot('2026-10-25T23:30:00.000Z').path).toBe('/programme-tv?jour=2026-10-26')
  })

  it('nuit du passage à l’heure d’été (29 mars 2026, 2 h → 3 h)', () => {
    // 00:29 (heure d'hiver, UTC+1) : encore le 28 ; 00:30 : le 29 ; 00:15 le 30 (heure d'été, UTC+2) : encore le 29
    expect(slot('2026-03-28T23:29:00.000Z').path).toBe('/programme-tv?jour=2026-03-28')
    expect(slot('2026-03-28T23:30:00.000Z').path).toBe('/programme-tv?jour=2026-03-29')
    expect(slot('2026-03-29T01:00:00.000Z').path).toBe('/programme-tv?jour=2026-03-29')
    expect(slot('2026-03-29T22:15:00.000Z').path).toBe('/programme-tv?jour=2026-03-29')
  })

  it('sans date valide : le programme ; sans identifiant : pas de créneau visé', () => {
    expect(slot(null)).toEqual({ path: '/programme-tv', target: 'slot-12' })
    expect(slot('pas une date')).toEqual({ path: '/programme-tv', target: 'slot-12' })
    expect(slot('')).toEqual({ path: '/programme-tv', target: 'slot-12' })
    expect(slot('2026-10-21T18:30:00.000Z', null)).toEqual({ path: '/programme-tv?jour=2026-10-21', target: undefined })
  })
})

describe('previewFocus : Accueil et direct, météo (selon l’onglet ouvert ou le champ touché)', () => {
  const settings = (tab?: string | null, field?: string | null) => previewFocus(undefined, 'settings', {}, { tab, field })

  it('sans indice : le carrousel de l’accueil', () => {
    expect(previewFocus(undefined, 'settings', {})).toEqual({ path: '/', target: 'hero' })
    expect(settings(null, null)).toEqual({ path: '/', target: 'hero' })
  })

  it('chaque onglet montre son endroit du site', () => {
    expect(settings('Accueil (carrousel)')).toEqual({ path: '/', target: 'hero' })
    expect(settings('Le direct')).toEqual({ path: '/direct', target: 'live' })
    expect(settings('Flash info')).toEqual({ path: '/', target: 'flash' })
    expect(settings('Chaîne et contact')).toEqual({ path: '/', target: 'footer' })
    expect(settings('Onglet inconnu')).toEqual({ path: '/', target: 'hero' })
  })

  it('chaque champ montre son endroit du site', () => {
    for (const field of ['heroSlides', 'rating', 'viewsCount']) expect(settings(null, field), field).toEqual({ path: '/', target: 'hero' })
    for (const field of ['liveEnabled', 'live', 'livePoster']) expect(settings(null, field), field).toEqual({ path: '/direct', target: 'live' })
    for (const field of ['flashAuto', 'flashItems']) expect(settings(null, field), field).toEqual({ path: '/', target: 'flash' })
    for (const field of ['tagline', 'contact', 'socials']) expect(settings(null, field), field).toEqual({ path: '/', target: 'footer' })
  })

  it('le champ touché l’emporte sur l’onglet ; un champ sans endroit propre suit son onglet', () => {
    expect(settings('Le direct', 'flashItems')).toEqual({ path: '/', target: 'flash' })
    expect(settings('Flash info', 'livePoster')).toEqual({ path: '/direct', target: 'live' })
    expect(settings('Le direct', 'champInconnu')).toEqual({ path: '/direct', target: 'live' })
    expect(settings('Chaîne et contact', 'members')).toEqual({ path: '/', target: 'footer' })
    expect(settings(null, 'champInconnu')).toEqual({ path: '/', target: 'hero' })
  })

  it('météo : les prévisions, ou le bulletin dès qu’on l’écrit', () => {
    expect(previewFocus(undefined, 'meteo', {})).toEqual({ path: '/meteo', target: 'forecast' })
    expect(previewFocus(undefined, 'meteo', {}, { field: 'bulletin' })).toEqual({ path: '/meteo', target: 'bulletin' })
    expect(previewFocus(undefined, 'meteo', {}, { field: 'autoUpdate' })).toEqual({ path: '/meteo', target: 'forecast' })
  })

  it('autre global (chaîne YouTube) : l’accueil', () => {
    expect(previewFocus(undefined, 'youtube', {})).toEqual({ path: '/' })
  })
})

describe('previewPath : page ouverte avec l’aperçu', () => {
  it('la page de previewFocus, sans tenir compte de l’onglet ni du champ', () => {
    expect(previewPath('videos', undefined, { slug: 'ma-video' })).toBe('/videos/ma-video')
    expect(previewPath('articles', undefined, {})).toBe('/info')
    expect(previewPath('schedule', undefined, { id: 4, startsAt: '2026-10-21T22:15:00.000Z' })).toBe('/programme-tv?jour=2026-10-21')
    expect(previewPath('webcams', undefined, { slug: 'x' })).toBe('/webcams')
    expect(previewPath(undefined, 'settings', {})).toBe('/')
    expect(previewPath(undefined, 'meteo', {})).toBe('/meteo')
    expect(previewPath('media', undefined, {})).toBe('/')
  })
})

describe('previewUrl : adresse absolue de l’aperçu, de la même origine que l’administration', () => {
  it('origine de la requête (hôte et protocole transmis par le proxy)', () => {
    expect(previewUrl(request({ host: 'www.swatter-tv.fr', 'x-forwarded-proto': 'https' }), '/videos/ma-video')).toBe(
      'https://www.swatter-tv.fr/apercu?chemin=%2Fvideos%2Fma-video',
    )
    expect(previewUrl(request({ host: 'interne:3000', 'x-forwarded-host': 'admin.swatter-tv.fr, proxy', 'x-forwarded-proto': 'https, http' }), '/')).toBe(
      'https://admin.swatter-tv.fr/apercu?chemin=%2F',
    )
  })

  it('sans protocole transmis : celui de l’adresse du site ; sans hôte : l’adresse du site', () => {
    expect(previewUrl(request({ host: 'www.swatter-tv.fr' }), '/agenda')).toBe('https://www.swatter-tv.fr/apercu?chemin=%2Fagenda')
    expect(previewUrl(request({}), '/agenda')).toBe('https://www.swatter-tv.fr/apercu?chemin=%2Fagenda')
  })

  it('chaque page d’aperçu traverse /apercu sans être perdue : safePath rend le chemin d’origine', () => {
    const paths = [
      previewPath('videos', undefined, { slug: 'ma-video' }),
      previewPath('articles', undefined, { slug: 'un-article' }),
      previewPath('programs', undefined, { slug: 'le-journal' }),
      previewPath('schedule', undefined, { startsAt: '2026-10-21T18:30:00.000Z' }),
      previewPath('pages', undefined, { slug: 'vie-privee' }),
      '/recherche?q=lac&page=2',
    ]
    for (const p of paths) {
      const chemin = new URL(previewUrl(request({ host: 'www.swatter-tv.fr' }), p)).searchParams.get('chemin')
      expect(safePath(chemin), p).toBe(p)
    }
  })
})
