// Tests unitaires de src/components/search/ (text.ts, rubriques.ts, visuals.ts) : normalisation du texte (sans casse
// ni accents, longueur conservée pour le surlignage), nettoyage et découpage de la requête, mots surlignés dans les
// titres, rubriques proposées et adresse de la page de résultats.
import { describe, expect, it } from 'vitest'
import { RUBRIQUES, searchPageUrl, SUGGESTIONS } from '@/components/search/rubriques'
import { cleanQuery, foldText, highlightParts, MAX_QUERY, queryWords, splitWords } from '@/components/search/text'
import { fallbackVisual, isRemote } from '@/components/search/visuals'

describe('foldText : texte sans casse ni accents', () => {
  it('minuscules, accents et cédilles retirés', () => {
    expect(foldText('Météo d’Annecy')).toBe("meteo d'annecy")
    expect(foldText('ÉTÉ À LA CRÈCHE, GARÇON')).toBe('ete a la creche, garcon')
    expect(foldText('Île, Noël, Haïti, Ça, Où')).toBe('ile, noel, haiti, ca, ou')
    expect(foldText('Saint-Étienne')).toBe('saint-etienne')
  })

  it('apostrophes courbes et lettre apostrophe remplacées par l’apostrophe droite, espaces insécables par une espace', () => {
    expect(foldText('l’été ‘bis’ dʼici')).toBe("l'ete 'bis' d'ici")
    expect(foldText('20\u00a0h\u202f30')).toBe('20 h 30')
  })

  it('même longueur que le texte d’origine (positions alignées pour le surlignage), émojis et ligatures compris', () => {
    for (const text of ['Météo d’Annecy', 'Œuvre à cœur', 'Straße', 'Fête \u{1F389} au lac', 'İstanbul', 'ﬁn', '한국어', 'Cafe\u0301']) {
      expect(foldText(text), text).toHaveLength(text.length)
    }
    expect(foldText('Fête \u{1F389}')).toBe('fete \u{1F389}')
    expect(foldText('Œuvre')).toBe('œuvre')
  })

  it('texte vide', () => {
    expect(foldText('')).toBe('')
  })
})

describe('cleanQuery et splitWords : requête nettoyée et découpée', () => {
  it('espaces resserrés (tabulations, retours à la ligne, insécables) et retirés aux deux bouts', () => {
    expect(cleanQuery('  lac \t d’Annecy\n\u00a0 ')).toBe('lac d’Annecy')
    expect(cleanQuery(null)).toBe('')
    expect(cleanQuery(undefined)).toBe('')
  })

  it('80 caractères au plus', () => {
    expect(MAX_QUERY).toBe(80)
    expect(cleanQuery('a'.repeat(200))).toHaveLength(80)
  })

  it('guillemets ignorés, ponctuation de début et de fin de mot retirée, apostrophes et traits d’union internes gardés', () => {
    expect(splitWords('"Lac d’Annecy !"')).toEqual(['Lac', 'd’Annecy'])
    expect(splitWords('« Fête des lumières », (Lyon) — 2026…')).toEqual(['Fête', 'des', 'lumières', 'Lyon', '2026'])
    expect(splitWords('“Saint-Étienne” ‹bis› „ok“')).toEqual(['Saint-Étienne', 'bis', 'ok'])
    expect(splitWords('  ?! … -- ')).toEqual([])
    expect(splitWords('')).toEqual([])
  })

  it('mots de la requête : pliés, sans doublon, six au plus', () => {
    expect(queryWords('  Météo  METEO météo d’Annecy ')).toEqual(['meteo', "d'annecy"])
    expect(queryWords('un deux trois quatre cinq six sept huit')).toEqual(['un', 'deux', 'trois', 'quatre', 'cinq', 'six'])
    expect(queryWords('« ! »')).toEqual([])
    expect(queryWords('')).toEqual([])
  })
})

describe('highlightParts : mots de la requête surlignés dans un titre', () => {
  const join = (parts: { text: string }[]) => parts.map((p) => p.text).join('')

  it('repère les mots sans tenir compte de la casse ni des accents, en gardant le texte d’origine', () => {
    expect(highlightParts('La Météo d’Annecy', ['meteo', "d'annecy"])).toEqual([
      { text: 'La ', hit: false },
      { text: 'Météo', hit: true },
      { text: ' ', hit: false },
      { text: 'd’Annecy', hit: true },
    ])
  })

  it('toutes les occurrences, au milieu des mots aussi', () => {
    expect(highlightParts('Lac, lacets et Lac', ['lac'])).toEqual([
      { text: 'Lac', hit: true },
      { text: ', ', hit: false },
      { text: 'lac', hit: true },
      { text: 'ets et ', hit: false },
      { text: 'Lac', hit: true },
    ])
  })

  it('mots qui se chevauchent : jamais deux fois le même caractère', () => {
    const parts = highlightParts('Annecy', ['anne', 'necy'])
    expect(join(parts)).toBe('Annecy')
    expect(
      parts
        .filter((p) => p.hit)
        .map((p) => p.text)
        .join(''),
    ).toBe('Annecy')
  })

  it('mots d’une lettre ignorés ; aucun mot trouvé : le texte entier, non surligné', () => {
    expect(highlightParts('À la une', ['a', 'l'])).toEqual([{ text: 'À la une', hit: false }])
    expect(highlightParts('Chamonix', ['annecy'])).toEqual([{ text: 'Chamonix', hit: false }])
    expect(highlightParts('Chamonix', [])).toEqual([{ text: 'Chamonix', hit: false }])
  })

  it('les morceaux recomposent toujours le texte d’origine', () => {
    const titles = ['Fête \u{1F389} du lac d’Annecy', 'ÉTÉ À ÉVIAN', 'Œuvre à cœur', 'Saint-Étienne : le derby']
    const words = [
      ['fete', 'lac'],
      ['ete', 'evian'],
      ['œuvre', 'cœur'],
      ['etienne', 'derby', 'le'],
    ]
    titles.forEach((title, i) => {
      const parts = highlightParts(title, words[i])
      expect(join(parts), title).toBe(title)
      expect(
        parts.some((p) => p.hit),
        title,
      ).toBe(true)
    })
  })
})

describe('rubriques proposées et page de résultats', () => {
  it('les huit rubriques du site, dans l’ordre du menu, avec un texte d’aide', () => {
    expect(RUBRIQUES.map((r) => [r.href, r.label])).toEqual([
      ['/direct', 'Le Direct'],
      ['/programme-tv', 'Programme TV'],
      ['/meteo', 'La Météo'],
      ['/info', 'L’Info'],
      ['/agenda', 'Agenda'],
      ['/replay', 'Le Replay'],
      ['/videos', 'Vidéos'],
      ['/webcams', 'Webcams'],
    ])
    for (const r of RUBRIQUES) {
      expect(r.hint.length, r.href).toBeGreaterThan(5)
      expect(r.icon, r.href).toBeTruthy()
    }
    expect(new Set(RUBRIQUES.map((r) => r.href)).size).toBe(RUBRIQUES.length)
  })

  it('suggestions du champ vide : les six premières rubriques', () => {
    expect(SUGGESTIONS).toEqual(RUBRIQUES.slice(0, 6))
  })

  it('adresse des résultats complets, requête encodée', () => {
    expect(searchPageUrl('lac')).toBe('/recherche?q=lac')
    expect(searchPageUrl('Météo d’Annecy')).toBe('/recherche?q=M%C3%A9t%C3%A9o%20d%E2%80%99Annecy')
    expect(searchPageUrl('a&b=c?#/+')).toBe('/recherche?q=a%26b%3Dc%3F%23%2F%2B')
    expect(searchPageUrl('')).toBe('/recherche')
    expect(searchPageUrl(null)).toBe('/recherche')
    expect(searchPageUrl(undefined)).toBe('/recherche')
  })
})

describe('visuels des résultats sans image', () => {
  it('visuel de repli stable pour une même adresse, pris parmi ceux de la maquette', () => {
    const v = fallbackVisual('/videos/balade-au-semnoz')
    expect(v).toMatch(/^\/visuels\/t-[a-z]+-[ab]\.webp$/)
    expect(fallbackVisual('/videos/balade-au-semnoz')).toBe(v)
    const all = new Set(Array.from({ length: 200 }, (_, i) => fallbackVisual(`/agenda/evenement-${i}`)))
    expect(all.size).toBe(8)
  })

  it('image distante (http ou https) servie telle quelle', () => {
    expect(isRemote('https://i.ytimg.com/vi/x/hqdefault.jpg')).toBe(true)
    expect(isRemote('http://example.com/a.jpg')).toBe(true)
    expect(isRemote('/api/media/file/a.webp')).toBe(false)
    expect(isRemote('/visuels/t-nuit-a.webp')).toBe(false)
  })
})
