import { JsonLd } from '@/components/ui/JsonLd'
import { getSettings } from '@/lib/queries/settings'
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'
import type { Setting } from '@/payload-types'

const ORG_ID = `${SITE_URL}/#organization`
const SITE_ID = `${SITE_URL}/#website`

/** Adresse des réglages (« 36 rue …, 74300 Thyez \n Haute-Savoie · … ») → PostalAddress ; texte brut si le format diffère. */
function postalAddress(raw?: string | null): Record<string, string> | string | undefined {
  const lines = (raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return undefined
  const m = /^(.+?),?\s+(\d{5})\s+(.+)$/.exec(lines[0])
  if (!m) return lines.join(', ')
  const region = lines[1]?.split('·')[0]?.trim()
  return {
    '@type': 'PostalAddress',
    streetAddress: m[1].replace(/,\s*$/, ''),
    postalCode: m[2],
    addressLocality: m[3],
    ...(region ? { addressRegion: region } : {}),
    addressCountry: 'FR',
  }
}

/** Réseaux sociaux renseignés (adresses http/https uniquement). */
function sameAs(socials: Setting['socials']): string[] {
  return [socials?.facebook, socials?.instagram, socials?.youtube, socials?.tiktok].filter((u): u is string => !!u && /^https?:\/\//.test(u.trim())).map((u) => u.trim())
}

/** Données structurées du site : la chaîne (TelevisionStation, une Organization) et le site avec sa recherche interne. */
export async function SiteJsonLd() {
  const settings = await getSettings()
  const address = postalAddress(settings?.contact?.address)
  const email = settings?.contact?.email?.trim()
  const links = sameAs(settings?.socials)

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'TelevisionStation',
            '@id': ORG_ID,
            name: SITE_NAME,
            alternateName: 'Swatter TV & Info',
            url: SITE_URL,
            logo: { '@type': 'ImageObject', url: absoluteUrl('/apple-touch-icon.png'), width: 180, height: 180 },
            description: SITE_DESCRIPTION,
            ...(email ? { email } : {}),
            ...(address ? { address } : {}),
            ...(links.length ? { sameAs: links } : {}),
          },
          {
            '@type': 'WebSite',
            '@id': SITE_ID,
            url: SITE_URL,
            name: SITE_NAME,
            description: SITE_DESCRIPTION,
            inLanguage: 'fr-FR',
            publisher: { '@id': ORG_ID },
            potentialAction: {
              '@type': 'SearchAction',
              target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/recherche?q={search_term_string}` },
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      }}
    />
  )
}
