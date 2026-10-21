/** Départements d'Auvergne-Rhône-Alpes (+ libellés courts pour les filtres). */
export const DEPARTMENTS = [
  { value: 'haute-savoie', label: 'Haute-Savoie', code: '74' },
  { value: 'savoie', label: 'Savoie', code: '73' },
  { value: 'ain', label: 'Ain', code: '01' },
  { value: 'isere', label: 'Isère', code: '38' },
  { value: 'rhone', label: 'Rhône', code: '69' },
  { value: 'loire', label: 'Loire', code: '42' },
  { value: 'haute-loire', label: 'Haute-Loire', code: '43' },
  { value: 'drome', label: 'Drôme', code: '26' },
  { value: 'ardeche', label: 'Ardèche', code: '07' },
  { value: 'puy-de-dome', label: 'Puy-de-Dôme', code: '63' },
  { value: 'cantal', label: 'Cantal', code: '15' },
  { value: 'allier', label: 'Allier', code: '03' },
] as const

export type DepartmentSlug = (typeof DEPARTMENTS)[number]['value']

export const departmentLabel = (slug?: string | null): string =>
  DEPARTMENTS.find((d) => d.value === slug)?.label ?? 'Auvergne-Rhône-Alpes'

export const isDepartment = (slug: string): slug is DepartmentSlug => DEPARTMENTS.some((d) => d.value === slug)

/**
 * Webcams : un département de la région, ou « Web Cams + » (vues hors de la région : Suisse, Vallée d'Aoste…), avec sa
 * propre page /webcams/plus.
 */
export const WEBCAMS_PLUS = 'plus'
export type WebcamZone = DepartmentSlug | typeof WEBCAMS_PLUS
export const WEBCAM_ZONES = [...DEPARTMENTS.map(({ value, label }) => ({ value, label })), { value: WEBCAMS_PLUS, label: 'Web Cams +' }] as const
export const isWebcamZone = (slug: string): slug is WebcamZone => slug === WEBCAMS_PLUS || isDepartment(slug)
export const webcamZoneLabel = (zone: WebcamZone): string => (zone === WEBCAMS_PLUS ? 'Web Cams +' : departmentLabel(zone))
