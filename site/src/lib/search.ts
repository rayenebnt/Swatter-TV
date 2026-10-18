// Recherche (GET /api/search?q= et page /recherche) : vidéos, replays, articles, agenda, émissions et webcams.
import type { Payload, Where } from 'payload'
import { cleanQuery, foldText, splitWords } from '@/components/search/text'
import { labelOf, PROGRAM_GENRES, VIDEO_CATEGORIES } from './categories'
import { departmentLabel } from './departments'
import { formatDate, formatDayLong, parisDateTime, parisDay } from './format'
import { mediaUrl } from './media'
import { safe } from './safe'
import { articleUrl, eventUrl, programUrl, replayUrl, videoUrl, webcamUrl } from './urls'

export type SearchHit = {
  type: 'video' | 'replay' | 'article' | 'event' | 'program' | 'webcam'
  typeLabel: string
  title: string
  subtitle: string
  href: string
  image: string | null
}

/**
 * Résultat avant tri : `tier` (0 = titre qui commence par la requête … 4 = autres champs), puis `key` (récence, décroissante) ;
 * `strict` : chaque mot de la requête commence un mot du texte (« lac » dans « Lac d’Annecy », pas dans « place »).
 */
type Ranked = { hit: SearchHit; tier: number; key: number; strict: boolean }

/** Mot de la requête : motif SQL exact (accents saisis conservés) et motif élargi aux formes accentuées. */
type Term = { exact: string; fuzzy: string }

type Ctx = {
  payload: Payload
  terms: Term[]
  /** Mots pliés (sans casse ni accents) : filtre final et classement */
  words: string[]
  phrase: string
  /** Faut-il aussi lancer la requête élargie ? */
  fuzzy: boolean
  take: number
  now: number
  /** Documents dont tous les mots de la requête commencent un mot (voir collect) */
  strict: WeakSet<object>
}

/** Échappe les caractères spéciaux de LIKE (% _ \) ; l'apostrophe (droite ou courbe) devient « _ » (un caractère quelconque). */
function likeExact(word: string): string {
  let out = ''
  for (const ch of word) out += ch === "'" || ch === '’' ? '_' : /[\\%_]/.test(ch) ? `\\${ch}` : ch
  return out
}

/** Motif élargi : voyelles et « c » remplacés par « _ » (« meteo » → « m_t__ » trouve « Météo ») ; le filtre final trie ensuite. */
function likeFuzzy(folded: string): string {
  let out = ''
  for (const ch of folded) out += /[aeiouc']/.test(ch) ? '_' : /[\\%_]/.test(ch) ? `\\${ch}` : ch
  return out
}

function buildTerms(q: string): { terms: Term[]; words: string[] } {
  const clean = cleanQuery(q)
  const raw = splitWords(clean.toLowerCase())
  const folded = splitWords(foldText(clean))
  const terms: Term[] = []
  const words: string[] = []
  folded.forEach((w, i) => {
    if (words.includes(w) || words.length >= 6) return
    words.push(w)
    // Les deux découpages sont alignés (même nombre de mots) ; sinon, repli sur la forme pliée
    terms.push({ exact: likeExact(raw.length === folded.length ? raw[i] : w), fuzzy: likeFuzzy(w) })
  })
  return { terms, words }
}

/** Chaque mot doit figurer dans au moins un des champs (insensible à la casse : opérateur like de Payload). */
const textWhere = (fields: readonly string[], patterns: string[]): Where => ({
  and: patterns.map((p) => ({ or: fields.map((f) => ({ [f]: { like: p } })) })),
})

const both = (a: Where, b?: Where): Where => (b ? { and: [a, b] } : a)

/**
 * Candidats d'une collection : requête exacte, plus la requête élargie aux accents (lancée à part pour que ses
 * correspondances approximatives n'évincent pas les exactes de la limite), puis filtre final sans casse ni accents.
 */
async function collect<T extends { id: number }>(
  c: Ctx,
  label: string,
  fields: readonly string[],
  run: (where: Where) => Promise<T[]>,
  texts: (doc: T) => (string | null | undefined)[],
): Promise<T[]> {
  const variants = [c.terms.map((t) => t.exact)]
  if (c.fuzzy) variants.push(c.terms.map((t) => t.fuzzy))
  const lists = await Promise.all(variants.map((patterns) => safe(() => run(textWhere(fields, patterns)), [] as T[], `recherche (${label})`)))
  const seen = new Set<number>()
  const out: T[] = []
  for (const doc of lists.flat()) {
    if (seen.has(doc.id)) continue
    seen.add(doc.id)
    const hay = foldText(texts(doc).filter(Boolean).join('\n'))
    if (!c.words.every((w) => hay.includes(w))) continue
    if (c.words.every((w) => atWordStart(hay, w))) c.strict.add(doc)
    out.push(doc)
  }
  return out
}

/** Le mot commence-t-il un mot du texte (début, ou après un caractère qui n'est ni lettre ni chiffre) ? */
function atWordStart(hay: string, word: string): boolean {
  for (let i = hay.indexOf(word); i !== -1; i = hay.indexOf(word, i + 1)) if (i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1])) return true
  return false
}

/** 0 : le titre commence par la requête ; 1 : un mot du titre commence par elle ; 2 : le titre la contient ; 3 : tous les mots sont dans le titre ; 4 : autres champs. */
function tierOf(title: string, c: Ctx): number {
  const t = foldText(title)
  if (t.startsWith(c.phrase)) return 0
  let i = t.indexOf(c.phrase)
  if (i > 0) {
    for (; i !== -1; i = t.indexOf(c.phrase, i + 1)) if (!/[\p{L}\p{N}]/u.test(t[i - 1])) return 1
    return 2
  }
  return c.words.every((w) => t.includes(w)) ? 3 : 4
}

const line = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const iso = (ms: number) => new Date(ms).toISOString()
const time = (d?: string | null) => (d ? Date.parse(d) || 0 : 0)
/** Événement à venir : clé au-dessus de tout contenu passé, les plus proches d'abord. */
const upcomingKey = (now: number, start: number) => now + (4e12 - start)

async function searchVideos(c: Ctx): Promise<Ranked[]> {
  const docs = await collect(
    c,
    'vidéos',
    ['title', 'description'],
    (where) =>
      c.payload
        .find({
          collection: 'videos',
          where: both(where, { publishedAt: { less_than_equal: iso(c.now) } }),
          sort: '-publishedAt',
          limit: c.take,
          depth: 1,
          pagination: false,
          select: { title: true, slug: true, category: true, duration: true, thumbnail: true, publishedAt: true, description: true },
        })
        .then((r) => r.docs),
    (v) => [v.title, v.description],
  )
  return docs.map((v) => ({
    tier: tierOf(v.title, c),
    strict: c.strict.has(v),
    key: time(v.publishedAt),
    hit: {
      type: 'video',
      typeLabel: 'Vidéo',
      title: v.title,
      subtitle: line(labelOf(VIDEO_CATEGORIES, v.category), formatDate(v.publishedAt), v.duration),
      href: videoUrl(v),
      image: mediaUrl(v.thumbnail, 'thumb'),
    },
  }))
}

async function searchReplays(c: Ctx): Promise<Ranked[]> {
  const docs = await collect(
    c,
    'replays',
    ['title', 'description'],
    (where) =>
      c.payload
        .find({
          collection: 'replays',
          where: both(where, { broadcastAt: { less_than_equal: iso(c.now) } }),
          sort: '-broadcastAt',
          limit: c.take,
          depth: 1,
          pagination: false,
          select: { title: true, slug: true, program: true, thumbnail: true, broadcastAt: true, duration: true, description: true },
          populate: { programs: { title: true } },
        })
        .then((r) => r.docs),
    (r) => [r.title, r.description],
  )
  return docs.map((r) => ({
    tier: tierOf(r.title, c),
    strict: c.strict.has(r),
    key: time(r.broadcastAt),
    hit: {
      type: 'replay',
      typeLabel: 'Replay',
      title: r.title,
      subtitle: line(typeof r.program === 'object' && r.program ? r.program.title : null, formatDate(r.broadcastAt), r.duration),
      href: replayUrl(r),
      image: mediaUrl(r.thumbnail, 'thumb'),
    },
  }))
}

async function searchArticles(c: Ctx): Promise<Ranked[]> {
  const docs = await collect(
    c,
    'articles',
    ['title', 'excerpt', 'city', 'kicker'],
    (where) =>
      c.payload
        .find({
          collection: 'articles',
          where: both(where, { publishedAt: { less_than_equal: iso(c.now) } }),
          sort: '-publishedAt',
          limit: c.take,
          depth: 1,
          pagination: false,
          select: { title: true, slug: true, department: true, city: true, kicker: true, excerpt: true, image: true, publishedAt: true },
        })
        .then((r) => r.docs),
    (a) => [a.title, a.excerpt, a.city, a.kicker],
  )
  return docs.map((a) => ({
    tier: tierOf(a.title, c),
    strict: c.strict.has(a),
    key: time(a.publishedAt),
    hit: {
      type: 'article',
      typeLabel: 'Info',
      title: a.title,
      subtitle: line(a.city || departmentLabel(a.department), formatDate(a.publishedAt)),
      href: articleUrl(a),
      image: mediaUrl(a.image, 'thumb'),
    },
  }))
}

async function searchEvents(c: Ctx): Promise<Ranked[]> {
  const todayStart = parisDateTime(parisDay(new Date(c.now))).getTime()
  // À venir : pas encore terminé (ou, sans date de fin, commençant aujourd'hui ou plus tard) ; passé : l'inverse
  const upcoming: Where = {
    or: [{ endDate: { greater_than_equal: iso(c.now) } }, { and: [{ endDate: { exists: false } }, { startDate: { greater_than_equal: iso(todayStart) } }] }],
  }
  const past: Where = {
    or: [{ endDate: { less_than: iso(c.now) } }, { and: [{ endDate: { exists: false } }, { startDate: { less_than: iso(todayStart) } }] }],
  }
  const find = (extra: Where, sort: string, limit: number) => (where: Where) =>
    c.payload
      .find({
        collection: 'events',
        where: both(where, extra),
        sort,
        limit,
        depth: 1,
        pagination: false,
        select: { title: true, slug: true, startDate: true, endDate: true, city: true, place: true, description: true, poster: true },
      })
      .then((r) => r.docs)
  const fields = ['title', 'city', 'place', 'description'] as const
  type EventDoc = Awaited<ReturnType<ReturnType<typeof find>>>[number]
  const texts = (e: EventDoc) => [e.title, e.city, e.place, e.description]
  const [next, done] = await Promise.all([
    collect(c, 'agenda', fields, find(upcoming, 'startDate', c.take), texts),
    collect(c, 'agenda passé', fields, find(past, '-startDate', Math.ceil(c.take / 2)), texts),
  ])
  const today = parisDay(new Date(c.now))
  return [...next, ...done].map((e) => {
    const start = time(e.startDate)
    const end = time(e.endDate)
    const isUpcoming = end ? end >= c.now : start >= todayStart
    const startDay = parisDay(e.startDate)
    let when: string
    if (!isUpcoming) when = formatDate(e.startDate)
    else if (start < c.now && e.endDate && parisDay(e.endDate) !== startDay) when = `Jusqu’au ${formatDayLong(e.endDate)}`
    else when = startDay === today ? 'Aujourd’hui' : capitalize(formatDayLong(e.startDate))
    return {
      tier: tierOf(e.title, c),
      strict: c.strict.has(e),
      key: isUpcoming ? upcomingKey(c.now, start) : start,
      hit: { type: 'event', typeLabel: 'Agenda', title: e.title, subtitle: line(when, e.city), href: eventUrl(e), image: mediaUrl(e.poster, 'thumb') },
    }
  })
}

async function searchPrograms(c: Ctx): Promise<Ranked[]> {
  const docs = await collect(
    c,
    'émissions',
    ['title', 'synopsis'],
    (where) =>
      c.payload
        .find({
          collection: 'programs',
          where,
          sort: 'title',
          limit: c.take,
          depth: 1,
          pagination: false,
          select: { title: true, slug: true, genre: true, image: true, synopsis: true },
        })
        .then((r) => r.docs),
    (p) => [p.title, p.synopsis],
  )
  return docs.map((p) => ({
    tier: tierOf(p.title, c),
    strict: c.strict.has(p),
    // Émission (sans date) : au niveau des contenus du jour
    key: c.now,
    hit: {
      type: 'program',
      typeLabel: 'Émission',
      title: p.title,
      subtitle: line(labelOf(PROGRAM_GENRES, p.genre), 'Programme TV'),
      href: programUrl(p),
      image: mediaUrl(p.image, 'thumb'),
    },
  }))
}

/** Mots qui désignent les webcams elles-mêmes (sans accents) : « webcam Chamonix » → la webcam de Chamonix, « webcams » → toutes. */
const WEBCAM_WORDS = new Set(['webcam', 'webcams', 'cam', 'cams', 'camera', 'cameras'])
/** Petits mots ignorés à côté de « webcam » (« les webcams », « webcam du lac ») */
const FILLERS = new Set(['le', 'la', 'les', 'l', 'de', 'des', 'du', 'd', 'a', 'au', 'aux', 'en', 'sur', 'voir'])

async function searchWebcams(c: Ctx): Promise<Ranked[]> {
  // « webcam » n'est écrit ni dans le nom ni dans le lieu : ce mot est retiré de la requête des webcams
  if (!c.words.some((w) => WEBCAM_WORDS.has(w))) return findWebcams(c)
  const keep = c.words.map((w) => !WEBCAM_WORDS.has(w) && !FILLERS.has(w))
  const words = c.words.filter((_, i) => keep[i])
  // « webcams » seul : toutes les webcams
  if (!words.length) return findWebcams({ ...c, words: [], terms: [], phrase: '' }, true)
  return findWebcams({ ...c, words, terms: c.terms.filter((_, i) => keep[i]), phrase: words.join(' ') }, true)
}

/** `named` : la requête parlait de webcams (toutes les webcams trouvées passent alors en tête, comme un titre exact). */
async function findWebcams(c: Ctx, named = false): Promise<Ranked[]> {
  const where: Where = { or: [{ active: { equals: true } }, { active: { exists: false } }] }
  const select = { name: true, slug: true, place: true, image: true } as const
  const docs = c.words.length
    ? await collect(
        c,
        'webcams',
        ['name', 'place'],
        (text) => c.payload.find({ collection: 'webcams', where: both(text, where), sort: 'order', limit: c.take, depth: 1, pagination: false, select }).then((r) => r.docs),
        (w) => [w.name, w.place],
      )
    : await safe(() => c.payload.find({ collection: 'webcams', where, sort: 'order', limit: c.take, depth: 1, pagination: false, select }).then((r) => r.docs), [], 'recherche (webcams)')
  return docs.map((w, i) => ({
    tier: named ? 0 : tierOf(w.name, c),
    strict: named || c.strict.has(w),
    // ordre d'affichage de la page Webcams quand toutes sont demandées
    key: named ? c.now + (docs.length - i) : c.now,
    hit: { type: 'webcam', typeLabel: 'Webcam', title: w.name, subtitle: w.place || 'Webcam en images', href: webcamUrl(w), image: mediaUrl(w.image, 'thumb') },
  }))
}

/**
 * Recherche insensible à la casse et aux accents. Classement : titre qui commence par la requête, puis titre qui la
 * contient, puis autres champs ; à égalité, les événements à venir, les émissions et webcams, puis les contenus récents.
 */
export async function search(payload: Payload, q: string, limit = 8): Promise<SearchHit[]> {
  const { terms, words } = buildTerms(q)
  if (!words.length) return []
  const max = Math.min(Math.max(Math.floor(limit) || 8, 1), 100)
  const c: Ctx = {
    payload,
    terms,
    words,
    phrase: words.join(' '),
    // Requête élargie inutile si le motif ne change pas ou si l'internaute a lui-même saisi des accents
    fuzzy: terms.some((t) => t.fuzzy !== t.exact) && !terms.some((t) => /[^ -~]/.test(t.exact)),
    take: Math.min(Math.max(max * 3, 24), 150),
    now: Date.now(),
    strict: new WeakSet(),
  }
  const groups = await Promise.all([searchVideos(c), searchReplays(c), searchArticles(c), searchEvents(c), searchPrograms(c), searchWebcams(c)])
  const all = groups.flat()
  // Correspondances en début de mot seulement s'il y en a ; sinon, repli sur les correspondances partielles (« nnecy »)
  return (all.some((r) => r.strict) ? all.filter((r) => r.strict) : all)
    .sort((a, b) => a.tier - b.tier || b.key - a.key)
    .slice(0, max)
    .map((r) => r.hit)
}
