// Adresses publiques des contenus : un seul endroit pour toutes les rubriques (liens, sitemap, recherche, JSON-LD).
type WithSlug = { slug?: string | null }

export const articleUrl = (a: WithSlug & { department?: string | null }) =>
  `/info/${a.department || 'region'}/${a.slug ?? ''}`
export const videoUrl = (v: WithSlug) => `/videos/${v.slug ?? ''}`
export const replayUrl = (r: WithSlug) => `/replay/${r.slug ?? ''}`
export const eventUrl = (e: WithSlug) => `/agenda/${e.slug ?? ''}`
export const webcamUrl = (w: WithSlug) => `/webcams#${w.slug ?? ''}`
export const programUrl = (p: WithSlug) => `/programme-tv#${p.slug ?? ''}`
export const pageUrl = (p: WithSlug) => `/${p.slug ?? ''}`
/** L'info ne couvre que la Haute-Savoie : la page d'un département est celle de L'Info. */
export const departmentUrl = (_dept: string) => '/info'
