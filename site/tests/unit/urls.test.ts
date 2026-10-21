// Adresses publiques des contenus (src/lib/urls.ts) : une par rubrique, conformes au plan du site (DEV_NOTES, « Adresses
// du site ») ; utilisées par les liens, le plan du site, la recherche et les données structurées.
import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '@/lib/departments'
import { articleUrl, departmentUrl, eventUrl, pageUrl, programUrl, replayUrl, videoUrl, webcamUrl } from '@/lib/urls'

describe('adresses des contenus', () => {
  it('vidéo, replay, événement, page éditoriale', () => {
    expect(videoUrl({ slug: 'le-lac-d-annecy-vu-du-ciel' })).toBe('/videos/le-lac-d-annecy-vu-du-ciel')
    expect(replayUrl({ slug: 'le-journal-du-21-octobre' })).toBe('/replay/le-journal-du-21-octobre')
    expect(eventUrl({ slug: 'fete-des-lumieres-2026' })).toBe('/agenda/fete-des-lumieres-2026')
    expect(pageUrl({ slug: 'mentions-legales' })).toBe('/mentions-legales')
  })

  it('article : rangé dans son département, ou dans « region » pour toute la région', () => {
    expect(articleUrl({ slug: 'un-article', department: 'isere' })).toBe('/info/isere/un-article')
    expect(articleUrl({ slug: 'un-article', department: 'haute-savoie' })).toBe('/info/haute-savoie/un-article')
    for (const department of [null, undefined, '']) expect(articleUrl({ slug: 'un-article', department }), String(department)).toBe('/info/region/un-article')
    expect(articleUrl({ slug: 'un-article' })).toBe('/info/region/un-article')
  })

  it('webcam et émission : une ancre sur la page de la rubrique', () => {
    expect(webcamUrl({ slug: 'lac-d-annecy' })).toBe('/webcams#lac-d-annecy')
    expect(programUrl({ slug: 'le-journal' })).toBe('/programme-tv#le-journal')
  })

  it('info d’un département : /info/<département>, et l’article y est rangé', () => {
    for (const d of DEPARTMENTS) {
      expect(departmentUrl(d.value)).toBe(`/info/${d.value}`)
      expect(articleUrl({ slug: 'x', department: d.value }).startsWith(`${departmentUrl(d.value)}/`)).toBe(true)
    }
  })

  it('sans adresse (contenu pas encore enregistré) : jamais « undefined » ni « null » dans le lien', () => {
    for (const slug of [null, undefined]) {
      const urls = [videoUrl, replayUrl, eventUrl, pageUrl, webcamUrl, programUrl, articleUrl].map((url) => url({ slug }))
      expect(urls).toEqual(['/videos/', '/replay/', '/agenda/', '/', '/webcams#', '/programme-tv#', '/info/region/'])
    }
  })

  it('toutes les adresses sont des chemins internes du site', () => {
    const urls = [videoUrl, replayUrl, eventUrl, pageUrl, webcamUrl, programUrl].map((url) => url({ slug: 'a' }))
    for (const u of [...urls, articleUrl({ slug: 'a', department: 'ain' }), departmentUrl('ain')]) {
      expect(u.startsWith('/') && !u.startsWith('//'), u).toBe(true)
    }
  })
})
