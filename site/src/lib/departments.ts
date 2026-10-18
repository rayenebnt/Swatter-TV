/**
 * Départements qu'un article peut porter en base (valeurs conservées pour ne pas casser d'anciens contenus). Le site
 * ne publie plus que l'info de la Haute-Savoie : voir INFO_DEPARTMENT.
 */
export const ALL_DEPARTMENTS = [
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

export type DepartmentSlug = (typeof ALL_DEPARTMENTS)[number]['value']

/** L'info du site : la Haute-Savoie seulement (tout article y est rangé). */
export const INFO_DEPARTMENT: DepartmentSlug = 'haute-savoie'

/** Départements affichés par le site (filtres, pages) : la Haute-Savoie. */
export const DEPARTMENTS = ALL_DEPARTMENTS.filter((d) => d.value === INFO_DEPARTMENT)

export const departmentLabel = (slug?: string | null): string => ALL_DEPARTMENTS.find((d) => d.value === slug)?.label ?? 'Haute-Savoie'

export const isDepartment = (slug: string): slug is DepartmentSlug => DEPARTMENTS.some((d) => d.value === slug)
