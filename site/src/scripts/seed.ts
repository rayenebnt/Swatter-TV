/**
 * Contenus de départ (idempotent) : quelques modèles marqués « Exemple » que le client remplace par les siens,
 * pour que chaque rubrique montre où va quoi.
 * Usage : npm run seed   (= payload run src/scripts/seed.ts)
 *
 * Supprime d'abord tous les contenus (jamais les utilisateurs), puis recrée médias, émissions d'exemple,
 * grille sur 8 jours, articles, événements et replay d'exemple, webcams d'exemple, pages, réglages et météo (Open-Meteo).
 * Refuse de tourner en production, sauf SEED_FORCE=1.
 */
import config from '@payload-config'
import path from 'path'
import { getPayload, type CollectionSlug } from 'payload'
import { fileURLToPath } from 'url'

import { formatDayLong, formatTime, parisDateTime, parisDay } from '@/lib/format'
import { importMeteo } from '@/lib/import/meteo'
import { slugify } from '@/lib/slugify'
import { articleUrl, eventUrl } from '@/lib/urls'

import { ARTICLES } from './seed/articles'
import { EVENTS, type RelDay } from './seed/events'
import { lexical } from './seed/lexical'
import { MEDIA } from './seed/media'
import { demoForecast } from './seed/meteo'
import { PAGES, WEBCAMS } from './seed/pages'
import { daySlots, PROGRAMS } from './seed/programs'

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
  console.error('✖ Les contenus de départ remplacent tous les contenus : refusé en production (forcer avec SEED_FORCE=1).')
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
/** Samedi qui vient (aujourd'hui si l'on est samedi)… */
const nextSaturday = addDays(today, (6 - weekday(today) + 7) % 7)
/** …ou le suivant si la sortie du week-end est déjà terminée (jeu lancé un samedi soir). */
const weekendPick = EVENTS.find((e) => e.isWeekendPick)
const pickEnd = weekendPick ? (weekendPick.end ?? weekendPick.start) : null
const saturday =
  pickEnd?.from === 'saturday' && parisDateTime(addDays(nextSaturday, pickEnd.days), pickEnd.time) <= now ? addDays(nextSaturday, 7) : nextSaturday
const relDay = (r: RelDay) => addDays(r.from === 'saturday' ? saturday : today, r.days)
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
const WIPE: CollectionSlug[] = ['redirects', 'schedule', 'replays', 'videos', 'articles', 'events', 'webcams', 'ads', 'pages', 'programs', 'media']

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
    data: { _status: 'published', title: p.title, genre: p.genre, image: mediaId(p.image), synopsis: p.synopsis, isPremiere: Boolean(p.isPremiere) },
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
  return daySlots().map((s) => ({ ...s, start: parisDateTime(day, s.time) }))
}).flat()

const schedule = slots.map((s, i) => {
  const end = i + 1 < slots.length ? slots[i + 1].start : gridEnd
  const durationMinutes = Math.round((end.getTime() - s.start.getTime()) / 60_000)
  if (durationMinutes <= 0 || durationMinutes > 600) throw new Error(`Créneau invalide à ${s.start.toISOString()} (${durationMinutes} min)`)
  return { _status: 'published' as const, startsAt: s.start.toISOString(), durationMinutes, program: programId(s.program), titleOverride: s.title }
})
await inBatches(schedule, 8, (data) => payload.create({ collection: 'schedule', data, overrideAccess: true, context }))
log(`${schedule.length} créneaux de grille créés (${firstDay} → ${addDays(firstDay, 7)}).`)

// ---------------------------------------------------------------------------------------------
// 4. Vidéos et replays
// ---------------------------------------------------------------------------------------------
// « Vidéos » se remplit avec la chaîne YouTube du client (fiche « Chaîne YouTube », import automatique).
// « Replays » aussi (vidéos longues de la chaîne) ; un replay d'exemple montre en attendant à quoi ressemble la rubrique.
await payload.create({
  collection: 'replays',
  data: {
    _status: 'published',
    title: 'Exemple — Un replay à remplacer',
    program: programId('documentaire'),
    source: upload('direct-mont-blanc'),
    thumbnail: mediaId('hero-crepuscule'),
    broadcastAt: parisDateTime(addDays(today, -1), '20:45').toISOString(),
    duration: '52 min',
    description:
      'Replay d’exemple : les vidéos longues de votre chaîne YouTube arrivent ici toutes seules (fiche « Chaîne YouTube »). Vous pouvez aussi ajouter un replay à la main (Replays › Ajouter). Supprimez cet exemple avant l’ouverture.',
  },
  overrideAccess: true,
  context,
})
log('1 replay d’exemple créé.')

// ---------------------------------------------------------------------------------------------
// 5. Articles
// ---------------------------------------------------------------------------------------------
const articleLinks = new Map<string, string>()
for (const a of ARTICLES) {
  const slug = slugify(a.title)
  const doc = await payload.create({
    collection: 'articles',
    data: {
      _status: 'published',
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
      _status: 'published',
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
// 7. Webcams, publicité, pages, redirection
// ---------------------------------------------------------------------------------------------
for (const [i, w] of WEBCAMS.entries()) {
  await payload.create({
    collection: 'webcams',
    data: { _status: 'published', name: w.name, place: w.place, provider: w.provider, embedUrl: `/visuels/${w.image}.webp`, image: mediaId(w.image), temperature: w.temperature, order: i + 1, active: true },
    overrideAccess: true,
    context,
  })
}

// Aucune publicité active : l'emplacement affiche « Devenir partenaire ». Un exemple inactif sert de modèle.
await payload.create({
  collection: 'ads',
  data: { _status: 'published', name: 'Exemple de campagne (inactive, à dupliquer pour une vraie publicité)', placement: 'home-leaderboard', image: mediaId('t-matin-a'), link: '/agenda', active: false },
  overrideAccess: true,
  context,
})

for (const p of PAGES) {
  await payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
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
  collection: 'redirects',
  data: { from: '/programme', to: { type: 'custom', url: '/programme-tv' } },
  overrideAccess: true,
  context,
})

// ---------------------------------------------------------------------------------------------
// 8. Réglages du site
// ---------------------------------------------------------------------------------------------
const primeAt = parisDateTime(today, '20:45')
const EDIT_SLIDES = 'Accueil et direct › Carrousel'

await payload.updateGlobal({
  slug: 'settings',
  data: {
    _status: 'published',
    heroSlides: [
      {
        kind: 'live',
        badges: [
          { label: 'En direct', style: 'live' },
          { label: 'Haute-Savoie', style: 'glass' },
        ],
        titleLine1: 'Le direct,',
        titleLine2: 'au cœur des Alpes',
        description: `Texte d’exemple à personnaliser (${EDIT_SLIDES}) : présentez votre chaîne en une ou deux phrases.`,
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
          { label: 'Exemple', style: 'gold' },
          { label: `Ce soir · ${formatTime(primeAt)}`, style: 'glass' },
        ],
        titleLine1: 'Votre émission',
        titleLine2: 'de ce soir',
        description: `Diapositive d’exemple (${EDIT_SLIDES}) : mettez en avant le programme de la soirée avec son titre, une image et ce texte.`,
        image: mediaId('hero-nuit'),
        navLabel: 'Ce soir',
        primaryLabel: `Ce soir à ${formatTime(primeAt)}`,
        primaryHref: '/programme-tv',
        secondaryLabel: 'Le replay',
        secondaryHref: '/replay',
      },
      {
        kind: 'custom',
        badges: [
          { label: 'Sortie du week-end', style: 'gold' },
          { label: capitalize(formatDayLong(weekendPickDate)), style: 'glass' },
        ],
        titleLine1: 'Votre sortie',
        titleLine2: 'du week-end',
        description: `Diapositive d’exemple (${EDIT_SLIDES}) : annoncez l’événement à ne pas manquer. Le bouton mène à sa fiche dans l’agenda.`,
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
      { label: 'Exemple', text: 'Remplacez ce message dans Accueil et direct › Flash info', href: articleLinks.get(ARTICLES[0].title) },
      { label: 'Exemple', text: 'Le flash se complète aussi tout seul avec vos derniers articles', href: '/info' },
    ],
    rating: 4.5,
    viewsCount: 995349,
    tagline: 'Swatter TV & Info, votre chaîne locale : le direct, l’info, la météo et les sorties en Haute-Savoie.',
    contact: {
      email: 'contact@swatter-tv.fr',
      phone: '',
      address: '36 rue de la Chaumière, 74300 Thyez\nHaute-Savoie',
    },
    // Réseaux sociaux : à renseigner par le client (aucune adresse inventée).
    socials: { facebook: '', instagram: '', youtube: '', tiktok: '' },
    protectNotice: 'Contenus protégés : captures et téléchargements détectés automatiquement',
  },
  overrideAccess: true,
  context,
})

// ---------------------------------------------------------------------------------------------
// 9. Météo (Open-Meteo, ou prévisions de démonstration si le service est injoignable)
// ---------------------------------------------------------------------------------------------
await payload.updateGlobal({
  slug: 'meteo',
  data: {
    _status: 'published',
    autoUpdate: true,
    bulletin: null,
    forecast: demoForecast(Array.from({ length: 5 }, (_, i) => addDays(today, i)), now),
    updatedAt: now.toISOString(),
  },
  overrideAccess: true,
  context,
})
// Vraies prévisions tout de suite si Open-Meteo répond (sinon : celles de démonstration, remplacées dès que le site
// pourra joindre Open-Meteo)
const live = await importMeteo(payload)
log(live.ok ? 'Météo : prévisions actuelles d’Open-Meteo.' : `Météo : prévisions de démonstration en attendant Open-Meteo (${live.error}).`)

// ---------------------------------------------------------------------------------------------
// Récapitulatif
// ---------------------------------------------------------------------------------------------
const recap: Record<string, number> = {}
for (const collection of [...WIPE].reverse()) {
  recap[collection] = (await payload.count({ collection, overrideAccess: true })).totalDocs
}
const users = (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs
console.log('\n✔ Contenus de départ créés (titres « Exemple » à remplacer) :')
console.table(recap)
console.log(`  Utilisateurs conservés : ${users}${users === 0 ? ' (créez un administrateur : npm run payload run src/scripts/init-db.ts)' : ''}`)
console.log(`  Grille : ${firstDay} 00:00 → ${addDays(firstDay, 8)} 00:00 (heure de Paris) · Sortie du week-end : ${formatDayLong(weekendPickDate)}`)
process.exit(0)
