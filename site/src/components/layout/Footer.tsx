import Link from 'next/link'
import { Fragment } from 'react'
import { Icon, Logo } from '@/components/ui/Icon'
import { parisDay } from '@/lib/format'
import { getPayloadClient } from '@/lib/payload'
import { getSettings } from '@/lib/queries/settings'
import { safe } from '@/lib/safe'
import { pageUrl } from '@/lib/urls'
import { CookieSettingsButton } from './CookieSettingsButton'
import '@/styles/footer.css'

type FooterLink = { href: string; label: string }

/** Pages éditoriales rattachées à une colonne du pied de page (canaux de réception, le groupe, crédits…). */
async function getFooterPages() {
  return safe(
    async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'pages',
        where: { footerGroup: { in: ['chaine', 'swatter'] } },
        sort: 'title',
        depth: 0,
        limit: 40,
        pagination: false,
        select: { title: true, slug: true, footerGroup: true },
      })
      return res.docs.filter((p) => p.slug).map((p) => ({ group: p.footerGroup, href: pageUrl(p), label: p.title }))
    },
    [],
    'pages du pied de page',
    { outage: 'fallback' },
  )
}

function LinkList({ links }: { links: FooterLink[] }) {
  return links.map((l) => (
    <li key={l.href}>
      <Link href={l.href}>{l.label}</Link>
    </li>
  ))
}

/** Pied de page : marque et contact, colonnes de liens, grand logotype, mentions. */
export async function Footer() {
  const [settings, pages] = await Promise.all([getSettings(), getFooterPages()])
  const chaine = pages.filter((p) => p.group === 'chaine')
  const swatter = pages.filter((p) => p.group === 'swatter')
  const tagline = settings?.tagline?.trim()
  const email = settings?.contact?.email?.trim()
  const address = settings?.contact?.address?.trim()
  const addressLines = address ? address.split(/\r?\n/).filter(Boolean) : []
  const year = Number(parisDay().slice(0, 4))
  const years = year > 2025 ? `2025–${year}` : '2025'

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link className="logo" href="/" aria-label="Swatter TV — Accueil">
              <Logo />
            </Link>
            {tagline && <p>{tagline}</p>}
            {(addressLines.length > 0 || email) && (
              <address>
                <ul className="contact">
                  {addressLines.length > 0 && (
                    <li>
                      <Icon name="pin" />
                      <span>
                        {addressLines.map((line, i) => (
                          <Fragment key={i}>
                            {i > 0 && <br />}
                            {line}
                          </Fragment>
                        ))}
                      </span>
                    </li>
                  )}
                  {email && (
                    <li>
                      <Icon name="mail" />
                      <a href={`mailto:${email}`}>{email}</a>
                    </li>
                  )}
                </ul>
              </address>
            )}
          </div>

          <div>
            <h2 className="footer__title">La chaîne</h2>
            <ul>
              <LinkList
                links={[
                  { href: '/direct', label: 'Le Direct' },
                  { href: '/programme-tv', label: 'Programme TV' },
                  { href: '/replay', label: 'Le Replay' },
                  { href: '/videos', label: 'Vidéos' },
                  ...chaine,
                ]}
              />
            </ul>
          </div>

          <div>
            <h2 className="footer__title">Info &amp; services</h2>
            <ul>
              <LinkList
                links={[
                  { href: '/info', label: 'L’Info' },
                  { href: '/meteo', label: 'La Météo' },
                  { href: '/agenda', label: 'Agenda' },
                  { href: '/webcams', label: 'Webcams' },
                ]}
              />
            </ul>
          </div>

          <div>
            <h2 className="footer__title">Swatter TV</h2>
            <ul>
              <LinkList links={swatter} />
              <li>
                <CookieSettingsButton />
              </li>
            </ul>
          </div>
        </div>

        <div className="wordmark" aria-hidden="true">
          SWATTER TV
        </div>

        <div className="footer__bottom">
          <span>© {years} Swatter TV · Tous droits réservés</span>
          {settings?.protectNotice && (
            <span className="protect">
              <Icon name="shield" />
              {settings.protectNotice}
            </span>
          )}
        </div>
      </div>
    </footer>
  )
}
