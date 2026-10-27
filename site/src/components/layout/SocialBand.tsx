import { Icon, type IconName } from '@/components/ui/Icon'
import { getSettings } from '@/lib/queries/settings'
import type { Setting } from '@/payload-types'
import { OffscreenPause } from './OffscreenPause'
import '@/styles/shell.css'

const NETWORKS: { key: keyof NonNullable<Setting['socials']>; label: string; icon: IconName }[] = [
  { key: 'facebook', label: 'Facebook', icon: 'fb' },
  { key: 'instagram', label: 'Instagram', icon: 'ig' },
  { key: 'youtube', label: 'YouTube', icon: 'yt' },
  { key: 'tiktok', label: 'TikTok', icon: 'tt' },
]

/** Adresse de profil saisie dans les réglages (http ou https uniquement). */
const profileUrl = (v?: string | null) => {
  const url = v?.trim()
  return url && /^https?:\/\/[^\s]+$/i.test(url) ? url : null
}

/** Bandeau « Suivez Swatter TV » : réseaux renseignés dans les réglages ; masqué s'il n'y en a aucun. */
export async function SocialBand() {
  const settings = await getSettings()
  const links = NETWORKS.flatMap((n) => {
    const url = profileUrl(settings?.socials?.[n.key])
    return url ? [{ ...n, url }] : []
  })
  if (!links.length) return null

  return (
    <div className="container">
      <OffscreenPause className="social" labelledBy="social-title">
        <div className="social__in">
          <div>
            <h2 id="social-title">Suivez Swatter TV Info</h2>
            <p>Coulisses, extraits et infos en avant-première sur nos réseaux.</p>
          </div>
          <ul className="socials">
            {links.map((l) => (
              <li key={l.key} className="socials__item">
                <a className="soc" href={l.url} target="_blank" rel="noopener">
                  <Icon name={l.icon} />
                  {l.label}
                  <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </OffscreenPause>
    </div>
  )
}
