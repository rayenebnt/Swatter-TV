// Espace membres : chemin de retour après connexion (?retour=, src/lib/members/shared.ts). safeReturn n'accepte qu'une
// adresse interne du site (jamais un autre site, ni l'administration, l'API, les fichiers de Next ou l'aperçu) ;
// isAuthPage (pages d'où l'on ne revient pas) et loginHref (lien « Se connecter »).
import { describe, expect, it } from 'vitest'
import { isAuthPage, loginHref, safeReturn } from '@/lib/members/shared'
import { ASCII_HEADER, ATTACKS, EXTERNAL, SITE, landing } from './attaques-redirection'

const RESERVED = /^\/(admin|api|_next|apercu)(\/|$)/i

describe('safeReturn : chemin de retour après connexion', () => {
  it('garde un chemin interne, avec ses paramètres et son ancre', () => {
    expect(safeReturn('/')).toBe('/')
    expect(safeReturn('/videos/ma-video')).toBe('/videos/ma-video')
    expect(safeReturn('/info/isere/un-article')).toBe('/info/isere/un-article')
    expect(safeReturn('/recherche?q=lac&page=2#resultats')).toBe('/recherche?q=lac&page=2#resultats')
    expect(safeReturn('/compte/ma-liste')).toBe('/compte/ma-liste')
  })

  it('refuse une adresse d’un autre site, même déguisée', () => {
    for (const v of EXTERNAL) expect(safeReturn(v), JSON.stringify(v)).toBe('/compte')
  })

  it('aucune tentative ne mène hors du site, ni vers une rubrique réservée', () => {
    for (const v of ATTACKS) {
      const r = safeReturn(v)
      if (r === '/compte') continue
      expect(r.startsWith('/') && !r.startsWith('//'), JSON.stringify(v)).toBe(true)
      expect(landing(r).origin, JSON.stringify(v)).toBe(SITE)
      expect(RESERVED.test(landing(r).pathname), JSON.stringify(v)).toBe(false)
      expect(r, JSON.stringify(v)).toMatch(ASCII_HEADER)
    }
  })

  it('refuse les caractères de contrôle et la barre oblique inverse (« /\\t/site » deviendrait « //site »)', () => {
    for (const v of ['/a\u0000b', '/a\u0001b', '/a\u001fb', '/a\u007fb', '/videos\\x', '/\\', '/videos/x\n', '/videos/x\t']) {
      expect(safeReturn(v), JSON.stringify(v)).toBe('/compte')
    }
  })

  it('une tabulation, une barre ou une barre inverse encodées (%09, %2f, %5c) restent un simple chemin du site', () => {
    for (const v of ['/%09/evil.example', '/%2f%2fevil.example', '/%5cevil.example', '/%5c%5cevil.example', '/%2e%2e%2f%2fevil.example']) {
      const r = safeReturn(v)
      expect(r, v).toBe(v)
      expect(landing(r).origin, v).toBe(SITE)
      expect(landing(r).pathname.startsWith('//'), v).toBe(false)
    }
  })

  it('normalise le chemin avant de le vérifier (« /./admin », « /a/../admin », %2e)', () => {
    for (const v of ['/./admin', '/a/../admin', '/%2e%2e/admin', '/%2e/api/compte/moi', '/.%2e/_next/static/x.js', '/videos/../apercu?chemin=/x']) {
      expect(safeReturn(v), v).toBe('/compte')
    }
    expect(safeReturn('/videos/./x/../ma-video')).toBe('/videos/ma-video')
    expect(safeReturn('/..')).toBe('/')
  })

  it('refuse l’administration, l’API, les fichiers de Next et l’aperçu, quelle que soit la casse', () => {
    for (const v of [
      '/admin',
      '/admin/',
      '/admin#x',
      '/admin?x=1',
      '/admin/collections/members',
      '/ADMIN',
      '/Admin/login',
      '/api',
      '/api/compte/export',
      '/API/compte/moi',
      '/Api/membres/lettre-info.csv',
      '/_next',
      '/_next/static/chunks/x.js',
      '/_NEXT/data/x.json',
      '/apercu',
      '/apercu?chemin=/videos/x',
      '/apercu/quitter',
      '/APERCU',
    ]) {
      expect(safeReturn(v), v).toBe('/compte')
    }
  })

  it('accepte les pages dont le nom commence seulement comme ces rubriques', () => {
    for (const v of ['/administration', '/apis-du-jura', '/apercus', '/_nextgen', '/videos/admin', '/info/api']) expect(safeReturn(v), v).toBe(v)
  })

  it('encode en ASCII les caractères accentués et les espaces (le chemin finit dans un en-tête Location)', () => {
    expect(safeReturn('/info/isère/fête des lumières?q=été#là')).toBe('/info/is%C3%A8re/f%C3%AAte%20des%20lumi%C3%A8res?q=%C3%A9t%C3%A9#l%C3%A0')
    expect(safeReturn('/\u2028x')).toMatch(ASCII_HEADER)
    // déjà encodés : laissés tels quels, sans retour à la ligne réel (pas d'en-tête injecté)
    expect(safeReturn('/a%0d%0aSet-Cookie:x=1')).toBe('/a%0d%0aSet-Cookie:x=1')
  })

  it('refuse un chemin de plus de 300 caractères', () => {
    const max = `/${'a'.repeat(299)}`
    expect(safeReturn(max)).toBe(max)
    expect(safeReturn(`${max}a`)).toBe('/compte')
    expect(safeReturn(`/?q=${'a'.repeat(1000)}`)).toBe('/compte')
  })

  it('refuse toute valeur qui n’est pas une chaîne', () => {
    for (const v of [undefined, null, 42, true, {}, ['/videos/x'], new String('/videos/x'), { toString: () => '/videos/x' }]) {
      expect(safeReturn(v)).toBe('/compte')
    }
  })

  it('refuse une chaîne vide ou un chemin relatif', () => {
    for (const v of ['', 'videos/x', '?retour=/x', '#ancre', '.', './videos']) expect(safeReturn(v), v).toBe('/compte')
  })

  it('renvoie la valeur de repli demandée', () => {
    expect(safeReturn('//evil.example', '/')).toBe('/')
    expect(safeReturn(undefined, '/connexion')).toBe('/connexion')
    expect(safeReturn('/videos/x', '/')).toBe('/videos/x')
  })
})

describe('isAuthPage : pages de connexion (on n’y revient pas après la connexion)', () => {
  it('reconnaît connexion, inscription, mot de passe oublié et nouveau mot de passe', () => {
    for (const p of [
      '/connexion',
      '/connexion/',
      '/connexion?retour=%2Fvideos',
      '/connexion#formulaire',
      '/inscription',
      '/inscription?retour=/videos/x',
      '/mot-de-passe-oublie',
      '/mot-de-passe-oublie?retour=/x',
      '/compte/nouveau-mot-de-passe',
      '/compte/nouveau-mot-de-passe?token=abc',
    ]) {
      expect(isAuthPage(p), p).toBe(true)
    }
  })

  it('ne confond pas les autres pages', () => {
    const others = ['/', '/compte', '/compte/profil', '/compte/historique', '/connexions', '/inscriptions-2027', '/videos/connexion', 'connexion']
    for (const p of [...others, '/compte/nouveau-mot-de-passe-x']) {
      expect(isAuthPage(p), p).toBe(false)
    }
  })
})

describe('loginHref : lien « Se connecter » depuis la page affichée', () => {
  const retourOf = (href: string) => new URL(href, SITE).searchParams.get('retour')

  it('revient à la page affichée après la connexion', () => {
    expect(loginHref('/videos/ma-video')).toBe('/connexion?retour=%2Fvideos%2Fma-video')
    expect(loginHref('/info/isere/un-article')).toBe('/connexion?retour=%2Finfo%2Fisere%2Fun-article')
    expect(retourOf(loginHref('/agenda/fete-des-lumieres'))).toBe('/agenda/fete-des-lumieres')
  })

  it('sans retour depuis l’accueil, l’espace membres et les pages de connexion', () => {
    const pages = [null, '', '/', '/compte', '/compte/historique', '/compte/ma-liste', '/compte/profil']
    for (const p of [...pages, '/connexion', '/inscription', '/mot-de-passe-oublie']) {
      expect(loginHref(p), String(p)).toBe('/connexion')
    }
  })

  it('une page dont le nom commence seulement par « compte » n’est pas l’espace membres', () => {
    expect(loginHref('/comptes-rendus-du-conseil')).toBe('/connexion?retour=%2Fcomptes-rendus-du-conseil')
    expect(loginHref('/compteur-de-vues')).toBe('/connexion?retour=%2Fcompteur-de-vues')
  })

  it('le chemin de retour est encodé (accents compris) et se relit tel que safeReturn l’accepte', () => {
    expect(retourOf(loginHref('/info/isère/fête'))).toBe('/info/is%C3%A8re/f%C3%AAte')
    expect(loginHref('/info/isère/fête')).toMatch(ASCII_HEADER)
  })

  it('ne renvoie jamais vers un autre site ni une rubrique réservée', () => {
    const paths = ['//evil.example', '/\\evil.example', '/a/..//evil.example', '/admin', '/api/compte/moi', '/apercu']
    for (const p of [...paths, ...ATTACKS.filter((a) => a.startsWith('/'))]) {
      const href = loginHref(p)
      expect(href.startsWith('/connexion'), p).toBe(true)
      const retour = retourOf(href)
      if (retour === null) continue
      expect(landing(retour).origin, p).toBe(SITE)
      expect(retour.startsWith('//'), p).toBe(false)
      expect(RESERVED.test(landing(retour).pathname), p).toBe(false)
    }
  })
})
