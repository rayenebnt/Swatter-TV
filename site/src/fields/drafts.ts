import type { CollectionConfig, GlobalConfig } from 'payload'

/**
 * Brouillons : les modifications sont enregistrées automatiquement pendant la saisie (visibles dans l'aperçu en direct)
 * et n'arrivent sur le site qu'au clic sur « Publier les modifications ». Intervalle court : l'aperçu suit la saisie.
 */
const AUTOSAVE_MS = 300

export const draftVersions: CollectionConfig['versions'] = { drafts: { autosave: { interval: AUTOSAVE_MS } }, maxPerDoc: 25 }

export const globalDraftVersions: GlobalConfig['versions'] = { drafts: { autosave: { interval: AUTOSAVE_MS } }, max: 25 }
