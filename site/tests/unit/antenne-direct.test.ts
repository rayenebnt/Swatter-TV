// Tests unitaires de l'antenne hors de la page Programme TV (accueil, page Direct) : créneaux rognés aux bornes de la
// soirée, programme en cours seulement de 18 h à 0 h 30, « À suivre » découpé par soirée, libellés « Ce soir » /
// « Demain soir », diapositive « direct » du carrousel. Logique pure : l'instant est toujours passé en paramètre, aucun
// test ne dépend de l'heure à laquelle il tourne.
import { describe, expect, it } from 'vitest'
import { cutBadges, cutNavLabel, liveView, offAirBadges, splitTitle, type HeroLive } from '@/components/home/liveSlide'
import type { HeroBadge, HeroSlide } from '@/components/home/HeroClient'
import type { LiveSlot } from '@/components/home/LiveProgress'
import { formatTime, parisDateTime } from '@/lib/format'
import { clipToEvening, eveningLabel, eveningPhrase, eveningSlots, eveningSpan, onAirState, slotEvening, upcomingGroups } from '@/lib/on-air'
import type { Slot } from '@/lib/queries/schedule'

let lastId = 0
/** Créneau sérialisable commençant `day` à `time` (heure de Paris). */
function slot(day: string, time: string, minutes: number, title = `Émission ${lastId + 1}`): Slot {
  lastId++
  const start = parisDateTime(day, time)
  return {
    id: lastId,
    title,
    start: start.toISOString(),
    end: new Date(start.getTime() + minutes * 60_000).toISOString(),
    durationMinutes: minutes,
    genre: null,
    genreLabel: '',
    synopsis: null,
    image: null,
    programSlug: null,
    isPremiere: false,
  }
}
const at = (day: string, time: string) => parisDateTime(day, time).getTime()
const ids = (slots: { id: number }[]) => slots.map((s) => s.id)

// Mardi 10 novembre 2026 (heure d'hiver, UTC+1) : soirée du 10 et du 11
const TUE = '2026-11-10'
const WED = '2026-11-11'

describe('créneaux d’une soirée : rognés aux bornes de l’antenne, hors antenne ignorés', () => {
  it('un ancien créneau qui commence avant 18 h ou finit après 0 h 30 ne garde que sa partie à l’antenne', () => {
    const early = slot(TUE, '17:30', 60)
    const late = slot(TUE, '23:45', 90)
    const span = eveningSpan(TUE)
    expect(clipToEvening(early, span)).toMatchObject({ start: parisDateTime(TUE, '18:00').toISOString(), end: parisDateTime(TUE, '18:30').toISOString(), durationMinutes: 30 })
    expect(clipToEvening(late, span)).toMatchObject({ start: late.start, end: parisDateTime(WED, '00:30').toISOString(), durationMinutes: 45 })
    // créneau dans l'antenne : inchangé (même objet)
    const inside = slot(TUE, '20:00', 30)
    expect(clipToEvening(inside, span)).toBe(inside)
  })

  it('entièrement hors antenne (06:00, 12:00, 0 h 30 pile, fin à 18 h pile) : ignoré', () => {
    const span = eveningSpan(TUE)
    for (const s of [slot(TUE, '06:00', 60), slot(TUE, '12:00', 120), slot(WED, '00:30', 30), slot(TUE, '17:00', 60)]) {
      expect(clipToEvening(s, span), s.start).toBeNull()
    }
  })

  it('créneaux de deux soirées, triés ; ceux de la journée disparaissent', () => {
    const a = slot(WED, '18:00', 30)
    const b = slot(TUE, '18:00', 30)
    const night = slot(WED, '00:00', 30)
    const day = slot(WED, '10:00', 60)
    const out = eveningSlots([a, day, night, b], [TUE, WED])
    expect(ids(out)).toEqual([b.id, night.id, a.id])
  })
})

describe('état de l’antenne à un instant donné', () => {
  const s18 = slot(TUE, '18:00', 30)
  const s20 = slot(TUE, '20:00', 60)
  const s00 = slot(WED, '00:00', 30)
  const n18 = slot(WED, '18:00', 30)
  const slots = [s18, s20, s00, n18]

  it('17 h 59 : hors antenne, rien en cours, la soirée commence à 18 h', () => {
    const st = onAirState(slots, at(TUE, '17:59'))
    expect(st).toMatchObject({ onAir: false, current: null, evening: { day: TUE } })
    expect(ids(st.upcoming)).toEqual(ids(slots))
  })

  it('18 h pile : à l’antenne, le premier programme est en cours', () => {
    const st = onAirState(slots, at(TUE, '18:00'))
    expect(st.onAir).toBe(true)
    expect(st.current?.id).toBe(s18.id)
  })

  it('entre deux créneaux (19 h) : à l’antenne sans programme en cours (la chaîne diffuse même sans grille)', () => {
    const st = onAirState(slots, at(TUE, '19:00'))
    expect(st).toMatchObject({ onAir: true, current: null })
    expect(st.upcoming[0].id).toBe(s20.id)
  })

  it('0 h 15 : encore la soirée de la veille, à l’antenne', () => {
    const st = onAirState(slots, at(WED, '00:15'))
    expect(st).toMatchObject({ onAir: true, evening: { day: TUE } })
    expect(st.current?.id).toBe(s00.id)
    expect(ids(st.upcoming)).toEqual([n18.id])
  })

  it('0 h 30 pile : fin de l’antenne, la soirée suivante est « ce soir »', () => {
    const st = onAirState(slots, at(WED, '00:30'))
    expect(st).toMatchObject({ onAir: false, current: null, evening: { day: WED } })
    expect(ids(st.upcoming)).toEqual([n18.id])
  })

  it('10 h : jamais « en cours », même pour un créneau non rogné qui couvrirait cette heure', () => {
    const morning = slot(WED, '09:00', 120)
    const st = onAirState([morning, n18], at(WED, '10:00'))
    expect(st).toMatchObject({ onAir: false, current: null })
  })

  it('nuits de changement d’heure : la soirée dure 6 h 30 réelles (fin octobre, fin mars)', () => {
    // 24 → 25 octobre 2026 : 0 h 15 encore à l'heure d'été (UTC+2), 18 h le 25 à l'heure d'hiver (UTC+1)
    expect(eveningSpan('2026-10-24')).toEqual({ day: '2026-10-24', start: '2026-10-24T16:00:00.000Z', end: '2026-10-24T22:30:00.000Z' })
    expect(onAirState([], Date.parse('2026-10-24T22:15:00Z'))).toMatchObject({ onAir: true, evening: { day: '2026-10-24' } })
    expect(onAirState([], Date.parse('2026-10-24T22:30:00Z'))).toMatchObject({ onAir: false, evening: { day: '2026-10-25' } })
    expect(onAirState([], Date.parse('2026-10-25T17:00:00Z')).onAir).toBe(true)
    // 28 → 29 mars 2026 : 0 h 30 encore à l'heure d'hiver (UTC+1), 18 h le 29 à l'heure d'été (UTC+2)
    expect(eveningSpan('2026-03-28').end).toBe('2026-03-28T23:30:00.000Z')
    expect(eveningSpan('2026-03-29').start).toBe('2026-03-29T16:00:00.000Z')
    expect(onAirState([], Date.parse('2026-03-29T15:59:00Z')).onAir).toBe(false)
    expect(onAirState([], Date.parse('2026-03-29T16:00:00Z')).onAir).toBe(true)
  })
})

describe('nom d’une soirée : « Ce soir », « Demain soir », « Hier soir », « Ven. 13 »', () => {
  it('pendant la journée et la soirée', () => {
    for (const time of ['10:00', '18:00', '23:59']) {
      const now = at(TUE, time)
      expect(eveningLabel(TUE, now), time).toBe('Ce soir')
      expect(eveningLabel(WED, now), time).toBe('Demain soir')
      expect(eveningLabel('2026-11-09', now), time).toBe('Hier soir')
      expect(eveningLabel('2026-11-13', now), time).toBe('Ven. 13')
    }
  })

  it('de 0 h à 0 h 30 : « ce soir » est encore la soirée de la veille, la suivante porte le nom de son jour', () => {
    const now = at(WED, '00:15')
    expect(eveningLabel(TUE, now)).toBe('Ce soir')
    expect(eveningLabel(WED, now)).toBe('Mercredi soir')
    expect(eveningPhrase(WED, now)).toBe('mercredi soir')
    // dès 0 h 30, la soirée du jour redevient « ce soir »
    expect(eveningLabel(WED, at(WED, '00:30'))).toBe('Ce soir')
    expect(eveningPhrase('2026-11-13', at(WED, '00:30'))).toBe('le ven. 13')
  })
})

describe('« À suivre » découpé par soirée (page Direct)', () => {
  const s23 = slot(TUE, '23:30', 30)
  const s00 = slot(WED, '00:00', 30)
  const n18 = slot(WED, '18:00', 30)
  const n19 = slot(WED, '19:00', 60)
  const slots = [s23, s00, n18, n19]

  it('23 h 50 : la fin de la soirée, « Fin des programmes à 0 h 30 », puis « Demain soir »', () => {
    const now = at(TUE, '23:50')
    const groups = upcomingGroups(onAirState(slots, now), now, 3)
    expect(groups.map((g) => ({ ...g, slots: ids(g.slots) }))).toEqual([
      { day: TUE, endBefore: false, heading: null, slots: [s00.id] },
      { day: WED, endBefore: true, heading: 'Demain soir', slots: [n18.id, n19.id] },
    ])
  })

  it('0 h 15 : la fin des programmes, puis la soirée suivante sous le nom de son jour', () => {
    const now = at(WED, '00:15')
    const groups = upcomingGroups(onAirState(slots, now), now, 3)
    expect(groups).toMatchObject([{ day: WED, endBefore: true, heading: 'Mercredi soir' }])
  })

  it('hors antenne (10 h) : les créneaux de ce soir, sans séparateur', () => {
    const now = at(WED, '10:00')
    const groups = upcomingGroups(onAirState(slots, now), now, 3)
    expect(groups).toMatchObject([{ day: WED, endBefore: false, heading: null }])
    expect(ids(groups[0].slots)).toEqual([n18.id, n19.id])
  })

  it('hors antenne, soirée sans grille : la suivante, nommée, sans « fin des programmes »', () => {
    const now = at(TUE, '10:00')
    const groups = upcomingGroups(onAirState([n18], now), now, 3)
    expect(groups).toEqual([{ day: WED, endBefore: false, heading: 'Demain soir', slots: [n18] }])
  })

  it('au plus `max` créneaux', () => {
    const now = at(TUE, '23:50')
    expect(upcomingGroups(onAirState(slots, now), now, 2).flatMap((g) => ids(g.slots))).toEqual([s00.id, n18.id])
    expect(upcomingGroups(onAirState(slots, now), now, 0)).toEqual([])
  })

  it('soirée d’un créneau devant son heure (écran hors antenne, direct coupé)', () => {
    const now = at(WED, '10:00')
    const st = onAirState(slots, now)
    expect(slotEvening(n18, st, now)).toBeNull()
    expect(slotEvening(n18, st, now, true)).toBe('ce soir')
    expect(slotEvening(slot('2026-11-12', '18:00', 30), st, now)).toBe('demain soir')
  })
})

describe('diapositive « direct » du carrousel selon l’antenne', () => {
  const toLive = (s: Slot): LiveSlot => ({
    title: s.title,
    start: s.start,
    end: s.end,
    startLabel: formatTime(s.start),
    endLabel: formatTime(s.end),
    genreLabel: s.genreLabel,
    synopsis: s.synopsis,
  })
  const journal = toLive({ ...slot(TUE, '18:00', 30, 'Le journal des Alpes'), genreLabel: 'Info', synopsis: 'L’actualité.' })
  const doc = toLive(slot(TUE, '20:45', 105, 'Les Aravis, la montagne en partage'))
  const live = (slots: LiveSlot[], auto = false): HeroLive => ({ at: new Date(at(TUE, '12:00')).toISOString(), evening: eveningSpan(TUE), slots, auto: auto ? { tagline: 'Votre chaîne locale.' } : null })
  const badges: HeroBadge[] = [
    { label: 'En direct', style: 'live' },
    { label: 'Auvergne-Rhône-Alpes', style: 'glass' },
  ]
  const configured: Pick<HeroSlide, 'badges' | 'line1' | 'line2' | 'description' | 'navLabel' | 'navTitle' | 'primary' | 'secondary'> = {
    badges,
    line1: 'Le direct,',
    line2: 'au cœur des Alpes',
    description: 'Texte du client.',
    navLabel: 'En direct',
    navTitle: 'Le direct, au cœur des Alpes',
    primary: { label: 'Regarder le direct', href: '/direct', icon: 'play' },
    secondary: { label: 'Programme TV', href: '/programme-tv', icon: 'cal' },
  }

  it('saisie du client, à l’antenne (21 h) : textes et badges inchangés, progression du programme en cours', () => {
    const v = liveView(configured, live([journal, doc]), at(TUE, '21:00'))
    expect(v).toMatchObject({ ...configured, onAir: true, line: { kind: 'progress', slot: doc, showTitle: true } })
  })

  it('saisie du client, hors antenne (10 h) : « Ce soir dès 18 h » au lieu du badge rouge, « Ce soir » en vignette', () => {
    const v = liveView(configured, live([journal, doc]), at(TUE, '10:00'))
    expect(v.onAir).toBe(false)
    expect(v.badges).toEqual([
      { label: 'Ce soir dès 18 h', style: 'glass' },
      { label: 'Auvergne-Rhône-Alpes', style: 'glass' },
    ])
    expect(v.navLabel).toBe('Ce soir')
    expect(v.line).toEqual({ kind: 'off', label: 'Ce soir à 18:00', title: 'Le journal des Alpes' })
    // textes saisis conservés
    expect(v).toMatchObject({ line1: 'Le direct,', line2: 'au cœur des Alpes', description: 'Texte du client.', primary: configured.primary })
    // vignette personnalisée : conservée
    expect(liveView({ ...configured, navLabel: 'Notre chaîne' }, live([]), at(TUE, '10:00')).navLabel).toBe('Notre chaîne')
  })

  it('hors antenne sans grille : « Reprise ce soir à 18 h » ; à l’antenne sans programme : « À l’antenne jusqu’à 0 h 30 »', () => {
    expect(liveView(configured, live([]), at(TUE, '10:00')).line).toEqual({ kind: 'off', label: 'Reprise ce soir à 18 h', title: null })
    expect(liveView(configured, live([journal]), at(TUE, '19:00')).line).toEqual({ kind: 'until' })
  })

  it('bascules : 17 h 59 hors antenne, 18 h à l’antenne, 0 h 29 à l’antenne, 0 h 30 hors antenne', () => {
    const l = live([journal, doc])
    expect(liveView(configured, l, at(TUE, '17:59')).onAir).toBe(false)
    expect(liveView(configured, l, at(TUE, '18:00'))).toMatchObject({ onAir: true, line: { kind: 'progress', slot: journal } })
    expect(liveView(configured, l, at(WED, '00:29'))).toMatchObject({ onAir: true, line: { kind: 'until' } })
    expect(liveView(configured, l, at(WED, '00:30'))).toMatchObject({ onAir: false, navLabel: 'Ce soir' })
  })

  it('diapositive par défaut à l’antenne : titre, genre et résumé du programme en cours', () => {
    const v = liveView(configured, live([journal, doc], true), at(TUE, '18:10'))
    expect(v).toMatchObject({
      onAir: true,
      badges: [
        { label: 'En direct', style: 'live' },
        { label: 'Info', style: 'glass' },
      ],
      line1: 'Le journal des Alpes',
      line2: null,
      description: 'L’actualité.',
      navTitle: 'Le journal des Alpes',
      line: { kind: 'progress', slot: journal, showTitle: false },
    })
    expect(liveView(configured, live([journal, doc], true), at(TUE, '21:00'))).toMatchObject({ line1: 'Les Aravis,', line2: 'la montagne en partage', description: 'Votre chaîne locale.' })
    expect(liveView(configured, live([], true), at(TUE, '21:00'))).toMatchObject({ line1: 'Swatter TV Info', line2: 'en direct', line: { kind: 'until' } })
  })

  it('diapositive par défaut hors antenne : ni « En direct » ni lecteur, le programme TV et le replay', () => {
    const v = liveView(configured, live([journal], true), at(TUE, '10:00'))
    expect(v).toMatchObject({
      onAir: false,
      badges: [{ label: 'Ce soir dès 18 h', style: 'glass' }],
      line1: 'Swatter TV Info',
      line2: 'tous les soirs, 18 h – 0 h 30',
      description: 'Votre chaîne locale.',
      navLabel: 'Ce soir',
      primary: { href: '/programme-tv' },
      secondary: { href: '/replay' },
      line: { kind: 'off', label: 'Ce soir à 18:00', title: 'Le journal des Alpes' },
    })
    expect(JSON.stringify(v)).not.toMatch(/en direct/i)
  })

  it('badges : un seul « Ce soir dès 18 h » à la place des badges rouges ; direct coupé, ni badge rouge ni « En direct »', () => {
    const many: HeroBadge[] = [
      { label: 'Exclusif', style: 'gold' },
      { label: 'En direct', style: 'live' },
      { label: 'Live', style: 'live' },
    ]
    expect(offAirBadges(many)).toEqual([
      { label: 'Exclusif', style: 'gold' },
      { label: 'Ce soir dès 18 h', style: 'glass' },
    ])
    expect(cutBadges(many)).toEqual([{ label: 'Exclusif', style: 'gold' }])
    expect(cutNavLabel(' En direct ')).toBe('Le direct')
    expect(cutNavLabel('À la une')).toBe('À la une')
  })

  it('titre en deux lignes', () => {
    expect(splitTitle('La Démontagnée, le grand retour')).toEqual(['La Démontagnée,', 'le grand retour'])
    expect(splitTitle('Le journal')).toEqual(['Le journal', null])
  })
})
