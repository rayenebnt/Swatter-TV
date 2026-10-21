// Mesure d'audience (Google Analytics 4) : identifiant de mesure saisi dans les réglages du site.

/** « ID de mesure » d'un flux de données GA4 : « G- » puis des lettres majuscules et des chiffres (G-AB12CD34EF). */
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,16}$/

/**
 * Vrai pour un ID de mesure bien formé. L'identifiant finit dans le code de la page (adresse de gtag.js, commande
 * « config ») : rien d'autre n'y est jamais accepté.
 */
export const isMeasurementId = (value: unknown): value is string => typeof value === 'string' && MEASUREMENT_ID.test(value)

/** Saisie nettoyée : espaces retirés, majuscules (un « g-ab12… » collé tel quel reste valable). */
export const normalizeMeasurementId = (value: unknown): unknown => (typeof value === 'string' ? value.trim().toUpperCase() : value)
