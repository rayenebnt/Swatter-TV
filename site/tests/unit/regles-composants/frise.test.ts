// Frises chronologiques d'une page éditoriale (src/lib/timeline.ts) : étapes affichées dans l'ordre saisi, de la plus
// ancienne à la plus récente ; étape incomplète (image supprimée, titre vide d'un brouillon) ignorée ; image d'origine
// (les tailles de la médiathèque sont recadrées en 16:9, un logo serait coupé) et sa description, sinon le titre ; frises
// sans étape affichable omises. Étapes du matériel (src/lib/frise-materiel.ts) : celles qui parlent de caméra ou de matériel.
import { describe, expect, it } from 'vitest'
import { isEquipmentStep } from '@/lib/frise-materiel'
import { DEFAULT_TIMELINE_TITLE, timelineSteps, visibleTimelines, type PageTimeline } from '@/lib/timeline'
import type { Media } from '@/payload-types'

const media = (id: number, over: Partial<Media> = {}): Media =>
  ({
    id,
    alt: `Logo n° ${id}`,
    url: `/api/media/file/logo-${id}.webp`,
    filename: `logo-${id}.webp`,
    width: 800,
    height: 800,
    sizes: { card: { url: `/api/media/file/logo-${id}-960x540.webp`, width: 960, height: 540 } },
    updatedAt: '2026-11-02T10:00:00.000Z',
    createdAt: '2026-11-02T10:00:00.000Z',
    ...over,
  }) as Media

type Steps = NonNullable<PageTimeline['steps']>

describe('frise chronologique : étapes affichées', () => {
  it('dans l’ordre saisi ; image d’origine (jamais une taille recadrée) et sa description', () => {
    const steps: Steps = [
      { id: 'a', title: 'Swatter TV HD', image: media(1), date: ' Novembre 2025 ', text: ' Le tout premier logo. ' },
      { id: 'b', title: 'Le logo d’aujourd’hui', image: media(2, { width: 500, height: 500 }) },
    ]
    expect(timelineSteps({ steps })).toEqual([
      {
        key: 'a',
        date: 'Novembre 2025',
        title: 'Swatter TV HD',
        text: 'Le tout premier logo.',
        image: { src: '/api/media/file/logo-1.webp', alt: 'Logo n° 1', width: 800, height: 800 },
      },
      { key: 'b', date: null, title: 'Le logo d’aujourd’hui', text: null, image: { src: '/api/media/file/logo-2.webp', alt: 'Logo n° 2', width: 500, height: 500 } },
    ])
  })

  it('étape incomplète ignorée : image non chargée ou supprimée, titre vide ; description absente : le titre', () => {
    const steps: Steps = [
      { id: 'a', title: 'Image non chargée (numéro seul)', image: 3 },
      { id: 'b', title: '   ', image: media(4) },
      { id: 'c', title: 'Sans description', image: media(5, { alt: '' }) },
      { id: 'd', title: 'Fichier absent', image: media(6, { url: null }) },
    ]
    const shown = timelineSteps({ steps })
    expect(shown.map((s) => s.key)).toEqual(['c'])
    expect(shown[0].image.alt).toBe('Sans description')
  })

  it('pas de frise : aucune étape ; titre par défaut « Notre histoire »', () => {
    expect(timelineSteps(undefined)).toEqual([])
    expect(timelineSteps({ title: 'Notre logo', steps: null })).toEqual([])
    expect(timelineSteps({ steps: [] })).toEqual([])
    expect(DEFAULT_TIMELINE_TITLE).toBe('Notre histoire')
  })

  it('étape sans identifiant (donnée importée) : clé tirée de sa place', () => {
    expect(timelineSteps({ steps: [{ title: 'Étape', image: media(7) }] })[0].key).toBe('etape-0')
  })
})

describe('plusieurs frises sur une page', () => {
  it('dans l’ordre saisi ; une frise sans étape affichable (vide, ou images pas encore choisies) est omise', () => {
    const logos: PageTimeline = { id: 'f1', title: 'Notre logo au fil du temps', steps: [{ id: 'a', title: 'Swatter TV HD', image: media(1) }] }
    const empty: PageTimeline = { id: 'f2', title: 'Frise à venir', steps: [] }
    const unfinished: PageTimeline = { id: 'f3', title: 'Images à choisir', steps: [{ id: 'b', title: 'Étape', image: 9 }] }
    const equipment: PageTimeline = { id: 'f4', title: 'Notre matériel au fil du temps', steps: [{ id: 'c', title: '2026', date: 'La caméra reportage', image: media(2) }] }
    expect(visibleTimelines([logos, empty, unfinished, equipment]).map((t) => t.id)).toEqual(['f1', 'f4'])
    expect(visibleTimelines(null)).toEqual([])
    expect(visibleTimelines(undefined)).toEqual([])
  })
})

describe('étapes du matériel (npm run frise-materiel)', () => {
  it('celles dont la date, le titre ou le texte parle de caméra ou de matériel, accents et majuscules compris', () => {
    expect(isEquipmentStep({ date: 'La caméra reportage', title: '2026' })).toBe(true)
    expect(isEquipmentStep({ date: 'LA CAMÉRA SPECTACLE', title: '2026' })).toBe(true)
    expect(isEquipmentStep({ date: '2026', title: 'Nouvelle camera' })).toBe(true)
    expect(isEquipmentStep({ title: 'Régie', text: 'Tout le matériel du direct.' })).toBe(true)
    expect(isEquipmentStep({ date: 'Novembre', title: '2026' })).toBe(false)
    expect(isEquipmentStep({ date: null, title: 'Swatter TV Production', text: null })).toBe(false)
  })
})
