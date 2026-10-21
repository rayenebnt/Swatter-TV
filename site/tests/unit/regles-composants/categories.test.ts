// Catégories et genres (src/lib/categories.ts) : listes proposées dans l'administration et sur le site, dans l'ordre du
// guide de l'équipe, valeurs stables (adresses ?categorie=) et libellés.
import { describe, expect, it } from 'vitest'
import { EVENT_CATEGORIES, labelOf, PROGRAM_GENRES, VIDEO_CATEGORIES } from '@/lib/categories'

const LISTS = { VIDEO_CATEGORIES, PROGRAM_GENRES, EVENT_CATEGORIES }

describe('listes de catégories', () => {
  it('vidéos : dans l’ordre du guide (Divertissement … Magazine)', () => {
    const labels = ['Divertissement', 'Séries-réalité', 'Séries', 'Cinéma', 'Documentaire', 'Nature', 'Sport', 'Info', 'Magazine']
    expect(VIDEO_CATEGORIES.map((c) => c.label)).toEqual(labels)
  })

  it('genres des émissions : dans l’ordre du guide (Info … Cinéma)', () => {
    const labels = ['Info', 'Météo', 'Documentaire', 'Magazine', 'Agenda', 'Divertissement', 'Sport', 'Série', 'Cinéma']
    expect(PROGRAM_GENRES.map((c) => c.label)).toEqual(labels)
  })

  it('événements : dans l’ordre du guide, « Autre » en dernier', () => {
    expect(EVENT_CATEGORIES.map((c) => c.label)).toEqual(['Terroir', 'Musique', 'Sport', 'Famille', 'Culture', 'Fête', 'Marché', 'Autre'])
    expect(EVENT_CATEGORIES.at(-1)?.value).toBe('autre')
  })

  for (const [name, list] of Object.entries(LISTS)) {
    it(`${name} : valeurs uniques, en minuscules sans accents (utilisables dans une adresse), libellés uniques`, () => {
      const values = list.map((c) => c.value)
      expect(new Set(values).size).toBe(values.length)
      expect(new Set(list.map((c) => c.label)).size).toBe(list.length)
      for (const v of values) expect(v).toMatch(/^[a-z]+(-[a-z]+)*$/)
    })
  }
})

describe('labelOf : libellé d’une valeur', () => {
  it('valeur connue : son libellé', () => {
    expect(labelOf(VIDEO_CATEGORIES, 'series-realite')).toBe('Séries-réalité')
    expect(labelOf(PROGRAM_GENRES, 'meteo')).toBe('Météo')
    expect(labelOf(EVENT_CATEGORIES, 'marche')).toBe('Marché')
  })

  it('valeur absente ou inconnue : chaîne vide (rien d’affiché)', () => {
    expect(labelOf(VIDEO_CATEGORIES, null)).toBe('')
    expect(labelOf(VIDEO_CATEGORIES, undefined)).toBe('')
    expect(labelOf(VIDEO_CATEGORIES, '')).toBe('')
    expect(labelOf(VIDEO_CATEGORIES, 'Sport')).toBe('')
    expect(labelOf(EVENT_CATEGORIES, 'serie')).toBe('')
    expect(labelOf([], 'sport')).toBe('')
  })
})
