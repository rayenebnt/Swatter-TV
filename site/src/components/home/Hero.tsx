import { Icon, type IconName } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import { formatDayLong, formatNumber, formatTime } from '@/lib/format'
import type { MediaRef } from '@/lib/media'
import { getEveningProgram, getWeekendEvent, type EveningProgram, type HomeEvent } from '@/lib/queries/home'
import { getOnAirData, type Slot } from '@/lib/queries/schedule'
import { getSettings } from '@/lib/queries/settings'
import { eventUrl, programUrl } from '@/lib/urls'
import { resolveVideo } from '@/lib/video'
import type { Setting } from '@/payload-types'
import { CountUp } from './CountUp'
import { heroWhole } from './heroMedia'
import { HeroClient, type HeroBadge, type HeroLink, type HeroLive, type HeroSlide } from './HeroClient'
import { HeroImage } from './HeroImage'
import type { LiveSlot } from './LiveProgress'
import { cutBadges, cutNavLabel, splitTitle } from './liveSlide'
import '@/styles/hero.css'

type ConfiguredSlide = NonNullable<Setting['heroSlides']>[number]

/** Diapositive avant rendu des images (l'image prioritaire dépend de la position finale). */
type Draft = Omit<HeroSlide, 'media' | 'whole' | 'thumb'> & {
  image: MediaRef
  /** Image pour téléphone (diapositives des réglages) */
  imageMobile: MediaRef
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

const toLiveSlot = (s: Slot): LiveSlot => ({
  title: s.title,
  start: s.start,
  end: s.end,
  startLabel: formatTime(s.start),
  endLabel: formatTime(s.end),
  genreLabel: s.genreLabel,
  synopsis: s.synopsis,
})

/**
 * Diapositives saisies dans les réglages (onglet « Accueil (carrousel) »). Diapositive « direct » : textes saisis
 * conservés, badge rouge et ligne du programme selon l'antenne (liveView, dans le navigateur) ; `live` null (direct coupé
 * dans les réglages, ou sans flux) : ni badge rouge ni « En direct ».
 */
function fromSettings(slides: ConfiguredSlide[], live: HeroLive | null): Draft[] {
  return slides.map((s, i) => {
    const isLive = s.kind === 'live'
    const cut = isLive && !live
    const fb = FALLBACKS[i % FALLBACKS.length]
    const badges = (s.badges ?? []).map((b): HeroBadge => ({ label: b.label, style: b.style ?? 'glass' }))
    const navLabel = s.navLabel?.trim() || s.badges?.[0]?.label || (isLive ? 'En direct' : 'À la une')
    return {
      key: s.id || `diapositive-${i}`,
      badges: cut ? cutBadges(badges) : badges,
      line1: s.titleLine1,
      line2: s.titleLine2?.trim() || null,
      description: s.description?.trim() || null,
      navLabel: cut ? cutNavLabel(navLabel) : navLabel,
      navTitle: [s.titleLine1, s.titleLine2].filter(Boolean).join(' '),
      primary: configuredLink(s.primaryLabel, s.primaryHref, true),
      secondary: configuredLink(s.secondaryLabel, s.secondaryHref, false),
      live: isLive ? live : null,
      image: s.image,
      imageMobile: s.imageMobile,
      heroFallback: fb.hero,
      thumbFallback: fb.thumb,
      requireLarge: false,
    }
  })
}

/**
 * Diapositive « direct » par défaut, sur le visuel du crépuscule : à l'antenne, le programme en cours (titre, genre,
 * résumé) ; hors antenne, « Ce soir dès 18 h ». Ces textes suivent l'heure du visiteur (liveView, live.auto) ; ceux
 * d'ici ne sont que la base commune.
 */
function liveDraft(live: HeroLive): Draft {
  return {
    key: 'direct',
    badges: [{ label: 'En direct', style: 'live' }],
    line1: 'Swatter TV Info',
    line2: 'en direct',
    description: live.auto?.tagline ?? null,
    navLabel: 'En direct',
    navTitle: 'Swatter TV Info en direct',
    primary: { label: 'Regarder le direct', href: '/direct', icon: 'play' },
    secondary: { label: 'Programme TV', href: '/programme-tv', icon: 'cal' },
    live,
    image: null,
    imageMobile: null,
    heroFallback: FALLBACKS[0].hero,
    thumbFallback: FALLBACKS[0].thumb,
    requireLarge: true,
  }
}

/** Diapositive « programme de soirée » par défaut (« Ce soir », « Demain soir », ou entre 0 h et 0 h 30 « Samedi soir »). */
function eveningDraft({ slot, image, when }: EveningProgram): Draft {
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
    imageMobile: null,
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
    imageMobile: null,
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
    line1: 'Swatter TV Info',
    line2: null,
    description: tagline,
    navLabel: 'Swatter TV Info',
    navTitle: 'Swatter TV Info',
    primary: { label: 'Le replay', href: '/replay', icon: 'play' },
    secondary: { label: 'Programme TV', href: '/programme-tv', icon: 'cal' },
    live: null,
    image: null,
    imageMobile: null,
    heroFallback: FALLBACKS[0].hero,
    thumbFallback: FALLBACKS[0].thumb,
    requireLarge: true,
  }
}

const isLarge = (m: MediaRef) => typeof m === 'object' && m !== null && (m.width ?? 0) >= HERO_MIN_WIDTH

function render({ image, imageMobile, heroFallback, thumbFallback, requireLarge, ...slide }: Draft, index: number): HeroSlide {
  const background = requireLarge && !isLarge(image) ? null : image
  return {
    ...slide,
    // Image LCP : la première diapositive est chargée en priorité, les autres en différé. Dans un cadre en hauteur
    // (téléphone, tablette tenue en hauteur), photo en largeur entière sur fond flou ; sinon, image qui couvre le cadre
    // (sous 760 px : image pour téléphone de la diapositive, ou image de fond recadrée autour de son point focal)
    media: <HeroImage background={background} phone={imageMobile} fallbackSrc={heroFallback} priority={index === 0} />,
    whole: heroWhole(background, imageMobile),
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
  // Même règle que la page Direct : direct actif ET flux renseigné, sinon « Le direct reprend bientôt » là-bas
  const liveOn = Boolean(settings?.liveEnabled && resolveVideo(settings.live))
  const useDefaults = configured.length === 0
  const needOnAir = liveOn && (useDefaults || configured.some((s) => s.kind === 'live'))

  const [onAir, evening, event] = await Promise.all([
    needOnAir ? getOnAirData(now) : Promise.resolve(null),
    useDefaults ? getEveningProgram(now) : Promise.resolve(null),
    useDefaults ? getWeekendEvent() : Promise.resolve(null),
  ])

  const tagline = settings?.tagline?.trim() || null
  // Programme de l'antenne (soirée en cours ou à venir et la suivante) : la diapositive « direct » se recalcule à l'heure
  // du visiteur, y compris à 18 h et à 0 h 30 sur une page servie depuis le cache
  const live = (auto: boolean): HeroLive | null =>
    onAir ? { at: onAir.at, evening: onAir.evening, slots: onAir.slots.map(toLiveSlot), auto: auto ? { tagline } : null } : null

  let drafts: Draft[]
  if (!useDefaults) drafts = fromSettings(configured, live(false))
  else {
    drafts = []
    const direct = live(true)
    if (direct) drafts.push(liveDraft(direct))
    if (evening) drafts.push(eveningDraft(evening))
    if (event) drafts.push(eventDraft(event, now))
    if (!drafts.length) drafts.push(brandDraft(tagline))
  }

  const rating = settings?.rating ?? 0
  const views = settings?.viewsCount ?? 0
  return <HeroClient slides={drafts.map(render)} rating={rating > 0 || views > 0 ? <Rating rating={rating} views={views} /> : undefined} />
}
