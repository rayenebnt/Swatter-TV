import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

/** Tout est ouvert aux robots sauf l'administration, l'API et les résultats de recherche ; les médias (/api/media/file/) restent accessibles (images des articles, Open Graph). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/api/media/file/'], disallow: ['/admin', '/api/', '/recherche'] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
