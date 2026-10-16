import { Icon, type IconName } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import { formatDayLong, formatNumber, formatTime } from '@/lib/format'
import type { MediaRef } from '@/lib/media'
import { getEveningProgram, getWeekendEvent, type EveningProgram, type HomeEvent } from '@/lib/queries/home'
import { getOnAir, type Slot } from '@/lib/queries/schedule'
import { getSettings } from '@/lib/queries/settings'
import { eventUrl, programUrl } from '@/lib/urls'
import type { Setting } from '@/payload-types'
import { CountUp } from './CountUp'
import { HeroClient, type HeroBadge, type HeroLink, type HeroLive, type HeroSlide } from './HeroClient'
import type { LiveSlot } from './LiveProgress'
import '@/styles/hero.css'

type ConfiguredSlide = NonNullable<Setting['heroSlides']>[number]

/** Diapositive avant rendu des images (l'image prioritaire dépend de la position finale). */
type Draft = Omit<HeroSlide, 'media' | 'thumb'> & {
  image: MediaRef
  /** Visuels de repli (public/visuels) */
  heroFallback: string
  thumbFallback: string
  /** Diapositive par défaut : l'image du contenu n'est utilisée que si elle est assez grande pour un plein écran */
  requireLarge: boolean
}

// Visuels de repli, dans l'ordre de la maquette (crépuscule, nuit, matin)
const FALLBACKS = [
  { hero: '/visuels/hero-crepuscule.webp', thumb: '/visuels/t-crepuscule-c.webp' },
  { hero: '/visuels/hero-nuit.webp', thumb: '/visuels/t-nuit-b.webp' },
  { hero: '/visuels/hero-matin.webp', thumb: '/visuels/t-matin-a.webp' },
] as const
const HERO_MIN_WIDTH = 1600
// Commune en seconde ligne dorée du titre si elle est courte, sinon en étiquette
const CITY_LINE_MAX = 14
const WEEKEND_DAYS = new Set(['vendredi', 'samedi', 'dimanche'])

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « La Démontagnée, le grand retour » → ligne blanche « La Démontagnée, » + ligne dorée « le grand retour ». */
function splitTitle(title: string): [string, string | null] {
  const m = title.match(/^(.{3,}?(?:\s:|,|\s[–—]))\s+(.{2,})$/)
  return m ? [m[1], m[2]] : [title, null]
}

/** Icône des boutons saisis dans l'administration, déduite du lien et du texte (comme dans la maquette). */
function linkIcon(href: string, label: string, primary: boolean): IconName | null {
  if (/\d{1,2}\s?[:h]\s?\d{2}/.test(label)) return 'clock'
  if (href.startsWith('/programme-tv')) return 'cal'
  if (!primary) return null
  if (href.startsWith('/agenda')) return 'cal'
  if (/^\/(direct|videos|replay)(\/|$|\?|#)/.test(href)) return 'play'
  return null
}

function configuredLink(label: string | null | undefined, href: string | null | undefined, primary: boolean): HeroLink | null {
  const l = label?.trim()
  const h = href?.trim()
  return l && h ? { label: l, href: h, icon: linkIcon(h, l, primary) } : null
}

const toLiveSlot = (s: Slot): LiveSlot => ({ title: s.title, start: s.start, end: s.end, startLabel: formatTime(s.start), endLabel: formatTime(s.end) })

/** Diapositives saisies dans les réglages (onglet « Accueil (carrousel) »). */
function fromSettings(slides: ConfiguredSlide[], live: Omit<HeroLive, 'showTitle'> | null): Draft[] {
  return slides.map((s, i) => {
    const isLive = s.kind === 'live'
    const fb = FALLBACKS[i % FALLBACKS.length]
    return {
      key: s.id || `diapositive-${i}`,
      badges: (s.badges ?? []).map((b): HeroBadge => ({ label: b.label, style: b.style ?? 'glass' })),
      line1: s.titleLine1,
      line2: s.titleLine2?.trim() || null,
      description: s.description?.trim() || null,
      navLabel: s.navLabel?.trim() || s.badges?.[0]?.label || (isLive ? 'En direct' : 'À la une'),
      navTitle: [s.titleLine1, s.titleLine2].filter(Boolean).join(' '),
      primary: configuredLink(s.primaryLabel, s.primaryHref, true),
      secondary: configuredLink(s.secondaryLabel, s.secondaryHref, false),
      live: isLive && live ? { ...live, showTitle: true } : null,
      image: s.image,
      heroFallback: fb.hero,
      thumbFallback: fb.thumb,
      requireLarge: false,
    }
  })
}

/** Diapositive « direct » par défaut : le programme en cours sur le visuel du crépuscule. */
function liveDraft(current: Slot | null, live: Omit<HeroLive, 'showTitle'> | null, tagline: string | null): Draft {
  const [line1, line2] = current ? splitTitle(current.title) : ['Swatter TV', 'en direct']
  return {
    key: 'direct',
    badges: [{ label: 'En direct', style: 'live' }, ...(current?.genreLabel ? [{ label: current.genreLabel, style: 'glass' } as const] : [])],
    line1,
    line2,
    description: current?.synopsis || tagline,
    navLabel: 'En direct',
    navTitle: current?.title ?? 'Swatter TV en direct',
    primary: { label: 'Regarder le direct', href: '/direct', icon: 'play' },
    secondary: { label: 'Programme TV', href: '/programme-tv', icon: 'cal' },
    // Le titre du programme est déjà le titre de la diapositive
    live: live ? { ...live, showTitle: !current } : null,
    image: null,
    heroFallback: FALLBACKS[0].hero,
    thumbFallback: FALLBACKS[0].thumb,
    requireLarge: true,
  }
}

/** Diapositive « programme de soirée » par défaut. */
function eveningDraft({ slot, image, tonight }: EveningProgram): Draft {
  const when = tonight ? 'Ce soir' : 'Demain soir'
  const time = formatTime(slot.start)
  const [line1, line2] = splitTitle(slot.title)
  const kind: HeroBadge | null = slot.isPremiere ? { label: 'Inédit', style: 'gold' } : slot.genreLabel ? { label: slot.genreLabel, style: 'gold' } : null
  return {
    key: `soiree-${slot.id}`,
    badges: [...(kind ? [kind] : []), { label: `${when} · ${time}`, style: 'glass' }],
    line1,
    line2,
    description: slot.synopsis,
    navLabel: when,
    navTitle: slot.title,
    primary: { label: `${when} à ${time}`, href: slot.programSlug ? programUrl({ slug: slot.programSlug }) : '/programme-tv', icon: 'clock' },
    secondary: { label: 'Programme TV', href: '/programme-tv', icon: 'cal' },
    live: null,
    image,
    heroFallback: FALLBACKS[1].hero,
    thumbFallback: FALLBACKS[1].thumb,
    requireLarge: true,
  }
}

/** Diapositive « sortie du week-end » par défaut. */
function eventDraft(event: HomeEvent, now: Date): Draft {
  const [line1, split] = splitTitle(event.title)
  const day = formatDayLong(event.startDate)
  const soon = new Date(event.startDate).getTime() - now.getTime() < 6 * 24 * 60 * 60 * 1000
  const weekend = event.isWeekendPick && soon && WEEKEND_DAYS.has(day.split(' ')[0])
  const city = event.city?.trim() || null
  const cityLine = !split && city && city.length <= CITY_LINE_MAX ? `à ${city}` : null
  return {
    key: `sortie-${event.id}`,
    badges: [
      { label: event.isWeekendPick ? 'Sortie du week-end' : 'À l’agenda', style: 'gold' },
      { label: cap(day), style: 'glass' },
      ...(city && !cityLine ? [{ label: city, style: 'glass' } as const] : []),
    ],
    line1,
    line2: split ?? cityLine,
    description: event.description?.trim() || null,
    navLabel: weekend ? 'Ce week-end' : 'À l’agenda',
    navTitle: event.title,
    primary: { label: 'Voir le programme', href: eventUrl(event), icon: 'cal' },
    secondary: { label: 'Tout l’agenda', href: '/agenda', icon: null },
    live: null,
    image: event.poster,
    heroFallback: FALLBACKS[2].hero,
    thumbFallback: FALLBACKS[2].thumb,
    requireLarge: true,
  }
}

/** Dernier recours (ni direct, ni programme, ni sortie) : la chaîne elle-même. */
function brandDraft(tagline: string | null): Draft {
  return {
    key: 'swatter',
    badges: [],
    line1: 'Swatter TV',
    line2: null,
    description: tagline,
    navLabel: 'Swatter TV',
    navTitle: 'Swatter TV',
    primary: { label: 'Le replay', href: '/replay', icon: 'play' },
    secondary: { label: 'Programme TV', href: '/programme-tv', icon: 'cal' },
    live: null,
    image: null,
    heroFallback: FALLBACKS[0].hero,
    thumbFallback: FALLBACKS[0].thumb,
    requireLarge: true,
  }
}

const isLarge = (m: MediaRef) => typeof m === 'object' && m !== null && (m.width ?? 0) >= HERO_MIN_WIDTH

function render({ image, heroFallback, thumbFallback, requireLarge, ...slide }: Draft, index: number): HeroSlide {
  const background = requireLarge && !isLarge(image) ? null : image
  return {
    ...slide,
    // Image LCP : la première diapositive est préchargée, les autres sont chargées en différé
    media: <MediaImage media={background} fallbackSrc={heroFallback} size="hero" fill sizes="100vw" priority={index === 0} alt="" />,
    thumb: <MediaImage media={image} fallbackSrc={thumbFallback} size="thumb" sizes="76px" alt="" />,
  }
}

/** Note et compteur de vues (valeurs finales rendues côté serveur, compteur animé ensuite). */
function Rating({ rating, views }: { rating: number; views: number }) {
  return (
    <div className="rating">
      {rating > 0 && (
        <>
          <span className="stars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <Icon key={i} name="star" className={rating < i - 0.25 ? 'is-dim' : undefined} />
            ))}
          </span>
          <span className="sr-only">Note :</span>
          <b>{new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(rating)}</b>
          <span className="sr-only">sur 5</span>
        </>
      )}
      {rating > 0 && views > 0 && <span aria-hidden="true">·</span>}
      {views > 0 && (
        <>
          <b>
            <CountUp value={views}>{formatNumber(views)}</CountUp>
          </b>
          <span>vues</span>
        </>
      )}
    </div>
  )
}

/**
 * Carrousel plein écran de l'accueil : diapositives des réglages (settings.heroSlides) ;
 * à défaut, diapositives construites à partir des données (direct, programme de soirée, sortie du week-end).
 */
export async function Hero() {
  const now = new Date()
  const settings = await getSettings()
  const configured = (settings?.heroSlides ?? []).filter((s) => s.titleLine1?.trim())
  const liveOn = settings?.liveEnabled !== false
  const useDefaults = configured.length === 0
  const needOnAir = liveOn && (useDefaults || configured.some((s) => s.kind === 'live'))

  const [onAir, evening, event] = await Promise.all([
    needOnAir ? getOnAir(now, 3) : Promise.resolve({ current: null, next: [] as Slot[] }),
    useDefaults ? getEveningProgram(now) : Promise.resolve(null),
    useDefaults ? getWeekendEvent() : Promise.resolve(null),
  ])

  const slots = [onAir.current, ...onAir.next].filter((s): s is Slot => s !== null)
  const live = slots.length ? { slots: slots.map(toLiveSlot), current: onAir.current !== null } : null
  const tagline = settings?.tagline?.trim() || null

  let drafts: Draft[]
  if (!useDefaults) drafts = fromSettings(configured, live)
  else {
    drafts = []
    if (liveOn) drafts.push(liveDraft(onAir.current, live, tagline))
    if (evening) drafts.push(eveningDraft(evening))
    if (event) drafts.push(eventDraft(event, now))
    if (!drafts.length) drafts.push(brandDraft(tagline))
  }

  const rating = settings?.rating ?? 0
  const views = settings?.viewsCount ?? 0
  return <HeroClient slides={drafts.map(render)} rating={rating > 0 || views > 0 ? <Rating rating={rating} views={views} /> : undefined} />
}
