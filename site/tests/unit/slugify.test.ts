// Adresses des contenus fabriquées à partir du titre (src/lib/slugify.ts, champ « Adresse web (automatique) ») :
// minuscules, sans accents ni ponctuation, mots séparés par un tiret, 96 caractères au plus.
import { describe, expect, it } from 'vitest'
import { slugify } from '@/lib/slugify'

const TITLES = [
  'Le Lac d’Annecy vu du ciel',
  "L'été à Évian !",
  'Fête des Lumières — Lyon (2026)',
  'Cœur de ville : la place du Château',
  '  « Exemple »  ',
  'Top 10 : les 5 PLUS beaux lacs',
  'Puy-de-Dôme / Cantal : 12 °C ce matin',
  `${'Un titre vraiment très long '.repeat(8)}fin`,
]

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

  it('coupe à 96 caractères exactement un titre sans espace', () => {
    expect(slugify('a'.repeat(200))).toBe('a'.repeat(96))
    expect(slugify(`${'a'.repeat(96)} suite`)).toBe('a'.repeat(96))
  })

  it('met en minuscules et garde les chiffres', () => {
    expect(slugify('Top 10 : les 5 PLUS beaux lacs')).toBe('top-10-les-5-plus-beaux-lacs')
    expect(slugify('Journal du 21/10/2026')).toBe('journal-du-21-10-2026')
  })

  it('toutes les lettres accentuées du français, minuscules et majuscules', () => {
    expect(slugify('àâäéèêëîïôöùûüÿç ÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ')).toBe('aaaeeeeiioouuuyc-aaaeeeeiioouuuyc')
    // accents déjà décomposés (lettre + accent combinant)
    expect(slugify('Ge\u0301ne\u0300ve')).toBe('geneve')
  })

  it('ligatures du français : « œ » et « æ » deviennent « oe » et « ae »', () => {
    expect(slugify('Cœur de ville')).toBe('coeur-de-ville')
    expect(slugify('Les Œuvres du musée')).toBe('les-oeuvres-du-musee')
    expect(slugify('Ex æquo au slalom')).toBe('ex-aequo-au-slalom')
  })

  it('espaces insécables, tirets, guillemets et symboles : un seul tiret entre deux mots', () => {
    expect(slugify('Lyon\u00a0: la Fête — 8 décembre «\u00a02026\u00a0»')).toBe('lyon-la-fete-8-decembre-2026')
    expect(slugify('A & B / C + D')).toBe('a-b-c-d')
    expect(slugify('Neige\t\n  et   verglas')).toBe('neige-et-verglas')
  })

  it('un titre sans lettre ni chiffre latin donne une adresse vide', () => {
    for (const t of ['', '   ', '!!!', '« »', '— … —']) expect(slugify(t), t).toBe('')
  })

  it('le résultat ne contient que des lettres a-z, des chiffres et des tirets simples', () => {
    for (const t of TITLES) expect(slugify(t), t).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('une adresse déjà fabriquée ne change plus (idempotent)', () => {
    for (const t of TITLES) expect(slugify(slugify(t)), t).toBe(slugify(t))
    expect(slugify('le-lac-d-annecy-vu-du-ciel')).toBe('le-lac-d-annecy-vu-du-ciel')
  })
})
