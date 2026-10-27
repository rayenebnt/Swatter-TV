import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { firstDoc } from './helpers'
import { AdminApi, deleteMember, SITE, signupMember, unique } from './outils-contenus'

/**
 * Référencement : plan du site (XML valide, chaque adresse en 200, rien de l'administration, de l'API ni de l'espace
 * membres), robots.txt, balises de chaque page principale (titre unique et non vide, description, URL canonique, Open
 * Graph avec une image accessible, données structurées JSON-LD valides, un seul h1, langue), en-têtes de sécurité et
 * pages de l'espace membres non indexées.
 *
 * Les pages sont lues dans le HTML envoyé par le serveur, navigateur sans JavaScript : c'est ce que lisent les robots
 * d'indexation et les aperçus des réseaux sociaux. Balises et en-têtes ne dépendent pas de la largeur d'écran : ces tests
 * tournent dans le seul projet « bureau ».
 */

test.skip(({ isMobile }) => isMobile, 'balises et en-têtes identiques sur mobile : vérifiés une fois, sur ordinateur')
test.use({ javaScriptEnabled: false })

/** Ce qu'un robot lit d'une page : statut, en-têtes et balises du HTML du serveur. */
type Crawl = {
  status: number
  headers: Record<string, string>
  lang: string
  title: string
  /** balises meta (attribut name ou property) : première valeur de chacune */
  meta: Record<string, string>
  robots: string[]
  canonical: string[]
  jsonLd: string[]
  h1: string[]
}

async function crawl(page: Page, url: string): Promise<Crawl> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  expect(response, `réponse de ${url}`).toBeTruthy()
  const dom = await page.evaluate(() => {
    const meta: Record<string, string> = {}
    for (const m of document.querySelectorAll('meta[name], meta[property]')) {
      const key = m.getAttribute('property') ?? m.getAttribute('name') ?? ''
      if (!(key in meta)) meta[key] = m.getAttribute('content') ?? ''
    }
    return {
      lang: document.documentElement.getAttribute('lang') ?? '',
      title: document.title.trim(),
      meta,
      robots: [...document.querySelectorAll('meta[name="robots"]')].map((m) => m.getAttribute('content') ?? ''),
      canonical: [...document.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute('href') ?? ''),
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ''),
      h1: [...document.querySelectorAll('h1')].map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim()),
    }
  })
  return { status: response!.status(), headers: response!.headers(), ...dom }
}

/** Adresse absolue du site, sans « / » final (l'accueil s'écrit indifféremment avec ou sans). */
const normalize = (url: string) => url.replace(/\/$/, '')
const absolute = (path: string) => normalize(new URL(path, SITE).toString())
const isNoindex = (c: Crawl) => c.robots.some((r) => /noindex/i.test(r)) || /noindex/i.test(c.headers['x-robots-tag'] ?? '')

/* ----- Données structurées ----- */

type Json = Record<string, unknown>

/** Propriétés attendues par type (résultats enrichis de Google). */
const REQUIRED: Record<string, string[]> = {
  NewsArticle: ['headline', 'datePublished', 'image', 'publisher'],
  Event: ['name', 'startDate', 'location'],
  VideoObject: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
  BreadcrumbList: ['itemListElement'],
  ItemList: ['itemListElement'],
  WebPage: ['name', 'url'],
  WebSite: ['name', 'url'],
  TelevisionStation: ['name', 'url', 'logo'],
}
const URL_KEYS = new Set(['url', 'item', 'image', 'thumbnailUrl', 'embedUrl', 'contentUrl', 'logo', '@id', 'sameAs'])
const DATE_KEYS = new Set(['datePublished', 'dateModified', 'uploadDate', 'startDate', 'endDate'])

/** Lit les blocs JSON-LD : types présents et problèmes (JSON illisible, contexte, propriétés, adresses relatives, dates). */
function readJsonLd(scripts: string[]): { types: string[]; problems: string[] } {
  const types: string[] = []
  const problems: string[] = []
  const walk = (value: unknown, key: string) => {
    if (Array.isArray(value)) return value.forEach((v) => walk(v, key))
    if (value && typeof value === 'object') return Object.entries(value as Json).forEach(([k, v]) => walk(v, k))
    if (typeof value !== 'string') return
    if (URL_KEYS.has(key) && !/^https?:\/\//.test(value)) problems.push(`« ${key} » n’est pas une adresse absolue : ${value}`)
    if (DATE_KEYS.has(key) && Number.isNaN(Date.parse(value))) problems.push(`« ${key} » n’est pas une date : ${value}`)
  }
  scripts.forEach((text, i) => {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      problems.push(`bloc JSON-LD n° ${i + 1} illisible : ${text.slice(0, 80)}`)
      return
    }
    walk(data, '')
    const roots = (Array.isArray(data) ? data : [data]) as Json[]
    for (const root of roots) {
      const items = Array.isArray(root['@graph']) ? (root['@graph'] as Json[]) : [root]
      if (!String(root['@context'] ?? '').includes('schema.org')) problems.push(`bloc n° ${i + 1} : @context absent ou autre que schema.org`)
      for (const item of items) {
        const itemTypes = ([] as unknown[]).concat(item['@type'] ?? []).map(String)
        if (!itemTypes.length) problems.push(`bloc n° ${i + 1} : élément sans @type`)
        types.push(...itemTypes)
        for (const t of itemTypes) {
          for (const prop of REQUIRED[t] ?? []) if (item[prop] == null || item[prop] === '') problems.push(`${t} sans « ${prop} »`)
        }
        if (itemTypes.includes('BreadcrumbList')) {
          const list = (item.itemListElement ?? []) as Json[]
          list.forEach((el, n) => {
            if (el.position !== n + 1) problems.push(`fil d’Ariane : position ${String(el.position)} au lieu de ${n + 1}`)
            if (!el.name) problems.push(`fil d’Ariane : élément ${n + 1} sans nom`)
            if (n < list.length - 1 && !el.item) problems.push(`fil d’Ariane : élément ${n + 1} sans adresse`)
          })
        }
      }
    }
  })
  return { types, problems }
}

/* ----- Pages principales ----- */

type Target = {
  name: string
  path: string | ((request: APIRequestContext) => Promise<string | null>)
  /** chemin de l'adresse canonique attendue (par défaut : celui de la page, sans paramètres) */
  canonical?: string
  /** page volontairement non indexée */
  noindex?: boolean
  /** types JSON-LD attendus, en plus de ceux du site (TelevisionStation, WebSite) */
  types?: string[]
}

type Slugged = { slug?: string | null; department?: string | null }

/** Adresse de la page de détail du premier document publié d'une collection (null sans contenu). */
const detail = (collection: string, url: (d: Slugged) => string) => async (request: APIRequestContext) => {
  const doc = await firstDoc(request, collection)
  return doc?.slug ? url(doc) : null
}

const MAIN: Target[] = [
  { name: 'accueil', path: '/' },
  { name: 'direct', path: '/direct' },
  { name: 'vidéos', path: '/videos' },
  { name: 'info', path: '/info' },
  { name: 'info d’un département', path: '/info/haute-savoie' },
  { name: 'un article', path: detail('articles', (d) => `/info/${d.department}/${d.slug}`), types: ['NewsArticle', 'BreadcrumbList'] },
  { name: 'météo', path: '/meteo', types: ['WebPage', 'BreadcrumbList'] },
  { name: 'météo d’un département', path: '/meteo/isere', types: ['WebPage', 'BreadcrumbList'] },
  { name: 'programme TV', path: '/programme-tv', types: ['BreadcrumbList'] },
  { name: 'agenda', path: '/agenda' },
  { name: 'un événement', path: detail('events', (d) => `/agenda/${d.slug}`), types: ['Event', 'BreadcrumbList'] },
  { name: 'webcams', path: '/webcams', types: ['BreadcrumbList'] },
  { name: 'webcams d’un département', path: '/webcams/savoie', types: ['BreadcrumbList'] },
  { name: 'replay', path: '/replay' },
  { name: 'un replay', path: detail('replays', (d) => `/replay/${d.slug}`), types: ['VideoObject', 'BreadcrumbList'] },
  { name: 'contact', path: '/contact' },
  { name: 'page éditoriale', path: '/mentions-legales', types: ['WebPage', 'BreadcrumbList'] },
  { name: 'recherche', path: '/recherche?q=annecy', canonical: '/recherche', noindex: true },
]

const resolve = async (target: Target, request: APIRequestContext) => (typeof target.path === 'string' ? target.path : target.path(request))

/** Vérifie les balises de référencement d'une page (assertions « souples » : tous les écarts sont listés). */
async function checkPage(page: Page, request: APIRequestContext, path: string, target: Omit<Target, 'path' | 'name'>, label: string) {
  const c = await crawl(page, path)
  const soft = (what: string) => `${label} (${path}) — ${what}`
  expect.soft(c.status, soft('statut')).toBe(200)
  expect.soft(c.lang, soft('attribut lang de <html>')).toMatch(/^fr\b/)
  expect.soft(c.title, soft('<title>')).toMatch(/\S.*Swatter TV Info|Swatter TV Info.*\S/)
  const description = c.meta.description ?? ''
  expect.soft(description.length, soft(`longueur de la description « ${description} »`)).toBeGreaterThanOrEqual(50)
  expect.soft(description.length, soft('description de 300 caractères au plus')).toBeLessThanOrEqual(300)
  expect.soft(c.meta.viewport ?? '', soft('balise viewport')).toContain('width=device-width')

  // une seule adresse canonique, absolue, celle de la page
  const canonical = absolute(target.canonical ?? path.split('?')[0])
  expect.soft(c.canonical.map(normalize), soft('adresse canonique')).toEqual([canonical])
  expect.soft(isNoindex(c), soft(`balise robots « ${c.robots.join(' | ')} »`)).toBe(Boolean(target.noindex))

  // Open Graph et carte Twitter : titre, description, adresse (= canonique), langue, image accessible
  expect.soft(c.meta['og:title'] ?? '', soft('og:title')).toMatch(/\S/)
  expect.soft(c.meta['og:description'] ?? '', soft('og:description')).toMatch(/\S/)
  expect.soft(normalize(c.meta['og:url'] ?? ''), soft('og:url (même adresse que la canonique)')).toBe(canonical)
  expect.soft(c.meta['og:type'] ?? '', soft('og:type')).toMatch(/\S/)
  expect.soft(c.meta['og:locale'], soft('og:locale')).toBe('fr_FR')
  expect.soft(c.meta['og:site_name'], soft('og:site_name')).toBe('Swatter TV Info')
  expect.soft(c.meta['twitter:card'], soft('twitter:card')).toBe('summary_large_image')
  const image = c.meta['og:image'] ?? ''
  expect.soft(image, soft('og:image : adresse absolue')).toMatch(/^https?:\/\//)
  if (/^https?:\/\//.test(image)) {
    const res = await request.get(image)
    expect.soft(res.status(), soft(`og:image accessible (${image})`)).toBe(200)
    expect.soft(res.headers()['content-type'] ?? '', soft(`og:image est une image (${image})`)).toMatch(/^image\//)
    expect.soft((await res.body()).length, soft(`og:image non vide (${image})`)).toBeGreaterThan(1000)
  }

  // données structurées : JSON valide, schema.org, propriétés et adresses ; le site (TelevisionStation) sur chaque page
  const { types, problems } = readJsonLd(c.jsonLd)
  expect.soft(problems, soft('données structurées JSON-LD')).toEqual([])
  for (const t of ['TelevisionStation', 'WebSite', ...(target.types ?? [])]) expect.soft(types, soft(`JSON-LD de type ${t}`)).toContain(t)

  // un seul titre de niveau 1, non vide
  expect.soft(c.h1.length, soft(`nombre de <h1> (${c.h1.join(' | ')})`)).toBe(1)
  expect.soft(c.h1[0] ?? '', soft('texte du <h1>')).toMatch(/\S/)
  return c
}

test.describe('référencement des pages principales (HTML du serveur)', () => {
  for (const target of MAIN) {
    test(`${target.name} : titre, description, canonique, Open Graph, JSON-LD, h1 et langue`, async ({ page, request }) => {
      const path = await resolve(target, request)
      test.skip(!path, `aucun contenu pour « ${target.name} » (lancez npm run seed)`)
      await checkPage(page, request, path!, target, target.name)
    })
  }

  test('chaque page principale a un titre qui lui est propre', async ({ page, request }) => {
    const pages = ['/canaux-de-reception', '/credits', '/le-groupe', '/vie-privee', '/meteo/savoie', '/webcams/isere', '/info/rhone']
    for (const target of MAIN) {
      const path = await resolve(target, request)
      if (path) pages.push(path)
    }
    const titles = new Map<string, string[]>()
    for (const path of pages) {
      const { status, title } = await crawl(page, path)
      if (status !== 200) continue
      titles.set(title, [...(titles.get(title) ?? []), path])
    }
    const shared = [...titles].filter(([, paths]) => paths.length > 1).map(([title, paths]) => `« ${title} » : ${paths.join(', ')}`)
    expect(shared, 'titres partagés par plusieurs pages').toEqual([])
    expect(titles.size, 'pages lues').toBeGreaterThanOrEqual(15)
  })

  test('page introuvable : statut 404, non indexée, avec titre (HTML du serveur), langue, h1 et liens (une fois affichée)', async ({ page, browser }) => {
    const c = await crawl(page, '/cette-page-n-existe-pas-42')
    expect.soft(c.status, 'statut').toBe(404)
    expect.soft(isNoindex(c), `balises robots « ${c.robots.join(' | ')} »`).toBe(true)
    expect.soft(c.title, '<title>').toMatch(/introuvable/i)
    expect.soft(c.canonical, 'pas d’adresse canonique pour une page introuvable').toEqual([])
    // Next.js 16 envoie le contenu d'une page notFound() dans les données de la page, affiché par le navigateur (le HTML du
    // serveur n'en contient que l'en-tête : statut, titre, noindex ; voir DEV_NOTES, « Pages introuvables »). Contenu vérifié
    // une fois la page affichée, comme le voient les visiteurs et Google (qui exécute le JavaScript)
    const context = await browser.newContext({ baseURL: SITE, javaScriptEnabled: true, locale: 'fr-FR' })
    try {
      const shown = await context.newPage()
      expect((await shown.goto('/cette-page-n-existe-pas-42'))?.status(), 'statut (navigateur)').toBe(404)
      await expect(shown.locator('h1')).toHaveText(['Cette page est introuvable'])
      expect.soft(await shown.locator('html').getAttribute('lang'), 'attribut lang de <html>').toMatch(/^fr\b/)
      await expect.soft(shown.locator('main a[href="/"]').first(), 'lien de retour à l’accueil').toBeVisible()
      await expect.soft(shown.locator('main a[href="/recherche"]').first(), 'lien vers la recherche').toBeVisible()
    } finally {
      await context.close()
    }
  })
})

/* ----- Plan du site et robots.txt ----- */

type SitemapEntry = { loc: string; lastmod?: string }

async function readSitemap(request: APIRequestContext): Promise<{ xml: string; contentType: string; entries: SitemapEntry[]; namespace: string }> {
  const res = await request.get('/sitemap.xml')
  expect(res.status(), 'statut de /sitemap.xml').toBe(200)
  const xml = await res.text()
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml) as {
    urlset?: { '@xmlns'?: string; url?: SitemapEntry | SitemapEntry[] }
  }
  const urls = parsed.urlset?.url
  return {
    xml,
    contentType: res.headers()['content-type'] ?? '',
    entries: urls ? ([] as SitemapEntry[]).concat(urls) : [],
    namespace: parsed.urlset?.['@xmlns'] ?? '',
  }
}

/** Chemins jamais publiés dans le plan du site (administration, API, espace membres, recherche, aperçu). */
const PRIVATE = /^\/(admin|api|compte|connexion|inscription|mot-de-passe-oublie|recherche|apercu)(\/|$)/

test.describe('plan du site et robots.txt', () => {
  test('plan du site : XML valide (protocole sitemaps.org), adresses absolues du site, sans doublon', async ({ request }) => {
    const { xml, contentType, entries, namespace } = await readSitemap(request)
    expect(contentType, 'type du document').toMatch(/^(application|text)\/xml/)
    expect(XMLValidator.validate(xml), 'XML bien formé').toBe(true)
    expect(namespace, 'espace de noms du protocole').toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
    expect(entries.length, 'adresses listées').toBeGreaterThanOrEqual(10)
    expect(entries.length, '50 000 adresses au plus par fichier').toBeLessThanOrEqual(50_000)
    const locs = entries.map((e) => String(e.loc ?? ''))
    expect(locs.filter((loc) => new URL(loc, 'http://x').origin !== SITE || !/^https?:\/\//.test(loc)), 'adresses absolues du site').toEqual([])
    expect(locs.filter((loc, i) => locs.indexOf(loc) !== i), 'adresses en double').toEqual([])
    expect(locs.filter((loc) => /[?#]/.test(loc)), 'adresses avec paramètres ou ancre').toEqual([])
    const soon = Date.now() + 60_000
    const badDates = entries.filter((e) => e.lastmod !== undefined && (Number.isNaN(Date.parse(String(e.lastmod))) || Date.parse(String(e.lastmod)) > soon))
    expect(badDates, 'dates de modification (lastmod) valides et passées').toEqual([])
  })

  test('plan du site : ni l’administration, ni l’API, ni l’espace membres, ni la recherche', async ({ request }) => {
    const { entries } = await readSitemap(request)
    const paths = entries.map((e) => new URL(String(e.loc)).pathname)
    expect(paths.filter((p) => PRIVATE.test(p)), 'adresses privées dans le plan du site').toEqual([])
  })

  test('plan du site : chaque adresse répond 200, indexable, avec sa propre adresse canonique', async ({ page, request }) => {
    test.setTimeout(180_000)
    const { entries } = await readSitemap(request)
    const problems: string[] = []
    /** Contenu supprimé entre-temps par un autre test : le plan du site, régénéré à chaque publication, ne le liste plus. */
    const removed = async (url: string) => !(await readSitemap(request)).entries.some((e) => String(e.loc) === url)
    for (const { loc } of entries) {
      const url = String(loc)
      // réponse directe, sans redirection
      const res = await request.get(url, { maxRedirects: 0 })
      if (res.status() !== 200) {
        if (res.status() !== 404 || !(await removed(url))) problems.push(`${url} : statut ${res.status()}`)
        continue
      }
      const c = await crawl(page, url)
      if (c.status !== 200) {
        if (c.status !== 404 || !(await removed(url))) problems.push(`${url} : statut ${c.status}`)
        continue
      }
      if (isNoindex(c)) problems.push(`${url} : non indexable (${c.robots.join(' | ')})`)
      if (c.canonical.map(normalize).join(' ') !== normalize(url)) problems.push(`${url} : adresse canonique « ${c.canonical.join(' ') || 'absente'} »`)
    }
    expect(problems, 'adresses du plan du site').toEqual([])
  })

  test('plan du site : les pages principales indexables y figurent', async ({ request }) => {
    const { entries } = await readSitemap(request)
    const listed = new Set(entries.map((e) => normalize(String(e.loc))))
    const expected = ['/', '/direct', '/videos', '/info', '/meteo', '/programme-tv', '/agenda', '/webcams', '/replay', '/contact']
    for (const target of MAIN.filter((t) => !t.noindex && typeof t.path !== 'string')) {
      const path = await resolve(target, request)
      if (path) expected.push(path)
    }
    const pages = ((await (await request.get('/api/pages?limit=100&depth=0')).json()) as { docs: { slug?: string | null }[] }).docs
    for (const p of pages) if (p.slug) expected.push(`/${p.slug}`)
    expect(expected.filter((path) => !listed.has(absolute(path))), 'pages principales absentes du plan du site').toEqual([])
  })

  test('robots.txt : règles pour tous les robots, parties privées fermées, plan du site annoncé', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type'] ?? '').toMatch(/^text\/plain/)
    const lines = (await res.text())
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean)
    const field = (name: string) => lines.filter((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`)).map((l) => l.slice(name.length + 1).trim())
    expect(field('User-Agent')).toEqual(['*'])
    const allow = field('Allow')
    const disallow = field('Disallow')
    for (const path of ['/admin', '/api/', '/recherche', '/compte', '/connexion', '/inscription', '/mot-de-passe-oublie']) {
      expect(disallow, `Disallow: ${path}`).toContain(path)
    }
    expect(allow, 'les fichiers de la médiathèque (images des pages, Open Graph) restent accessibles').toContain('/api/media/file/')

    // règle la plus longue qui correspond (Google) : les pages publiques et les images de partage sont ouvertes
    const allowed = (path: string) => {
      const match = (rules: string[]) => Math.max(-1, ...rules.filter((r) => path.startsWith(r)).map((r) => r.length))
      return match(allow) >= match(disallow)
    }
    const publicPaths = '/ /direct /videos /info /info/haute-savoie /meteo /programme-tv /agenda /webcams /replay /contact /mentions-legales'.split(' ')
    expect(publicPaths.filter((p) => !allowed(p)), 'pages publiques fermées aux robots').toEqual([])
    const privatePaths = ['/admin', '/api/videos', '/compte/ma-liste', '/connexion', '/recherche']
    expect(privatePaths.filter((p) => allowed(p)), 'parties privées ouvertes aux robots').toEqual([])
    const home = await (await request.get('/')).text()
    const ogImage = home.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
    expect(ogImage, 'image de partage de l’accueil').toBeTruthy()
    expect(allowed(new URL(ogImage!.replace(/&amp;/g, '&')).pathname), `image de partage ouverte aux robots (${ogImage})`).toBe(true)
    expect(allowed('/api/media/file/exemple.jpg'), 'images de la médiathèque ouvertes aux robots').toBe(true)

    // plan du site : adresse absolue du site, qui répond
    const sitemaps = field('Sitemap')
    expect(sitemaps).toEqual([`${SITE}/sitemap.xml`])
    expect((await request.get(sitemaps[0])).status()).toBe(200)
  })
})

/* ----- En-têtes de sécurité ----- */

test('en-têtes de sécurité sur les pages, l’API, les fichiers et les erreurs', async ({ request }) => {
  const home = await (await request.get('/')).text()
  const chunk = home.match(/\/_next\/static\/[^"']+\.js/)?.[0]
  const ogImage = home.match(/<meta property="og:image" content="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&')
  const article = await firstDoc(request, 'articles')
  const urls = [
    '/',
    '/direct',
    article ? `/info/${article.department}/${article.slug}` : '/info',
    '/connexion',
    '/cette-page-n-existe-pas-42',
    '/api/videos?limit=1&depth=0',
    '/api/compte/moi',
    '/sitemap.xml',
    '/robots.txt',
    '/admin/login',
    '/favicon.png',
    '/visuels/t-hiver-a.webp',
    ...(chunk ? [chunk] : []),
    ...(ogImage ? [ogImage] : []),
  ]
  const problems: string[] = []
  for (const url of urls) {
    const res = await request.get(url, { maxRedirects: 0 })
    const h = res.headers()
    const check = (name: string, ok: (value: string) => boolean) => {
      if (!ok(h[name] ?? '')) problems.push(`${url} (${res.status()}) : ${name} = « ${h[name] ?? 'absent'} »`)
    }
    check('x-content-type-options', (v) => v.toLowerCase() === 'nosniff')
    check('referrer-policy', (v) => ['strict-origin-when-cross-origin', 'strict-origin', 'same-origin', 'no-referrer'].includes(v))
    check('x-frame-options', (v) => ['SAMEORIGIN', 'DENY'].includes(v.toUpperCase()))
    check('permissions-policy', (v) => ['camera=()', 'microphone=()', 'geolocation=()'].every((p) => v.replace(/\s/g, '').includes(p)))
    check('strict-transport-security', (v) => Number(v.match(/max-age=(\d+)/)?.[1] ?? 0) >= 31_536_000)
    if (h['x-powered-by']) problems.push(`${url} : en-tête X-Powered-By « ${h['x-powered-by']} »`)
  }
  expect(problems, 'en-têtes de sécurité manquants ou incorrects').toEqual([])
})

/* ----- Espace membres ----- */

test.describe('espace membres : pages non indexées', () => {
  /** noindex et nofollow, jamais en cache partagé, et pas d'adresse canonique vers une autre page (l'accueil…). */
  function expectPrivate(c: Crawl, path: string) {
    expect.soft(c.status, `${path} : statut`).toBe(200)
    const robots = c.robots.join(' ')
    expect.soft(robots, `${path} : balise robots`).toMatch(/noindex/)
    expect.soft(robots, `${path} : balise robots`).toMatch(/nofollow/)
    expect.soft(c.headers['cache-control'] ?? '', `${path} : Cache-Control`).toMatch(/private|no-store/)
    const self = absolute(path.split('?')[0])
    expect.soft(c.canonical.filter((href) => normalize(href) !== self), `${path} : adresse canonique d’une autre page`).toEqual([])
  }

  test('connexion, inscription, mot de passe oublié et nouveau mot de passe', async ({ page }) => {
    for (const path of ['/connexion', '/inscription', '/mot-de-passe-oublie', '/compte/nouveau-mot-de-passe?token=lien-de-test']) {
      expectPrivate(await crawl(page, path), path)
    }
    // le lien du « mot de passe oublié » porte un jeton secret : il ne doit pas partir vers un autre site
    const c = await crawl(page, '/compte/nouveau-mot-de-passe?token=lien-de-test')
    expect(c.meta.referrer, 'politique de référent de la page du jeton').toBe('no-referrer')
  })

  test('« Mon espace » d’un membre connecté', async ({ page }) => {
    const { password } = await signupMember(page.request, 'Lou')
    try {
      for (const path of ['/compte', '/compte/ma-liste', '/compte/historique', '/compte/profil']) {
        const c = await crawl(page, path)
        expect(new URL(page.url()).pathname, `${path} : page ouverte (membre connecté)`).toBe(path)
        expectPrivate(c, path)
      }
    } finally {
      await deleteMember(page.request, password)
    }
  })
})

/* ----- Page d'une vidéo ----- */

test.describe('référencement de la page d’une vidéo (vidéo YouTube créée pour le test)', () => {
  test.describe.configure({ mode: 'serial' })

  let admin: AdminApi | null = null
  test.beforeAll(async () => {
    admin = await AdminApi.open()
    test.skip(!admin, 'identifiants administrateur indisponibles (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)')
  })
  test.afterAll(async () => {
    await admin?.dispose()
  })

  test('une vidéo : balises, VideoObject avec le lecteur YouTube, et présence dans le plan du site', async ({ page, request }) => {
    const title = `Test e2e référencement ${unique('video')}`
    const video = await admin!.createYoutubeVideo(title)
    const path = `/videos/${video.slug}`
    try {
      const c = await checkPage(page, request, path, { types: ['VideoObject'] }, 'une vidéo')
      expect.soft(c.title, 'titre de la page').toBe(`${title} — Swatter TV Info`)
      expect.soft(c.meta['og:type'], 'og:type').toBe('video.other')
      const videoObject = c.jsonLd
        .flatMap((text) => ([] as Json[]).concat(JSON.parse(text) as Json))
        .find((item) => item['@type'] === 'VideoObject')
      expect.soft(videoObject?.name, 'VideoObject : nom').toBe(title)
      expect.soft(videoObject?.embedUrl, 'VideoObject : lecteur YouTube').toBe('https://www.youtube.com/embed/e2eSwatTV01')
      expect.soft(videoObject?.url, 'VideoObject : adresse de la page').toBe(absolute(path))
      const { entries } = await readSitemap(request)
      expect.soft(entries.map((e) => normalize(String(e.loc))), 'vidéo publiée dans le plan du site').toContain(absolute(path))
    } finally {
      await admin!.remove('videos', video.id)
    }
  })
})
