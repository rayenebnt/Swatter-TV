// Diapositive « direct » du carrousel de l'accueil selon l'antenne (18 h – 0 h 30) : logique pure, appelée par HeroClient au
// rendu serveur (instant du rendu) puis dans le navigateur (heure du visiteur : page servie depuis le cache, onglet resté
// ouvert). À l'antenne : comme avant (« En direct », programme en cours et progression) ; hors antenne : plus de badge
// rouge, « Ce soir dès 18 h » et le premier programme de la soirée. Les textes saisis par le client sont conservés.
import { BROADCAST_HOURS_LABEL } from '@/lib/broadcast'
import { onAirState, RESUME_TONIGHT, TONIGHT_FROM, type OnAirData } from '@/lib/on-air'
import type { HeroBadge, HeroLink, HeroSlide } from './HeroClient'
import type { LiveSlot } from './LiveProgress'

/**
 * Programme de l'antenne d'une diapositive « direct » : OnAirData (instant du rendu, créneaux de deux soirées rognés à
 * l'antenne) ; `auto` : diapositive par défaut, dont le titre, le genre et le résumé suivent le programme en cours.
 */
export type HeroLive = OnAirData<LiveSlot> & { auto: { tagline: string | null } | null }

/** Ce qu'affiche la ligne sous le texte : progression du programme, « À l'antenne jusqu'à 0 h 30 », ou la soirée à venir. */
export type LiveLine =
  | { kind: 'progress'; slot: LiveSlot; showTitle: boolean }
  | { kind: 'until' }
  | { kind: 'off'; label: string; title: string | null }

/** Textes de la diapositive qui dépendent de l'antenne. */
export type LiveView = Pick<HeroSlide, 'badges' | 'line1' | 'line2' | 'description' | 'navLabel' | 'navTitle' | 'primary' | 'secondary'> & {
  onAir: boolean
  line: LiveLine
}

/** « La Démontagnée, le grand retour » → ligne blanche « La Démontagnée, » + ligne dorée « le grand retour ». */
export function splitTitle(title: string): [string, string | null] {
  const m = title.match(/^(.{3,}?(?:\s:|,|\s[–—]))\s+(.{2,})$/)
  return m ? [m[1], m[2]] : [title, null]
}

const LIVE_NAV = /^en direct$/i
const offBadge: HeroBadge = { label: TONIGHT_FROM, style: 'glass' }

/** Badges hors antenne : le premier badge rouge (« En direct ») devient « Ce soir dès 18 h », les autres rouges disparaissent. */
export function offAirBadges(badges: HeroBadge[]): HeroBadge[] {
  let replaced = false
  const out: HeroBadge[] = []
  for (const b of badges) {
    if (b.style !== 'live') out.push(b)
    else if (!replaced) {
      out.push(offBadge)
      replaced = true
    }
  }
  return out
}

/** Diapositive « direct » dont le direct est coupé (réglages) ou sans flux : ni badge rouge, ni « En direct » en vignette. */
export function cutBadges(badges: HeroBadge[]): HeroBadge[] {
  return badges.filter((b) => b.style !== 'live')
}
export const cutNavLabel = (label: string) => (LIVE_NAV.test(label.trim()) ? 'Le direct' : label)

const PROGRAMME: HeroLink = { label: 'Programme TV', href: '/programme-tv', icon: 'cal' }
const REPLAY: HeroLink = { label: 'Le replay', href: '/replay', icon: 'play' }

/** Textes de la diapositive `slide` (avec son programme `live`) à l'instant `now` (ms). */
export function liveView(slide: Pick<HeroSlide, keyof LiveView & keyof HeroSlide>, live: HeroLive, now: number): LiveView {
  const state = onAirState(live.slots, now)
  const auto = live.auto
  if (state.onAir) {
    const cur = state.current
    const line: LiveLine = cur ? { kind: 'progress', slot: cur, showTitle: !auto } : { kind: 'until' }
    if (!auto) return { ...slide, onAir: true, line }
    const [line1, line2] = cur ? splitTitle(cur.title) : ['Swatter TV Info', 'en direct']
    return {
      ...slide,
      onAir: true,
      line,
      badges: [{ label: 'En direct', style: 'live' }, ...(cur?.genreLabel ? [{ label: cur.genreLabel, style: 'glass' } as const] : [])],
      line1,
      line2,
      description: cur?.synopsis || auto.tagline,
      navTitle: cur?.title ?? 'Swatter TV Info en direct',
    }
  }
  // Hors antenne (de 0 h 30 à 18 h) : la soirée qui vient commence le jour même, à 18 h
  const first = state.upcoming.find((s) => Date.parse(s.start) < Date.parse(state.evening.end)) ?? null
  const line: LiveLine = first ? { kind: 'off', label: `Ce soir à ${first.startLabel}`, title: first.title } : { kind: 'off', label: RESUME_TONIGHT, title: null }
  const navLabel = LIVE_NAV.test(slide.navLabel.trim()) ? 'Ce soir' : slide.navLabel
  if (!auto) return { ...slide, onAir: false, line, badges: offAirBadges(slide.badges), navLabel }
  return {
    onAir: false,
    line,
    badges: [offBadge],
    line1: 'Swatter TV Info',
    line2: `tous les soirs, ${BROADCAST_HOURS_LABEL}`,
    description: auto.tagline,
    navLabel: 'Ce soir',
    navTitle: `Swatter TV Info, ${TONIGHT_FROM.toLowerCase()}`,
    primary: PROGRAMME,
    secondary: REPLAY,
  }
}
