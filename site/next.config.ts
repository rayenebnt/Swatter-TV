import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: 'standalone',
  // NEXT_DIST_DIR : construction à part (tests de bout en bout, scripts/test-complet.mjs), sans toucher à .next ni à
  // tsconfig.json (Next y ajouterait les types de ce dossier : ils sont déjà dans tsconfig.next-test.json)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: { tsconfigPath: process.env.NEXT_DIST_DIR ? 'tsconfig.next-test.json' : 'tsconfig.json' },
  // Guide d'utilisation affiché par la page « Aide » de l'administration (lu sur le disque à l'exécution)
  outputFileTracingIncludes: { '/admin/\\[\\[\\.\\.\\.segments\\]\\]': ['./GUIDE_CLIENT.md'] },
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
      // Plan de l'ancien site (sitemap.xml de SiteW, octobre 2026) : pages sans équivalent exact → rubrique la plus proche
      ['/L-info-du-jour', '/info'],
      ['/Le-tirage-au-sort-L-info-du-jour', '/info'],
      ['/L-info-Haute-Savoie', '/info/haute-savoie'],
      ['/L-info-Savoie', '/info/savoie'],
      ['/L-info-L-ain', '/info/ain'],
      ['/L-info-Isere', '/info/isere'],
      ['/L-info-Rhone', '/info/rhone'],
      ['/L-info-Loire', '/info/loire'],
      ['/L-info-Haute-Loire', '/info/haute-loire'],
      ['/L-info-Drome', '/info/drome'],
      ['/L-info-Ardeche', '/info/ardeche'],
      ['/L-info-Puy-De-Dome', '/info/puy-de-dome'],
      ['/L-info-Cantal', '/info/cantal'],
      ['/L-info-Allier', '/info/allier'],
      ['/L-info-Geneve', '/info/autres-regions'],
      ['/L-info-Aoste', '/info/autres-regions'],
      ['/Nos-videos-du-jour', '/videos'],
      ['/Le-tirage-au-sort-Video-du-jour', '/videos'],
      ['/Le-Cinema-Films', '/videos?categorie=cinema'],
      ['/Le-Cinema-Dessin', '/videos?categorie=cinema'],
      ['/Les-Documentaires', '/videos?categorie=documentaire'],
      ['/Web-Cam-', '/webcams'],
      ['/Web-Cams-', '/webcams/plus'],
      ['/Manif-Samedi-17', '/agenda'],
      ['/Manif-Samedi-24', '/agenda'],
      ['/Deposer-une-publicite', '/contact?sujet=publicite'],
      ['/Casting', '/contact'],
      ['/Credit', '/credits'],
      ['/4-7-Avis', '/'],
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
