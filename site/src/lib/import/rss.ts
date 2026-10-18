// Import des flux RSS (agent « info ») : lit les flux actifs de la collection rss-feeds et crée dans « L’Info »
// les articles qui manquent (source « rss »), sans doublon (champ guid). Appelé par GET /api/cron/import et src/scripts/import.ts.
import { XMLParser } from 'fast-xml-parser'
import type { Payload } from 'payload'
import { slugify } from '@/lib/slugify'
import type { RssFeed } from '@/payload-types'

export type ImportResult = { created: number; skipped: number; errors: string[] }

/** Élément d'un flux, prêt à devenir un article. */
export type FeedItem = {
  /** Identifiant de l'élément : guid (RSS) ou id (Atom), à défaut le lien */
  guid: string
  title: string
  link: string | null
  /** Chapô : description sans HTML ni entités, tronquée proprement */
  excerpt: string
  imageUrl: string | null
  /** ISO 8601 ; null si la date est absente ou illisible */
  publishedAt: string | null
}

export type ParsedFeed = { title: string | null; items: FeedItem[] }

const MAX_ITEMS = 20
const EXCERPT_MAX = 300
const TITLE_MAX = 200
const TIMEOUT_MS = 10_000
const MAX_BYTES = 5 * 1024 * 1024
/** Flux traités en parallèle */
const CONCURRENCY = 4
const USER_AGENT = 'SwatterTV-RSS/1.0 (+https://www.swatter-tv.fr)'

/* ----- Analyse (fonctions pures) ----- */

type Obj = Record<string, unknown>

const ARRAYS = new Set(['item', 'entry', 'link', 'enclosure', 'media:content', 'media:thumbnail', 'media:group'])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // valeurs gardées en texte (un guid « 12345 » ne devient pas un nombre)
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // entités XML décodées, avec les limites d'expansion par défaut de la bibliothèque
  processEntities: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ARRAYS.has(name),
})

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const first = (v: unknown): unknown => list(v)[0]
const attr = (v: unknown, name: string): string => {
  const a = isObj(v) ? v[`@_${name}`] : undefined
  return typeof a === 'string' ? a.trim() : ''
}

/** Texte d'un nœud : chaîne, ou objet avec #text ; pour un contenu XHTML analysé, tout le texte qu'il contient. */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(textOf).join(' ')
  if (isObj(v)) {
    return Object.entries(v)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, x]) => textOf(x))
      .join(' ')
  }
  return ''
}

/** HTML d'un nœud (description, content:encoded, contenu Atom de type html) ; vide pour un contenu XHTML analysé. */
function htmlOf(v: unknown): string {
  const n = first(v)
  if (typeof n === 'string') return n
  return isObj(n) && typeof n['#text'] === 'string' ? n['#text'] : ''
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', shy: '', thinsp: ' ', ensp: ' ', emsp: ' ',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', hellip: '…', ndash: '–',
  mdash: '—', middot: '·', bull: '•', euro: '€', pound: '£', deg: '°', copy: '©', reg: '®', trade: '™', times: '×',
  agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è', eacute: 'é',
  ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô',
  ouml: 'ö', otilde: 'õ', oslash: 'ø', oelig: 'œ', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
  szlig: 'ß', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Auml: 'Ä', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê',
  Euml: 'Ë', Icirc: 'Î', Iuml: 'Ï', Ocirc: 'Ô', Ouml: 'Ö', OElig: 'Œ', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü', Yuml: 'Ÿ', Ntilde: 'Ñ',
}

/** Entités HTML nommées (courantes) et numériques → caractères. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] !== '#') return ENTITIES[e] ?? m
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    const valid = code > 31 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && !(code >= 127 && code < 160)
    return valid ? String.fromCodePoint(code) : ''
  })
}

/** Espaces normalisés (les espaces insécables de la typographie française sont conservés). */
const squash = (s: string) => s.replace(/[^\S  ]+/g, ' ').trim()

const TAG = /<\/?[a-z][^>]*>/gi

/** HTML → texte brut : balises retirées (y compris le contenu des scripts et styles), entités décodées, espaces normalisés. */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style|noscript|iframe|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/?(p|div|li|ul|ol|h[1-6]|blockquote|figure|figcaption|tr|td|section|article)\b[^>]*>/gi, ' ')
    .replace(TAG, '')
  // HTML échappé deux fois (« &lt;p&gt; ») : les balises n'apparaissent qu'après décodage
  return squash(decodeEntities(stripped).replace(TAG, ' '))
}

/** Texte coupé sur un mot, sans ponctuation pendante, terminé par « … ». */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s ,;:.!?\-–—(«"'’]+$/u, '')}…`
}

/** Mentions ajoutées par les CMS en fin de description (« […] », « L’article … est apparu en premier sur … »). */
const cleanTail = (s: string) =>
  s
    .replace(/\s*(?:L[’']article|The post)\s.+?\s(?:est apparu en premier sur|appeared first on)\s.+$/i, '')
    .replace(/\s*\[(?:…|\.{3})\]\s*$/, '')
    .replace(/\s*(?:Lire la suite|Lire plus|Read more)\s*(?:…|\.{3})?\s*$/i, '')
    .trim()

/** Adresse absolue http(s) valide (relative résolue par rapport à `base`), sinon null. */
function absUrl(raw: string, base: string | null): string | null {
  const s = decodeEntities(raw.trim())
  if (!s) return null
  try {
    const u = new URL(s.startsWith('//') ? `https:${s}` : s, base ?? undefined)
    return /^https?:$/.test(u.protocol) && !/[\s"'<>]/.test(u.href) ? u.href : null
  } catch {
    return null
  }
}

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i
const isImage = (type: string, url: string) => (type ? type.toLowerCase().startsWith('image/') : IMAGE_EXT.test(url))

/** Première image d'un fragment HTML (hors pixels de suivi 1 × 1). */
function imgInHtml(html: string): string {
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    if (/\b(?:width|height)\s*=\s*["']?1["'\s/>]/i.test(tag)) continue
    const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]
    if (src && !src.startsWith('data:')) return src
  }
  return ''
}

/** Première image d'un contenu XHTML analysé. */
function imgInNode(v: unknown): string {
  for (const n of list(v)) {
    if (!isObj(n)) continue
    for (const [k, x] of Object.entries(n)) {
      if (k.startsWith('@_')) continue
      const found = k === 'img' ? attr(first(x), 'src') : imgInNode(x)
      if (found) return found
    }
  }
  return ''
}

/** Image d'un élément : enclosure, media:content, media:thumbnail, puis première <img> de la description ou du contenu. */
function itemImage(it: Obj, bodies: unknown[], base: string | null): string | null {
  const groups = list(it['media:group']).filter(isObj)
  const contents = [...list(it['media:content']), ...groups.flatMap((g) => list(g['media:content']))]
  const thumbs = [...list(it['media:thumbnail']), ...groups.flatMap((g) => list(g['media:thumbnail'])), ...contents.flatMap((c) => (isObj(c) ? list(c['media:thumbnail']) : []))]
  const atomEnclosures = list(it.link).filter((l) => attr(l, 'rel') === 'enclosure')
  const candidates = [
    ...list(it.enclosure).map((e) => (isImage(attr(e, 'type'), attr(e, 'url')) ? attr(e, 'url') : '')),
    ...atomEnclosures.map((l) => (isImage(attr(l, 'type'), attr(l, 'href')) ? attr(l, 'href') : '')),
    ...contents.map((c) => {
      const medium = attr(c, 'medium')
      return medium === 'image' || (!medium && isImage(attr(c, 'type'), attr(c, 'url'))) ? attr(c, 'url') : ''
    }),
    ...thumbs.map((t) => attr(t, 'url')),
    ...bodies.map((b) => imgInHtml(htmlOf(b)) || imgInNode(b)),
  ]
  for (const c of candidates) {
    const url = c && absUrl(c, base)
    if (url) return url
  }
  return null
}

const ZONES: Record<string, string> = { CEST: '+0200', CET: '+0100', BST: '+0100', UTC: '+0000', UT: '+0000', Z: '+0000' }

/** Date RSS (RFC 822) ou Atom (ISO 8601) → ISO 8601, ou null. */
function toIso(raw: string): string | null {
  const s = raw.trim().replace(/\b(CEST|CET|BST|UTC|UT)\b/, (z) => ZONES[z])
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Texte brut d'un champ (titre, description) : HTML et entités nettoyés. */
const plain = (v: unknown) => {
  const html = htmlOf(v)
  return html ? htmlToText(html) : squash(textOf(v))
}

function toItem(it: Obj, atom: boolean, base: string | null): FeedItem | null {
  const title = truncate(plain(it.title), TITLE_MAX)
  const links = list(it.link)
  const alternate = atom ? (links.find((l) => !attr(l, 'rel') || attr(l, 'rel') === 'alternate') ?? links[0]) : first(it.link)
  const link = absUrl(atom ? attr(alternate, 'href') || textOf(alternate) : textOf(alternate) || attr(alternate, 'href'), base)
  const guid = squash(textOf(first(atom ? it.id : it.guid)) || textOf(it['dc:identifier'])) || link
  if (!title || !guid) return null

  const bodies = atom ? [it.summary, it.content] : [it.description, it['content:encoded']]
  const excerpt = truncate(cleanTail(bodies.map(plain).find(Boolean) ?? ''), EXCERPT_MAX)
  const date = [it.pubDate, it.published, it.updated, it['dc:date']].map(textOf).find((d) => d.trim()) ?? ''
  return { guid: guid.slice(0, 500), title, link, excerpt, imageUrl: itemImage(it, bodies, link ?? base), publishedAt: toIso(date) }
}

/**
 * Analyse un flux RSS 2.0, RSS 1.0 (RDF) ou Atom. Fonction pure : aucune requête, aucune écriture.
 * Renvoie le titre du flux et ses `limit` premiers éléments exploitables (titre et identifiant présents).
 * Lève une erreur si le document n'est ni du RSS ni de l'Atom.
 */
export function parseFeed(xml: string, limit = MAX_ITEMS): ParsedFeed {
  const doc: unknown = parser.parse(xml.replace(/^﻿/, ''))
  if (!isObj(doc)) throw new Error('flux illisible')
  const rss = first(doc.rss)
  const rdf = first(doc['rdf:RDF'])
  const feed = first(doc.feed)

  let channel: unknown
  let entries: unknown[]
  let atom = false
  if (isObj(rss)) {
    channel = first(rss.channel)
    entries = isObj(channel) ? list(channel.item) : []
  } else if (isObj(rdf)) {
    channel = first(rdf.channel)
    entries = list(rdf.item)
  } else if (isObj(feed)) {
    channel = feed
    entries = list(feed.entry)
    atom = true
  } else {
    throw new Error('format non reconnu (ni RSS ni Atom)')
  }

  const head = isObj(channel) ? channel : {}
  const links = list(head.link)
  const home = atom ? attr(links.find((l) => attr(l, 'rel') === 'alternate') ?? links.find((l) => !attr(l, 'rel')), 'href') : textOf(first(head.link))
  const base = absUrl(home, null)
  const items = entries
    .slice(0, limit)
    .filter(isObj)
    .map((e) => toItem(e, atom, base))
    .filter((i): i is FeedItem => i !== null)
  return { title: plain(head.title) || null, items }
}

/* ----- Import (réseau et base) ----- */

/** Message d'erreur lisible (délai dépassé, connexion impossible…). */
function errorMessage(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return `délai de réponse dépassé (${TIMEOUT_MS / 1000} s)`
  if (e.message === 'fetch failed') {
    const code = (e.cause as { code?: unknown } | undefined)?.code
    return `connexion impossible${typeof code === 'string' ? ` (${code})` : ''}`
  }
  return e.message
}

/** Décodage selon le jeu de caractères annoncé (en-tête HTTP, sinon déclaration XML) : beaucoup de flux sont en ISO-8859-1. */
function decode(buf: ArrayBuffer, contentType: string | null): string {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 256))
  const charset = /charset=["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1] ?? /<\?xml[^>]*\bencoding=["']([\w.:-]+)["']/i.exec(head)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

/** Corps de la réponse, lu au fil de l'eau et abandonné au-delà de MAX_BYTES (réponse compressée ou sans Content-Length). */
async function readCapped(res: Response): Promise<ArrayBuffer> {
  const reader = res.body?.getReader()
  if (!reader) return new ArrayBuffer(0)
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error('flux trop volumineux')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out.buffer
}

async function fetchFeed(url: string): Promise<string> {
  const target = absUrl(url, null)
  if (!target) throw new Error('adresse du flux invalide (http ou https attendu)')
  const res = await fetch(target, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`réponse HTTP ${res.status}`)
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('flux trop volumineux')
  return decode(await readCapped(res), res.headers.get('content-type'))
}

/**
 * Clé de dédoublonnage enregistrée dans le champ unique `guid`. Un identifiant qui n'est ni une adresse ni un URN
 * (ex. « 12345 ») est préfixé par le domaine du flux, pour ne pas entrer en collision avec celui d'un autre site.
 */
function guidKey(guid: string, feedUrl: string): string {
  if (guid.includes(':')) return guid
  try {
    return `${new URL(feedUrl).host}#${guid}`.slice(0, 500)
  } catch {
    return guid
  }
}

/** Adresse unique dérivée du titre (« titre », « titre-2 »…), assez courte pour que le suffixe survive à slugify (96 caractères). */
async function uniqueSlug(payload: Payload, title: string): Promise<string> {
  const base = slugify(title).slice(0, 80).replace(/-+$/, '') || 'info'
  const candidates = [base, ...Array.from({ length: 19 }, (_, i) => `${base}-${i + 2}`)]
  const { docs } = await payload.find({
    collection: 'articles',
    where: { slug: { in: candidates } },
    limit: candidates.length,
    pagination: false,
    depth: 0,
    select: { slug: true },
  })
  const taken = new Set(docs.map((d) => d.slug))
  return candidates.find((c) => !taken.has(c)) ?? `${base}-${Date.now().toString(36)}`
}

/** Éléments absents de la base (ni le même guid, ni le même lien d'origine), sans doublon dans le flux lui-même. */
async function newItems(payload: Payload, items: (FeedItem & { key: string })[]): Promise<(FeedItem & { key: string })[]> {
  if (!items.length) return []
  const keys = [...new Set(items.map((i) => i.key))]
  const links = [...new Set(items.map((i) => i.link).filter((l): l is string => Boolean(l)))]
  const { docs } = await payload.find({
    collection: 'articles',
    where: { or: [{ guid: { in: keys } }, ...(links.length ? [{ sourceUrl: { in: links } }] : [])] },
    limit: keys.length + links.length,
    pagination: false,
    depth: 0,
    select: { guid: true, sourceUrl: true },
  })
  const known = new Set(docs.flatMap((d) => [d.guid, d.sourceUrl]).filter(Boolean))
  return items.filter((i) => {
    if (known.has(i.key) || (i.link && known.has(i.link))) return false
    known.add(i.key)
    if (i.link) known.add(i.link)
    return true
  })
}

async function guidExists(payload: Payload, key: string): Promise<boolean> {
  const { totalDocs } = await payload.count({ collection: 'articles', where: { guid: { equals: key } } })
  return totalDocs > 0
}

async function importFeed(payload: Payload, feed: RssFeed): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] }
  let lastError: string | null = null
  try {
    const { items } = parseFeed(await fetchFeed(feed.url))
    const keyed = items.map((i) => ({ ...i, key: guidKey(i.guid, feed.url) }))
    const fresh = await newItems(payload, keyed)
    result.skipped += keyed.length - fresh.length
    const now = Date.now()
    for (const item of fresh) {
      try {
        // date à venir (fuseau mal déclaré par le flux) : ramenée à l'heure de l'import pour que l'article soit visible
        const published = item.publishedAt && Date.parse(item.publishedAt) < now ? item.publishedAt : new Date(now).toISOString()
        await payload.create({
          collection: 'articles',
          data: {
            // publié aussitôt (la collection a des brouillons : sans statut, l'article resterait en brouillon)
            _status: 'published',
            title: item.title,
            slug: await uniqueSlug(payload, item.title),
            excerpt: item.excerpt || null,
            imageUrl: item.imageUrl,
            department: feed.department,
            city: feed.city?.trim() || null,
            kicker: feed.kicker?.trim() || null,
            publishedAt: published,
            isInfoOfDay: false,
            source: 'rss',
            sourceName: feed.name,
            sourceUrl: item.link,
            guid: item.key,
          },
          depth: 0,
          context: { disableRevalidate: true },
        })
        result.created++
      } catch (e) {
        // importé entre-temps (deux imports simultanés) : ce n'est pas une erreur
        if (await guidExists(payload, item.key).catch(() => false)) result.skipped++
        else result.errors.push(`${feed.name} : « ${item.title} » non importé (${errorMessage(e)})`)
      }
    }
    if (result.errors.length) lastError = `${result.errors.length} article(s) non importé(s) : ${result.errors[0]}`
  } catch (e) {
    lastError = errorMessage(e)
    result.errors.push(`${feed.name} : ${lastError}`)
  }

  try {
    await payload.update({
      collection: 'rss-feeds',
      id: feed.id,
      data: { lastFetchedAt: new Date().toISOString(), lastError: lastError ? lastError.slice(0, 500) : null },
      depth: 0,
      context: { disableRevalidate: true },
    })
  } catch (e) {
    result.errors.push(`${feed.name} : état du flux non enregistré (${errorMessage(e)})`)
  }
  return result
}

/**
 * Importe les flux actifs : 20 éléments au plus par flux, dédoublonnés par guid (repli sur le lien).
 * Un flux en erreur n'arrête pas les autres : son erreur est enregistrée (lastError) et renvoyée dans `errors`.
 * Les pages ne sont pas régénérées article par article (context.disableRevalidate) : l'appelant s'en charge.
 */
export async function importRss(payload: Payload): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] }
  const { docs: feeds } = await payload.find({
    collection: 'rss-feeds',
    where: { active: { equals: true } },
    limit: 200,
    pagination: false,
    depth: 0,
  })
  for (let i = 0; i < feeds.length; i += CONCURRENCY) {
    const done = await Promise.all(feeds.slice(i, i + CONCURRENCY).map((feed) => importFeed(payload, feed)))
    for (const r of done) {
      result.created += r.created
      result.skipped += r.skipped
      result.errors.push(...r.errors)
    }
  }
  return result
}
