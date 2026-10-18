// Visuels de repli des résultats de recherche sans image (visuels de la maquette, public/visuels/).
const VISUALS = ['t-crepuscule-a', 't-matin-a', 't-nuit-b', 't-ete-a', 't-hiver-a', 't-alpenglow-a', 't-nuages-a', 't-orage-b']

/** Visuel stable d'après une clé (l'adresse du résultat). */
export const fallbackVisual = (key: string) => `/visuels/${VISUALS[[...key].reduce((s, ch) => s + ch.charCodeAt(0), 0) % VISUALS.length]}.webp`

/** Image distante : servie telle quelle, l'optimiseur n'accepte que les hôtes déclarés. */
export const isRemote = (src: string) => /^https?:\/\//.test(src)
