import { describe, expect, it } from 'vitest'
import { slugify } from '@/lib/slugify'

describe('slugify : adresses des contenus', () => {
  it('retire accents, apostrophes et ponctuation', () => {
    expect(slugify('Le Lac d’Annecy vu du ciel')).toBe('le-lac-d-annecy-vu-du-ciel')
    expect(slugify("L'été à Évian !")).toBe('l-ete-a-evian')
    expect(slugify('Fête des Lumières — Lyon (2026)')).toBe('fete-des-lumieres-lyon-2026')
  })

  it('ne garde ni tiret en tête ni tiret en fin', () => {
    expect(slugify('  « Exemple »  ')).toBe('exemple')
    expect(slugify('---')).toBe('')
  })

  it('limite la longueur à 96 caractères, sans finir par un tiret', () => {
    const long = slugify(`${'a'.repeat(95)} b`)
    expect(long.length).toBeLessThanOrEqual(96)
    expect(long.endsWith('-')).toBe(false)
  })
})
