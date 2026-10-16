/** Catégories de vidéos (rubrique « Vidéos du jour »). */
export const VIDEO_CATEGORIES = [
  { value: 'divertissement', label: 'Divertissement' },
  { value: 'series-realite', label: 'Séries-réalité' },
  { value: 'series', label: 'Séries' },
  { value: 'cinema', label: 'Cinéma' },
  { value: 'documentaire', label: 'Documentaire' },
  { value: 'nature', label: 'Nature' },
  { value: 'sport', label: 'Sport' },
  { value: 'info', label: 'Info' },
  { value: 'magazine', label: 'Magazine' },
] as const

/** Genres des émissions (grille du programme TV). */
export const PROGRAM_GENRES = [
  { value: 'info', label: 'Info' },
  { value: 'meteo', label: 'Météo' },
  { value: 'documentaire', label: 'Documentaire' },
  { value: 'magazine', label: 'Magazine' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'divertissement', label: 'Divertissement' },
  { value: 'sport', label: 'Sport' },
  { value: 'serie', label: 'Série' },
  { value: 'cinema', label: 'Cinéma' },
] as const

/** Catégories d'événements (agenda). */
export const EVENT_CATEGORIES = [
  { value: 'terroir', label: 'Terroir' },
  { value: 'musique', label: 'Musique' },
  { value: 'sport', label: 'Sport' },
  { value: 'famille', label: 'Famille' },
  { value: 'culture', label: 'Culture' },
  { value: 'fete', label: 'Fête' },
  { value: 'marche', label: 'Marché' },
  { value: 'autre', label: 'Autre' },
] as const

export const labelOf = (list: readonly { value: string; label: string }[], value?: string | null): string =>
  list.find((x) => x.value === value)?.label ?? ''
