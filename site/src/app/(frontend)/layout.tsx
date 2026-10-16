import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'

import { CookieBanner } from '@/components/layout/CookieBanner'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { TabBar } from '@/components/layout/TabBar'
import { SearchOverlay } from '@/components/search/SearchOverlay'
import { SiteJsonLd } from '@/components/seo/SiteJsonLd'
import { Effects } from '@/components/ui/Effects'
import { IconSprite } from '@/components/ui/Icon'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'
import '@/styles/globals.css'

const outfit = localFont({ src: '../fonts/outfit.woff2', variable: '--font-outfit', weight: '100 900', display: 'swap' })
const inter = localFont({ src: '../fonts/inter.woff2', variable: '--font-inter', weight: '100 900', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Swatter TV — La chaîne de la Haute-Savoie : direct, info, météo, replay', template: '%s — Swatter TV' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url: SITE_URL },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  alternates: { canonical: '/' },
}

export const viewport: Viewport = { themeColor: '#071224', colorScheme: 'dark' }

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${outfit.variable} ${inter.variable} no-js`}>
      <body>
        <IconSprite />
        <a className="skip-link" href="#contenu">
          Aller au contenu
        </a>
        <Header />
        <main id="contenu">{children}</main>
        <Footer />
        <TabBar />
        <SearchOverlay />
        <CookieBanner />
        <Effects />
        <SiteJsonLd />
      </body>
    </html>
  )
}
