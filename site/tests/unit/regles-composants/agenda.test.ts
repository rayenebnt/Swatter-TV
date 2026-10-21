// Agenda (src/components/agenda/utils.ts) : statut à venir / en cours / terminé, libellés de dates en heure de Paris
// (« 1er », plusieurs jours, changements d'heure), périodes « ce week-end », « cette semaine », « ce mois-ci » et
// adresses des listes filtrées.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENDA_VISUAL,
  agendaUrl,
  categoryFilterLabel,
  chipOf,
  dateLabel,
  eventKicker,
  eventStatus,
  eventVisual,
  httpUrl,
  isMultiDay,
  monthLabel,
  paragraphs,
  parisIso,
  shortWhen,
  timeLabel,
  untilLabel,
} from '@/components/agenda/utils'
import { EVENT_CATEGORIES } from '@/lib/categories'
import { EVENT_PERIODS, periodRange, upcomingWhere } from '@/lib/queries/events'
import { matches } from './outils'

// les requêtes de l'agenda ne sont pas appelées ici : pas de configuration Payload à charger
vi.mock('@/lib/payload', () => ({ getPayloadClient: vi.fn(), isPreview: vi.fn() }))

const ROOT = path.resolve(__dirname, '../../..')

afterEach(() => {
  vi.unstubAllEnvs()
})

type Dates = { startDate: string; endDate?: string | null }
const ev = (startDate: string, endDate?: string | null): Dates => ({ startDate, endDate })

// Repères (heure de Paris) : samedi 17 octobre 2026 10:30 = 08:30 UTC (heure d'été) ; le dimanche 25 octobre 2026,
// on passe à l'heure d'hiver ; le dimanche 1er novembre 2026 est en heure d'hiver (UTC+1).
const SAT_1030 = '2026-10-17T08:30:00.000Z'
const SAT_1800 = '2026-10-17T16:00:00.000Z'
const SAT_MIDNIGHT = '2026-10-16T22:00:00.000Z'
const SUN_MIDNIGHT = '2026-10-17T22:00:00.000Z'

describe('statut d’un événement : à venir, en cours ou terminé', () => {
  it('avec une fin : à venir avant le début, en cours jusqu’à la fin incluse, terminé ensuite', () => {
    const e = ev(SAT_1030, SAT_1800)
    expect(eventStatus(e, new Date('2026-10-17T08:29:59.999Z'))).toBe('upcoming')
    expect(eventStatus(e, new Date(SAT_1030))).toBe('ongoing')
    expect(eventStatus(e, new Date('2026-10-17T12:00:00.000Z'))).toBe('ongoing')
    expect(eventStatus(e, new Date(SAT_1800))).toBe('ongoing')
    expect(eventStatus(e, new Date('2026-10-17T16:00:00.001Z'))).toBe('past')
  })

  it('sur plusieurs jours : en cours pendant tout l’événement', () => {
    const festival = ev('2026-10-23T08:00:00.000Z', '2026-10-25T17:00:00.000Z')
    expect(eventStatus(festival, new Date('2026-10-24T20:00:00.000Z'))).toBe('ongoing')
    expect(eventStatus(festival, new Date('2026-10-25T17:00:01.000Z'))).toBe('past')
  })

  it('sans fin : reste « à venir » toute sa journée (heure de Paris), terminé le lendemain à 0 h', () => {
    const e = ev(SAT_1030)
    expect(eventStatus(e, new Date('2026-10-16T10:00:00.000Z'))).toBe('upcoming')
    expect(eventStatus(e, new Date('2026-10-17T15:00:00.000Z'))).toBe('upcoming')
    expect(eventStatus(e, new Date('2026-10-17T21:59:59.999Z'))).toBe('upcoming')
    expect(eventStatus(e, new Date(SUN_MIDNIGHT))).toBe('past')
  })

  it('sans fin, le jour du passage à l’heure d’hiver (journée de 25 h)', () => {
    const e = ev('2026-10-25T09:00:00.000Z')
    expect(eventStatus(e, new Date('2026-10-25T22:59:59.999Z'))).toBe('upcoming')
    expect(eventStatus(e, new Date('2026-10-25T23:00:00.000Z'))).toBe('past')
  })

  it('même règle que la liste des événements à venir (upcomingWhere) : un événement listé n’est jamais « terminé »', () => {
    const events = [
      ev(SAT_1030),
      ev(SAT_1030, SAT_1800),
      ev(SAT_MIDNIGHT),
      ev('2026-10-23T08:00:00.000Z', '2026-10-25T17:00:00.000Z'),
      ev('2026-10-25T09:00:00.000Z'),
      ev('2026-03-29T00:30:00.000Z'),
      ev('2026-03-28T23:30:00.000Z', '2026-03-29T01:30:00.000Z'),
    ]
    const instants = [
      '2026-03-28T22:59:59.999Z',
      '2026-03-28T23:00:00.000Z',
      '2026-03-29T01:00:00.000Z',
      '2026-03-29T21:59:59.999Z',
      '2026-03-29T22:00:00.000Z',
      '2026-10-17T08:29:59.999Z',
      '2026-10-17T08:30:00.000Z',
      '2026-10-17T16:00:00.001Z',
      '2026-10-17T21:59:59.999Z',
      '2026-10-17T22:00:00.000Z',
      '2026-10-24T12:00:00.000Z',
      '2026-10-25T22:59:59.999Z',
      '2026-10-25T23:00:00.000Z',
    ]
    for (const e of events) {
      for (const instant of instants) {
        const now = new Date(instant)
        expect(matches({ ...e }, upcomingWhere(now)), `${JSON.stringify(e)} à ${instant}`).toBe(eventStatus(e, now) !== 'past')
      }
    }
  })
})

describe('jours et horaires (heure de Paris)', () => {
  it('isMultiDay : une fin à minuit pile appartient à la veille', () => {
    expect(isMultiDay(ev(SAT_1030))).toBe(false)
    expect(isMultiDay(ev(SAT_1030, SAT_1800))).toBe(false)
    expect(isMultiDay(ev('2026-10-17T18:00:00.000Z', SUN_MIDNIGHT))).toBe(false)
    expect(isMultiDay(ev('2026-10-17T18:00:00.000Z', '2026-10-17T22:01:00.000Z'))).toBe(true)
    // samedi 20 h → lundi 0 h, à travers la nuit du changement d'heure : samedi et dimanche
    expect(isMultiDay(ev('2026-10-24T18:00:00.000Z', '2026-10-25T23:00:00.000Z'))).toBe(true)
  })

  it('timeLabel, un seul jour : « De 10:30 à 18:00 », « À 20:00 », « Toute la journée »', () => {
    expect(timeLabel(ev(SAT_1030, SAT_1800))).toBe('De 10:30 à 18:00')
    expect(timeLabel(ev('2026-10-17T18:00:00.000Z'))).toBe('À 20:00')
    expect(timeLabel(ev('2026-10-17T18:00:00.000Z', '2026-10-17T18:00:00.000Z'))).toBe('À 20:00')
    expect(timeLabel(ev(SAT_MIDNIGHT))).toBe('Toute la journée')
    expect(timeLabel(ev(SAT_MIDNIGHT, SUN_MIDNIGHT))).toBe('Toute la journée')
    // heure d'hiver
    expect(timeLabel(ev('2026-12-05T19:00:00.000Z', '2026-12-05T22:30:00.000Z'))).toBe('De 20:00 à 23:30')
  })

  it('timeLabel, plusieurs jours : horaires de début et de fin, ou rien à minuit', () => {
    expect(timeLabel(ev('2026-10-23T08:00:00.000Z', '2026-10-25T17:00:00.000Z'))).toBe('Début à 10:00, fin à 18:00')
    expect(timeLabel(ev('2026-10-23T08:00:00.000Z', '2026-10-25T23:00:00.000Z'))).toBe('Début à 10:00')
    expect(timeLabel(ev('2026-10-22T22:00:00.000Z', '2026-10-25T17:00:00.000Z'))).toBe('Fin à 18:00')
    expect(timeLabel(ev('2026-10-22T22:00:00.000Z', '2026-10-25T23:00:00.000Z'))).toBeNull()
  })

  it('dateLabel, un seul jour : « Samedi 17 octobre (2026) », jour de Paris même à 0 h 30', () => {
    expect(dateLabel(ev(SAT_1030))).toBe('Samedi 17 octobre')
    expect(dateLabel(ev(SAT_1030), true)).toBe('Samedi 17 octobre 2026')
    expect(dateLabel(ev('2026-10-16T22:30:00.000Z'))).toBe('Samedi 17 octobre')
    // fin à minuit : toujours un seul jour
    expect(dateLabel(ev('2026-10-17T18:00:00.000Z', SUN_MIDNIGHT))).toBe('Samedi 17 octobre')
  })

  it('dateLabel : « 1er » pour le premier du mois, jamais pour le 11 ou le 21', () => {
    expect(dateLabel(ev('2026-11-01T14:00:00.000Z'))).toBe('Dimanche 1er novembre')
    expect(dateLabel(ev('2026-11-11T14:00:00.000Z'))).toBe('Mercredi 11 novembre')
    expect(dateLabel(ev('2026-11-21T14:00:00.000Z'))).toBe('Samedi 21 novembre')
  })

  it('dateLabel, plusieurs jours : mois commun écrit une fois, sinon les deux mois, et les deux années si elles diffèrent', () => {
    const festival = ev('2026-10-23T08:00:00.000Z', '2026-10-25T17:00:00.000Z')
    expect(dateLabel(festival)).toBe('Du vendredi 23 au dimanche 25 octobre')
    expect(dateLabel(festival, true)).toBe('Du vendredi 23 au dimanche 25 octobre 2026')
    const toussaint = ev('2026-10-31T08:00:00.000Z', '2026-11-01T17:00:00.000Z')
    expect(dateLabel(toussaint)).toBe('Du samedi 31 octobre au dimanche 1er novembre')
    expect(dateLabel(toussaint, true)).toBe('Du samedi 31 octobre au dimanche 1er novembre 2026')
    const newYear = ev('2026-12-31T19:00:00.000Z', '2027-01-01T03:00:00.000Z')
    expect(dateLabel(newYear)).toBe('Du jeudi 31 décembre 2026 au vendredi 1er janvier 2027')
    expect(dateLabel(newYear, true)).toBe('Du jeudi 31 décembre 2026 au vendredi 1er janvier 2027')
  })

  it('shortWhen (cartes) : « Sam. 17 oct. · 10:30 », sans heure à minuit, « 1er »', () => {
    expect(shortWhen(ev(SAT_1030), 'upcoming')).toBe('Sam. 17 oct. · 10:30')
    expect(shortWhen(ev(SAT_MIDNIGHT), 'upcoming')).toBe('Sam. 17 oct.')
    expect(shortWhen(ev('2026-11-01T14:00:00.000Z'), 'upcoming')).toBe('Dim. 1er nov. · 15:00')
  })

  it('shortWhen, plusieurs jours : « Du 23 au 25 oct. », « Du 31 oct. au 1er nov. », « Jusqu’au 25 oct. » en cours', () => {
    const festival = ev('2026-10-23T08:00:00.000Z', '2026-10-25T17:00:00.000Z')
    expect(shortWhen(festival, 'upcoming')).toBe('Du 23 au 25 oct.')
    expect(shortWhen(festival, 'past')).toBe('Du 23 au 25 oct.')
    expect(shortWhen(festival, 'ongoing')).toBe('Jusqu’au 25 oct.')
    expect(shortWhen(ev('2026-10-31T08:00:00.000Z', '2026-11-01T17:00:00.000Z'), 'upcoming')).toBe('Du 31 oct. au 1er nov.')
  })

  it('untilLabel : « jusqu’au 25 oct. » pour plusieurs jours, rien pour un seul jour', () => {
    expect(untilLabel(ev('2026-10-23T08:00:00.000Z', '2026-10-25T17:00:00.000Z'))).toBe('jusqu’au 25 oct.')
    expect(untilLabel(ev('2026-10-31T08:00:00.000Z', '2026-11-01T17:00:00.000Z'))).toBe('jusqu’au 1er nov.')
    expect(untilLabel(ev(SAT_1030, SAT_1800))).toBeNull()
    expect(untilLabel(ev('2026-10-17T18:00:00.000Z', SUN_MIDNIGHT))).toBeNull()
  })

  it('chipOf : pastille de date et sa version lisible (jour de Paris)', () => {
    expect(chipOf(ev(SAT_1030))).toEqual({ weekday: 'Sam.', day: '17', month: 'Oct.', iso: '2026-10-17', spoken: 'samedi 17 octobre' })
    expect(chipOf(ev('2026-10-16T22:30:00.000Z')).iso).toBe('2026-10-17')
    expect(chipOf(ev('2026-11-01T14:00:00.000Z')).spoken).toBe('dimanche 1er novembre')
  })

  it('monthLabel : « Octobre 2026 »', () => {
    expect(monthLabel('2026-10')).toBe('Octobre 2026')
    expect(monthLabel('2026-08')).toBe('Août 2026')
    expect(monthLabel('2027-01')).toBe('Janvier 2027')
  })

  it('parisIso : date ISO 8601 avec le décalage de Paris (données structurées)', () => {
    expect(parisIso(SAT_1030)).toBe('2026-10-17T10:30:00+02:00')
    expect(parisIso('2026-12-05T19:00:00.000Z')).toBe('2026-12-05T20:00:00+01:00')
    expect(parisIso(new Date('2026-10-17T08:30:45.000Z'))).toBe('2026-10-17T10:30:45+02:00')
    expect(parisIso(SAT_MIDNIGHT)).toBe('2026-10-17T00:00:00+02:00')
    // l'heure de 2 h 30 existe deux fois la nuit du 25 octobre : le décalage les distingue
    expect(parisIso('2026-10-25T00:30:00.000Z')).toBe('2026-10-25T02:30:00+02:00')
    expect(parisIso('2026-10-25T01:30:00.000Z')).toBe('2026-10-25T02:30:00+01:00')
  })

  it('parisIso désigne toujours le même instant (toute l’année, nuits des changements d’heure comprises)', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    for (let t = start; t < start + 366 * 24 * 3600 * 1000; t += 7 * 3600 * 1000 + 13 * 60 * 1000 + 17 * 1000) {
      expect(Date.parse(parisIso(new Date(t)))).toBe(t - (t % 1000))
    }
    for (const iso of ['2026-03-29T00:59:59.000Z', '2026-03-29T01:00:00.000Z', '2026-10-25T00:59:59.000Z', '2026-10-25T01:00:00.000Z']) {
      expect(Date.parse(parisIso(iso))).toBe(Date.parse(iso))
    }
  })
})

describe('périodes du filtre « ?quand= » : bornes en heure de Paris', () => {
  const label = (period: 'week-end' | 'semaine' | 'mois', now: string) => {
    const { from, to } = periodRange(period, new Date(now))
    return dateLabel({ startDate: from.toISOString(), endDate: to.toISOString() })
  }

  it('« Ce week-end » en semaine : du samedi 0 h au lundi 0 h, changement d’heure compris', () => {
    const { from, to } = periodRange('week-end', new Date('2026-10-21T10:00:00.000Z'))
    expect(from.toISOString()).toBe('2026-10-23T22:00:00.000Z')
    expect(to.toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect(label('week-end', '2026-10-21T10:00:00.000Z')).toBe('Du samedi 24 au dimanche 25 octobre')
  })

  it('« Ce week-end » le samedi et le dimanche : le week-end en cours, jusqu’au dimanche minuit', () => {
    for (const now of ['2026-10-23T22:00:00.000Z', '2026-10-24T08:00:00.000Z', '2026-10-25T20:00:00.000Z', '2026-10-25T22:59:59.999Z']) {
      expect(label('week-end', now)).toBe('Du samedi 24 au dimanche 25 octobre')
    }
    // lundi 0 h 30 à Paris : le week-end suivant
    const { from, to } = periodRange('week-end', new Date('2026-10-25T23:30:00.000Z'))
    expect(from.toISOString()).toBe('2026-10-30T23:00:00.000Z')
    expect(to.toISOString()).toBe('2026-11-01T23:00:00.000Z')
    expect(label('week-end', '2026-10-25T23:30:00.000Z')).toBe('Du samedi 31 octobre au dimanche 1er novembre')
  })

  it('« Ce week-end » le vendredi soir tard (heure de Paris) : le lendemain', () => {
    // vendredi 23 octobre, 23 h 30 à Paris = 21 h 30 UTC
    expect(label('week-end', '2026-10-23T21:30:00.000Z')).toBe('Du samedi 24 au dimanche 25 octobre')
  })

  it('« Cette semaine » : d’aujourd’hui au dimanche soir', () => {
    expect(label('semaine', '2026-10-21T10:00:00.000Z')).toBe('Du mercredi 21 au dimanche 25 octobre')
    expect(label('semaine', '2026-10-25T10:00:00.000Z')).toBe('Dimanche 25 octobre')
    expect(label('semaine', '2026-10-26T10:00:00.000Z')).toBe('Du lundi 26 octobre au dimanche 1er novembre')
    expect(periodRange('semaine', new Date('2026-10-21T10:00:00.000Z')).from.toISOString()).toBe('2026-10-20T22:00:00.000Z')
  })

  it('« Ce mois-ci » : d’aujourd’hui à la fin du mois, décembre compris', () => {
    expect(label('mois', '2026-10-21T10:00:00.000Z')).toBe('Du mercredi 21 au samedi 31 octobre')
    expect(label('mois', '2026-10-31T10:00:00.000Z')).toBe('Samedi 31 octobre')
    expect(label('mois', '2026-12-15T10:00:00.000Z')).toBe('Du mardi 15 au jeudi 31 décembre')
    expect(periodRange('mois', new Date('2026-12-15T10:00:00.000Z')).to.toISOString()).toBe('2026-12-31T23:00:00.000Z')
  })

  it('le fuseau horaire du serveur n’a aucune influence : tout est calculé à l’heure de Paris', () => {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      vi.stubEnv('TZ', tz)
      expect(label('week-end', '2026-10-23T21:30:00.000Z'), tz).toBe('Du samedi 24 au dimanche 25 octobre')
      expect(eventStatus(ev(SAT_1030), new Date(SUN_MIDNIGHT)), tz).toBe('past')
      expect(dateLabel(ev('2026-10-16T22:30:00.000Z')), tz).toBe('Samedi 17 octobre')
      expect(parisIso('2026-10-25T01:30:00.000Z'), tz).toBe('2026-10-25T02:30:00+01:00')
    }
  })

  it('les trois périodes proposées aux visiteurs, dans l’ordre', () => {
    expect(EVENT_PERIODS.map((p) => [p.value, p.label])).toEqual([
      ['week-end', 'Ce week-end'],
      ['semaine', 'Cette semaine'],
      ['mois', 'Ce mois-ci'],
    ])
  })
})

describe('adresses, catégories et textes de l’agenda', () => {
  it('agendaUrl : liste sans filtre, puis ?departement=, ?categorie=, ?quand= et ?page= (à partir de 2)', () => {
    expect(agendaUrl()).toBe('/agenda')
    expect(agendaUrl({})).toBe('/agenda')
    expect(agendaUrl({ period: 'week-end' })).toBe('/agenda?quand=week-end')
    expect(agendaUrl({ category: 'musique', period: 'week-end', department: 'isere', page: 2 })).toBe(
      '/agenda?departement=isere&categorie=musique&quand=week-end&page=2',
    )
    expect(agendaUrl({ page: 1 })).toBe('/agenda')
    expect(agendaUrl({ page: 0 })).toBe('/agenda')
    expect(agendaUrl({ category: null, period: null, department: null })).toBe('/agenda')
  })

  it('sur-titre : la catégorie, ou « Sortie » pour « Autre » ou sans catégorie', () => {
    expect(eventKicker('musique')).toBe('Musique')
    expect(eventKicker('fete')).toBe('Fête')
    expect(eventKicker('autre')).toBe('Sortie')
    expect(eventKicker(null)).toBe('Sortie')
    expect(eventKicker(undefined)).toBe('Sortie')
  })

  it('filtres : « Autres sorties » pour « Autre », sinon le libellé de la catégorie', () => {
    expect(categoryFilterLabel('autre')).toBe('Autres sorties')
    for (const c of EVENT_CATEGORIES.filter((x) => x.value !== 'autre')) expect(categoryFilterLabel(c.value)).toBe(c.label)
  })

  it('visuels de repli : choix stable d’après l’identifiant, fichiers présents (et leur version de partage)', () => {
    expect(eventVisual(3)).toBe(eventVisual(13))
    expect(eventVisual(-3)).toBe(eventVisual(3))
    const all = new Set([...Array.from({ length: 30 }, (_, i) => eventVisual(i)), AGENDA_VISUAL])
    for (const src of all) {
      expect(src).toMatch(/^\/visuels\/[\w-]+\.webp$/)
      expect(existsSync(path.join(ROOT, 'public', src))).toBe(true)
      expect(existsSync(path.join(ROOT, 'public/og', `${path.basename(src, '.webp')}.jpg`))).toBe(true)
    }
  })

  it('paragraphs : description découpée sur les lignes vides', () => {
    expect(paragraphs(null)).toEqual([])
    expect(paragraphs(undefined)).toEqual([])
    expect(paragraphs('   ')).toEqual([])
    expect(paragraphs('Premier\n\nDeuxième')).toEqual(['Premier', 'Deuxième'])
    expect(paragraphs('  Un  \n   \n\n  Deux \n suite ')).toEqual(['Un', 'Deux \n suite'])
    expect(paragraphs('Windows\r\n\r\nretour')).toEqual(['Windows', 'retour'])
  })

  it('httpUrl : lien externe en http ou https seulement (jamais javascript:, data:…)', () => {
    expect(httpUrl('https://billetterie.example.fr/concert?id=3')).toBe('https://billetterie.example.fr/concert?id=3')
    expect(httpUrl('  http://office-tourisme.example.fr  ')).toBe('http://office-tourisme.example.fr/')
    expect(httpUrl('HTTPS://EXEMPLE.FR/Page')).toBe('https://exemple.fr/Page')
    const refused = ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://exemple.fr', 'mailto:a@b.fr']
    for (const bad of [...refused, 'pas une adresse', '', '   ', null, undefined]) {
      expect(httpUrl(bad)).toBeNull()
    }
  })
})
