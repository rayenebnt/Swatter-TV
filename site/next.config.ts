import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    localPatterns: [{ pathname: '/api/media/file/**' }, { pathname: '/visuels/**' }],
    // Seul hôte distant optimisé : les miniatures YouTube. Les médias (dossier local ou S3) passent par /api/media/file ;
    // les images des articles importés par RSS sont affichées sans optimiseur (unoptimized).
    remotePatterns: [{ protocol: 'https', hostname: 'i.ytimg.com' }],
  },
  // Anciennes adresses du site, redirigées de façon permanente (308). La correspondance ignore la casse
  // (experimental.caseSensitiveRoutes vaut false) : « /L-info » couvre aussi /L-Info et /l-info ; la barre oblique finale
  // est retirée par Next avant ces règles. Les adresses qui ne diffèrent de la nouvelle que par la casse (/Agenda,
  // /Programme-TV, /Webcams…) boucleraient ici : src/app/(frontend)/[...slug] les redirige, ainsi que les variantes accentuées.
  async redirects() {
    const legacy: [string, string][] = [
      ['/Accueil', '/'],
      ['/Le-Direct', '/direct'],
      ['/LeDirect', '/direct'],
      ['/L-info', '/info'],
      ['/Linfo', '/info'],
      ['/La-Meteo', '/meteo'],
      ['/LaMeteo', '/meteo'],
      ['/ProgrammeTV', '/programme-tv'],
      ['/Le-Replay', '/replay'],
      ['/LeReplay', '/replay'],
      ['/Webcam', '/webcams'],
    ]
    return legacy.map(([source, destination]) => ({ source, destination, permanent: true }))
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HTTPS imposé aux visites suivantes (ignoré en HTTP, donc sans effet en développement) ; sous-domaines non concernés
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
  turbopack: { root: path.resolve(dirname) },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
