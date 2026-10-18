import type { CollectionSlug, Field, FieldHook } from 'payload'
import { slugify } from '@/lib/slugify'

/**
 * Adresse libre dans la collection : « titre », sinon « titre-2 », « titre-3 »… (le document lui-même excepté).
 * Deux contenus de même titre (le replay quotidien d'une émission…) s'enregistrent donc sans erreur « valeur unique ».
 */
const uniqueSlug =
  (source: string): FieldHook =>
  async ({ value, data, originalDoc, req, collection }) => {
    const typed = typeof value === 'string' && value.trim() ? slugify(value) : ''
    const from = data?.[source]
    const base = typed || (typeof from === 'string' && from ? slugify(from) : '')
    if (!base || !collection) return base || value
    // le suffixe doit tenir dans les 96 caractères de slugify
    const stem = base.slice(0, 90).replace(/-+$/, '')
    const candidates = [base, ...Array.from({ length: 49 }, (_, i) => `${stem}-${i + 2}`)]
    const id = originalDoc?.id
    const { docs } = await req.payload.find({
      collection: collection.slug as CollectionSlug,
      where: { and: [{ slug: { in: candidates } }, ...(id ? [{ id: { not_equals: id } }] : [])] },
      limit: candidates.length,
      pagination: false,
      depth: 0,
      req,
    })
    const taken = new Set(docs.map((d) => (d as { slug?: string | null }).slug))
    return candidates.find((c) => !taken.has(c)) ?? `${stem}-${Date.now().toString(36)}`
  }

/** Champ « slug » (fin de l'adresse de la page), rempli automatiquement depuis le titre. */
export const slugField = (source = 'title'): Field => ({
  name: 'slug',
  label: 'Adresse web (automatique)',
  type: 'text',
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Se remplit toute seule à partir du titre à l’enregistrement. Inutile d’y toucher.',
  },
  hooks: { beforeValidate: [uniqueSlug(source)] },
})
