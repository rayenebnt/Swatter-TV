// Départements d'Auvergne-Rhône-Alpes (src/lib/departments.ts : liste, libellés, zones des webcams et « Web Cams + ») et
// tournures dans une phrase (src/lib/places.ts : « en Isère », « de l’Isère »… pour chaque département).
import { describe, expect, it } from 'vitest'
import { DEPARTMENTS, WEBCAMS_PLUS, WEBCAM_ZONES, departmentLabel, isDepartment, isWebcamZone, webcamZoneLabel, type DepartmentSlug } from '@/lib/departments'
import { inPlace, ofPlace } from '@/lib/places'
import { slugify } from '@/lib/slugify'

/** Les 12 départements de la région, avec leur numéro officiel et leurs tournures. */
const EXPECTED: { value: DepartmentSlug; label: string; code: string; in: string; of: string }[] = [
  { value: 'haute-savoie', label: 'Haute-Savoie', code: '74', in: 'en Haute-Savoie', of: 'de la Haute-Savoie' },
  { value: 'savoie', label: 'Savoie', code: '73', in: 'en Savoie', of: 'de la Savoie' },
  { value: 'ain', label: 'Ain', code: '01', in: 'dans l’Ain', of: 'de l’Ain' },
  { value: 'isere', label: 'Isère', code: '38', in: 'en Isère', of: 'de l’Isère' },
  { value: 'rhone', label: 'Rhône', code: '69', in: 'dans le Rhône', of: 'du Rhône' },
  { value: 'loire', label: 'Loire', code: '42', in: 'dans la Loire', of: 'de la Loire' },
  { value: 'haute-loire', label: 'Haute-Loire', code: '43', in: 'en Haute-Loire', of: 'de la Haute-Loire' },
  { value: 'drome', label: 'Drôme', code: '26', in: 'dans la Drôme', of: 'de la Drôme' },
  { value: 'ardeche', label: 'Ardèche', code: '07', in: 'en Ardèche', of: 'de l’Ardèche' },
  { value: 'puy-de-dome', label: 'Puy-de-Dôme', code: '63', in: 'dans le Puy-de-Dôme', of: 'du Puy-de-Dôme' },
  { value: 'cantal', label: 'Cantal', code: '15', in: 'dans le Cantal', of: 'du Cantal' },
  { value: 'allier', label: 'Allier', code: '03', in: 'dans l’Allier', of: 'de l’Allier' },
]

describe('départements de la région', () => {
  it('les 12 départements d’Auvergne-Rhône-Alpes, avec leur numéro', () => {
    expect(DEPARTMENTS.map(({ value, label, code }) => ({ value, label, code }))).toEqual(EXPECTED.map(({ value, label, code }) => ({ value, label, code })))
  })

  it('valeurs, libellés et numéros uniques ; la valeur (adresse /info/<département>) vient du nom', () => {
    for (const key of ['value', 'label', 'code'] as const) expect(new Set(DEPARTMENTS.map((d) => d[key])).size).toBe(12)
    for (const d of DEPARTMENTS) expect(d.value).toBe(slugify(d.label))
  })

  it('departmentLabel : le nom du département, « Auvergne-Rhône-Alpes » sinon', () => {
    for (const d of EXPECTED) expect(departmentLabel(d.value)).toBe(d.label)
    for (const v of [null, undefined, '', 'region', 'plus', 'paris', 'Isère']) expect(departmentLabel(v), String(v)).toBe('Auvergne-Rhône-Alpes')
  })

  it('isDepartment : seulement les 12 valeurs (ni libellé, ni numéro, ni « plus »)', () => {
    for (const d of DEPARTMENTS) expect(isDepartment(d.value)).toBe(true)
    for (const v of ['Haute-Savoie', 'HAUTE-SAVOIE', '74', 'plus', 'region', '', ' ain', 'ain ', 'toString', '__proto__']) {
      expect(isDepartment(v), v).toBe(false)
    }
  })
})

describe('zones des webcams : départements et « Web Cams + »', () => {
  it('les 12 départements dans le même ordre, puis « Web Cams + » (vues hors de la région)', () => {
    expect(WEBCAMS_PLUS).toBe('plus')
    expect(WEBCAM_ZONES).toEqual([...DEPARTMENTS.map(({ value, label }) => ({ value, label })), { value: 'plus', label: 'Web Cams +' }])
  })

  it('isWebcamZone : un département ou « plus »', () => {
    for (const z of WEBCAM_ZONES) expect(isWebcamZone(z.value), z.value).toBe(true)
    for (const v of ['PLUS', 'Plus', 'web-cams-plus', 'region', '', 'Isère', 'suisse']) expect(isWebcamZone(v), v).toBe(false)
  })

  it('webcamZoneLabel : « Web Cams + » ou le nom du département', () => {
    expect(webcamZoneLabel('plus')).toBe('Web Cams +')
    for (const d of EXPECTED) expect(webcamZoneLabel(d.value)).toBe(d.label)
  })
})

describe('tournures des départements dans une phrase', () => {
  it('chaque département a les siennes (« en », « dans le », « dans l’ »… ; « de la », « du », « de l’ »)', () => {
    for (const d of EXPECTED) {
      expect(inPlace(d.value), d.value).toBe(d.in)
      expect(ofPlace(d.value), d.value).toBe(d.of)
    }
  })

  it('toute la région : « en Auvergne-Rhône-Alpes », « de toute la région »', () => {
    expect(inPlace(null)).toBe('en Auvergne-Rhône-Alpes')
    expect(ofPlace(null)).toBe('de toute la région')
  })

  it('chaque tournure contient le nom du département, avec l’apostrophe typographique', () => {
    for (const d of DEPARTMENTS) {
      expect(inPlace(d.value).endsWith(d.label), d.value).toBe(true)
      expect(ofPlace(d.value).endsWith(d.label), d.value).toBe(true)
      expect(`${inPlace(d.value)} ${ofPlace(d.value)}`).not.toContain("'")
    }
    expect(new Set(DEPARTMENTS.map((d) => inPlace(d.value))).size).toBe(12)
    expect(new Set(DEPARTMENTS.map((d) => ofPlace(d.value))).size).toBe(12)
  })

  it('les phrases du site se lisent correctement', () => {
    expect(`L’info ${inPlace('isere')}`).toBe('L’info en Isère')
    expect(`Toute l’actualité ${ofPlace('rhone')}`).toBe('Toute l’actualité du Rhône')
    expect(`La météo ${inPlace('ain')}`).toBe('La météo dans l’Ain')
    expect(`Webcams ${inPlace('puy-de-dome')}`).toBe('Webcams dans le Puy-de-Dôme')
  })
})
