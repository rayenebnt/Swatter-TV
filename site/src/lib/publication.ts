// Contenus publiés ou brouillons (sans dépendance à la configuration Payload : importé par la configuration elle-même).
import type { Payload, Where } from 'payload'

/** Collections à brouillons : le site n'en montre que les versions publiées, sauf en mode aperçu. */
export const DRAFT_COLLECTIONS = ['videos', 'articles', 'events', 'replays', 'pages', 'schedule', 'programs', 'webcams', 'ads'] as const

const drafted = new Set<string>(DRAFT_COLLECTIONS)

export const PUBLISHED: Where = { _status: { equals: 'published' } }

const onlyPublished = (where?: Where): Where => (where ? { and: [where, PUBLISHED] } : PUBLISHED)

type Args = { collection?: string; where?: Where; draft?: boolean } & Record<string, unknown>

/**
 * Client Payload du site : find / count / findDistinct sur une collection à brouillons ne renvoient que les contenus
 * publiés ; en mode aperçu, les dernières versions (brouillons compris), et les réglages en brouillon.
 */
export function publicationAware(payload: Payload, preview: boolean): Payload {
  return new Proxy(payload, {
    get(target, prop) {
      const value = Reflect.get(target, prop)
      if (typeof value !== 'function') return value
      if (prop === 'find' || prop === 'count' || prop === 'findDistinct') {
        return (args: Args) => {
          if (!args?.collection || !drafted.has(args.collection)) return value.call(target, args)
          if (!preview) return value.call(target, { ...args, where: onlyPublished(args.where) })
          // count et findDistinct ne lisent pas les brouillons : en aperçu, tous les documents, quel que soit leur statut
          return value.call(target, prop === 'find' ? { ...args, draft: true } : args)
        }
      }
      if (prop === 'findGlobal') return (args: Args) => value.call(target, preview ? { ...args, draft: true } : args)
      return value.bind(target)
    },
  })
}
