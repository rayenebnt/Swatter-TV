/**
 * Jeu de données de démonstration (idempotent).
 * Usage : npm run seed   (= payload run src/scripts/seed.ts)
 *
 * Supprime d'abord tous les contenus (jamais les utilisateurs), puis recrée médias, émissions,
 * grille sur 8 jours, vidéos, replays, articles, agenda, webcams, pages, réglages et météo.
 * Refuse de tourner en production, sauf SEED_FORCE=1.
 */
import config from '@payload-config'
import path from 'path'
import { getPayload, type CollectionSlug } from 'payload'
import { fileURLToPath } from 'url'

import { labelOf, PROGRAM_GENRES } from '@/lib/categories'
import { formatDayLong, formatTime, parisDateTime, parisDay } from '@/lib/format'
import { TIMEZONE } from '@/lib/site'
import { slugify } from '@/lib/slugify'
import { articleUrl, eventUrl, videoUrl } from '@/lib/urls'

import { ARTICLES } from './seed/articles'
import { EVENTS, type RelDay } from './seed/events'
import { lexical } from './seed/lexical'
import { MEDIA } from './seed/media'
import { demoForecast } from './seed/meteo'
import { PAGES, WEBCAMS } from './seed/pages'
import { daySlots, primeOf, PROGRAMS } from './seed/programs'
import { REPLAYS, VIDEOS } from './seed/videos'

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
  console.error('✖ Le jeu de démonstration efface tous les contenus : refusé en production (forcer avec SEED_FORCE=1).')
  process.exit(1)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const context = { disableRevalidate: true }
const payload = await getPayload({ config })
const log = (msg: string) => payload.logger.info(msg)

// ---------------------------------------------------------------------------------------------
// Outils de dates (jours civils de Paris au format AAAA-MM-JJ)
// ---------------------------------------------------------------------------------------------
const now = new Date()
const today = parisDay(now)
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()
/** Samedi qui vient (aujourd'hui si l'on est samedi). */
const saturday = addDays(today, (6 - weekday(today) + 7) % 7)
const relDay = (r: RelDay) => addDays(r.from === 'saturday' ? saturday : today, r.days)
const shortDate = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, day: 'numeric', month: 'short' }).format(d)
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Exécute `fn` sur chaque élément, `size` à la fois. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map((item, j) => fn(item, i + j)))))
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// 1. Nettoyage (jamais la collection users)
// ---------------------------------------------------------------------------------------------
const WIPE: CollectionSlug[] = ['redirects', 'schedule', 'replays', 'videos', 'articles', 'events', 'webcams', 'ads', 'pages', 'programs', 'rss-feeds', 'media']

// Les réglages référencent des médias (carrousel, direct) : on les détache avant de vider la médiathèque.
await payload.updateGlobal({
  slug: 'settings',
  data: { heroSlides: [], live: { provider: null, file: null }, livePoster: null },
  overrideAccess: true,
  context,
})

for (const collection of WIPE) {
  for (let pass = 0; pass < 100; pass++) {
    const { totalDocs } = await payload.count({ collection, overrideAccess: true })
    if (totalDocs === 0) break
    await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true, context })
  }
}
log('Contenus existants supprimés.')

// ---------------------------------------------------------------------------------------------
// 2. Médias
// ---------------------------------------------------------------------------------------------
const media = new Map<string, number>()
await inBatches(MEDIA, 4, async (m) => {
  const doc = await payload.create({
    collection: 'media',
    data: { alt: m.alt, credit: m.credit },
    filePath: path.join(ROOT, m.file),
    overrideAccess: true,
    context,
  })
  media.set(m.key, doc.id)
})
const mediaId = (key: string): number => {
  const id = media.get(key)
  if (id === undefined) throw new Error(`Média inconnu : ${key}`)
  return id
}
const upload = (clip: string) => ({ provider: 'upload' as const, file: mediaId(clip) })
log(`${media.size} médias importés.`)

// ---------------------------------------------------------------------------------------------
// 3. Émissions et grille des programmes (8 jours à partir d'hier 00:00, heure de Paris)
// ---------------------------------------------------------------------------------------------
const programs = new Map<string, number>()
for (const p of PROGRAMS) {
  const doc = await payload.create({
    collection: 'programs',
    data: { title: p.title, genre: p.genre, image: mediaId(p.image), synopsis: p.synopsis, isPremiere: Boolean(p.isPremiere) },
    overrideAccess: true,
    context,
  })
  programs.set(p.key, doc.id)
}
const programId = (key: string): number => {
  const id = programs.get(key)
  if (id === undefined) throw new Error(`Émission inconnue : ${key}`)
  return id
}

const firstDay = addDays(today, -1)
const gridEnd = parisDateTime(addDays(firstDay, 8), '00:00')
const slots = Array.from({ length: 8 }, (_, i) => {
  const day = addDays(firstDay, i)
  return daySlots(i, weekday(day)).map((s) => ({ ...s, start: parisDateTime(day, s.time) }))
}).flat()

const schedule = slots.map((s, i) => {
  const end = i + 1 < slots.length ? slots[i + 1].start : gridEnd
  const durationMinutes = Math.round((end.getTime() - s.start.getTime()) / 60_000)
  if (durationMinutes <= 0 || durationMinutes > 600) throw new Error(`Créneau invalide à ${s.start.toISOString()} (${durationMinutes} min)`)
  return { startsAt: s.start.toISOString(), durationMinutes, program: programId(s.program), titleOverride: s.title }
})
await inBatches(schedule, 8, (data) => payload.create({ collection: 'schedule', data, overrideAccess: true, context }))
log(`${schedule.length} créneaux de grille créés (${firstDay} → ${addDays(firstDay, 7)}).`)

// ---------------------------------------------------------------------------------------------
// 4. Vidéos et replays
// ---------------------------------------------------------------------------------------------
const videoSlugs = new Map<string, string>()
for (const v of VIDEOS) {
  const doc = await payload.create({
    collection: 'videos',
    data: {
      title: v.title,
      category: v.category,
      duration: v.duration,
      thumbnail: mediaId(v.thumbnail),
      source: upload(v.clip),
      description: v.description,
      publishedAt: new Date(now.getTime() - v.ageHours * 3_600_000).toISOString(),
      isVideoOfDay: Boolean(v.isVideoOfDay),
      top10Rank: v.top10Rank ?? null,
      views: v.views,
    },
    overrideAccess: true,
    context,
  })
  videoSlugs.set(v.title, doc.slug ?? '')
}

const DATED = new Set(['journal', 'sport', 'agenda'])
for (const r of REPLAYS) {
  const broadcastAt = parisDateTime(addDays(today, r.day), r.time)
  await payload.create({
    collection: 'replays',
    data: {
      title: DATED.has(r.program) ? `${r.title} — ${shortDate(broadcastAt)}` : r.title,
      program: programId(r.program),
      thumbnail: mediaId(r.thumbnail),
      source: upload(r.clip),
      broadcastAt: broadcastAt.toISOString(),
      duration: r.duration,
      description: r.description,
    },
    overrideAccess: true,
    context,
  })
}
log(`${VIDEOS.length} vidéos et ${REPLAYS.length} replays créés.`)

// ---------------------------------------------------------------------------------------------
// 5. Articles
// ---------------------------------------------------------------------------------------------
const articleLinks = new Map<string, string>()
for (const a of ARTICLES) {
  const slug = slugify(a.title)
  const doc = await payload.create({
    collection: 'articles',
    data: {
      title: a.title,
      slug,
      excerpt: a.excerpt,
      content: lexical([a.excerpt, ...a.body]),
      image: mediaId(a.image),
      department: a.department,
      city: a.city,
      kicker: a.kicker,
      publishedAt: new Date(now.getTime() - a.ageMinutes * 60_000).toISOString(),
      isInfoOfDay: Boolean(a.isInfoOfDay),
      ...(a.rss
        ? { source: 'rss' as const, sourceName: 'Agence régionale (démonstration)', sourceUrl: `https://example.org/actualites/${slug}`, guid: `demo-${slug}` }
        : { source: 'manual' as const }),
    },
    overrideAccess: true,
    context,
  })
  articleLinks.set(a.title, articleUrl(doc))
}
log(`${ARTICLES.length} articles créés.`)

// ---------------------------------------------------------------------------------------------
// 6. Agenda
// ---------------------------------------------------------------------------------------------
let weekendPickHref = '/agenda'
let weekendPickDate = parisDateTime(saturday, '10:30')
for (const e of EVENTS) {
  const startDate = parisDateTime(relDay(e.start), e.start.time)
  const doc = await payload.create({
    collection: 'events',
    data: {
      title: e.title,
      startDate: startDate.toISOString(),
      endDate: e.end ? parisDateTime(relDay(e.end), e.end.time).toISOString() : null,
      city: e.city,
      place: e.place,
      category: e.category,
      poster: mediaId(e.poster),
      description: e.description,
      program: e.program ?? [],
      isWeekendPick: Boolean(e.isWeekendPick),
    },
    overrideAccess: true,
    context,
  })
  if (e.isWeekendPick) {
    weekendPickHref = eventUrl(doc)
    weekendPickDate = startDate
  }
}
log(`${EVENTS.length} événements créés.`)

// ---------------------------------------------------------------------------------------------
// 7. Webcams, publicité, pages, flux RSS, redirection
// ---------------------------------------------------------------------------------------------
for (const [i, w] of WEBCAMS.entries()) {
  await payload.create({
    collection: 'webcams',
    data: { name: w.name, place: w.place, provider: w.provider, embedUrl: `/visuels/${w.image}.webp`, image: mediaId(w.image), temperature: w.temperature, order: i + 1, active: true },
    overrideAccess: true,
    context,
  })
}

// Aucune publicité active : l'emplacement affiche « Espace partenaire ». Un exemple inactif sert de modèle.
await payload.create({
  collection: 'ads',
  data: { name: 'Exemple de campagne (inactive)', placement: 'home-leaderboard', image: mediaId('t-matin-a'), link: '/agenda', active: false },
  overrideAccess: true,
  context,
})

for (const p of PAGES) {
  await payload.create({
    collection: 'pages',
    data: {
      title: p.title,
      slug: p.slug,
      intro: p.intro,
      content: lexical(p.body),
      footerGroup: p.footerGroup,
      meta: { title: `${p.title} — Swatter TV`, description: p.metaDescription },
    },
    overrideAccess: true,
    context,
  })
}

await payload.create({
  collection: 'rss-feeds',
  data: { name: 'Exemple de flux (inactif)', url: 'https://example.org/rss.xml', department: 'haute-savoie', kicker: 'Actualité', active: false },
  overrideAccess: true,
  context,
})

await payload.create({
  collection: 'redirects',
  data: { from: '/programme', to: { type: 'custom', url: '/programme-tv' } },
  overrideAccess: true,
  context,
})

// ---------------------------------------------------------------------------------------------
// 8. Réglages du site
// ---------------------------------------------------------------------------------------------
const prime = PROGRAMS.find((p) => p.key === primeOf(1))
const primeAt = parisDateTime(today, '20:45')
const primeTrailer = VIDEOS.find((v) => v.title.startsWith(`${prime?.title ?? ''} — bande-annonce`))
// Titre sur deux lignes (la seconde en doré) : « La Vallée » / « blanche »
const primeWords = (prime?.title ?? 'Ce soir').split(' ')
const primeLine1 = primeWords.slice(0, Math.ceil(primeWords.length / 2)).join(' ')
const primeLine2 = primeWords.slice(Math.ceil(primeWords.length / 2)).join(' ')

await payload.updateGlobal({
  slug: 'settings',
  data: {
    heroSlides: [
      {
        kind: 'live',
        badges: [
          { label: 'En direct', style: 'live' },
          { label: 'Haute-Savoie', style: 'glass' },
        ],
        titleLine1: 'Le direct,',
        titleLine2: 'au cœur des Alpes',
        description: 'L’info, la météo, les documentaires et les sorties de la Haute-Savoie, en continu sur Swatter TV. Rejoignez le direct en un clic.',
        image: mediaId('hero-crepuscule'),
        navLabel: 'En direct',
        primaryLabel: 'Regarder le direct',
        primaryHref: '/direct',
        secondaryLabel: 'Programme TV',
        secondaryHref: '/programme-tv',
      },
      {
        kind: 'custom',
        badges: [
          { label: labelOf(PROGRAM_GENRES, prime?.genre) || 'Ce soir', style: 'gold' },
          { label: `Ce soir · ${formatTime(primeAt)}`, style: 'glass' },
        ],
        titleLine1: primeLine1,
        titleLine2: primeLine2 || null,
        description: prime?.synopsis ?? null,
        image: mediaId('hero-nuit'),
        navLabel: 'Ce soir',
        primaryLabel: primeTrailer ? 'Voir la bande-annonce' : 'Programme TV',
        primaryHref: primeTrailer ? videoUrl({ slug: videoSlugs.get(primeTrailer.title) }) : '/programme-tv',
        secondaryLabel: `Ce soir à ${formatTime(primeAt)}`,
        secondaryHref: '/programme-tv',
      },
      {
        kind: 'custom',
        badges: [
          { label: 'Sortie du week-end', style: 'gold' },
          { label: capitalize(formatDayLong(weekendPickDate)), style: 'glass' },
        ],
        titleLine1: 'La Démontagnée,',
        titleLine2: 'le grand retour',
        description: 'Cloches, chars et produits locaux : les troupeaux quittent les alpages et défilent dans les rues de Bourg-Saint-Maurice dès 10 h 30.',
        image: mediaId('hero-matin'),
        navLabel: 'Ce week-end',
        primaryLabel: 'Voir le programme',
        primaryHref: weekendPickHref,
        secondaryLabel: 'Tout l’agenda',
        secondaryHref: '/agenda',
      },
    ],
    liveEnabled: true,
    live: upload('direct-mont-blanc'),
    livePoster: mediaId('hero-crepuscule'),
    flashAuto: true,
    flashItems: [
      { label: 'Annemasse', text: 'Nouvelle série de coups de feu dans l’agglomération, un homme interpellé', href: articleLinks.get(ARTICLES[0].title) },
      { label: 'Ligue 2', text: 'Le FC Annecy reçoit l’AS Nancy Lorraine pour se rapprocher du top 5', href: articleLinks.get(ARTICLES[1].title) },
      { label: 'Grenoble', text: 'Préavis de grève des agents de la MTAG', href: articleLinks.get(ARTICLES[3].title) },
      { label: 'La Talaudière', text: 'Une maison du répit a ouvert ses portes', href: articleLinks.get(ARTICLES[6].title) },
    ],
    rating: 4.5,
    viewsCount: 995349,
    tagline: 'Swatter TV & Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Haute-Savoie et en Auvergne-Rhône-Alpes.',
    contact: {
      email: 'contact@swatter-tv.fr',
      phone: '',
      address: '36 rue de la Chaumière, 74300 Thyez\nHaute-Savoie · Auvergne-Rhône-Alpes',
    },
    // Réseaux sociaux : à renseigner par le client (aucune adresse inventée).
    socials: { facebook: '', instagram: '', youtube: '', tiktok: '' },
    protectNotice: 'Contenus protégés : captures et téléchargements détectés automatiquement',
  },
  overrideAccess: true,
  context,
})

// ---------------------------------------------------------------------------------------------
// 9. Météo (prévisions de démonstration ; remplacées par Open-Meteo à la première mise à jour automatique)
// ---------------------------------------------------------------------------------------------
await payload.updateGlobal({
  slug: 'meteo',
  data: {
    autoUpdate: true,
    bulletin: null,
    forecast: demoForecast(Array.from({ length: 5 }, (_, i) => addDays(today, i)), now),
    updatedAt: now.toISOString(),
  },
  overrideAccess: true,
  context,
})

// ---------------------------------------------------------------------------------------------
// Récapitulatif
// ---------------------------------------------------------------------------------------------
const recap: Record<string, number> = {}
for (const collection of [...WIPE].reverse()) {
  recap[collection] = (await payload.count({ collection, overrideAccess: true })).totalDocs
}
const users = (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs
console.log('\n✔ Jeu de démonstration créé :')
console.table(recap)
console.log(`  Utilisateurs conservés : ${users}${users === 0 ? ' (créez un administrateur : npm run payload run src/scripts/init-db.ts)' : ''}`)
console.log(`  Grille : ${firstDay} 00:00 → ${addDays(firstDay, 8)} 00:00 (heure de Paris) · Sortie du week-end : ${formatDayLong(weekendPickDate)}`)
process.exit(0)
