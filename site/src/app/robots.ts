import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

/**
 * Tout est ouvert aux robots sauf l'administration, l'API, les résultats de recherche et l'espace membres (pages de
 * connexion comprises : le lien « Se connecter » de chaque page porterait sinon une variante ?retour= par page à explorer) ;
 * les médias (/api/media/file/) restent accessibles (images des articles, Open Graph).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/api/media/file/'], disallow: ['/admin', '/api/', '/recherche', '/compte', '/connexion', '/inscription', '/mot-de-passe-oublie'] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
