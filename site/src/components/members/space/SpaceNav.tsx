'use client'
// « Mon espace » : onglets de navigation entre les pages de l'espace (onglet actif d'après l'adresse, aria-current).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useSegFade } from '@/components/ui/useSegFade'

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/compte', label: 'Tableau de bord', icon: 'home' },
  { href: '/compte/historique', label: 'Historique', icon: 'clock' },
  { href: '/compte/ma-liste', label: 'Ma liste', icon: 'bookmark' },
  { href: '/compte/profil', label: 'Mon profil', icon: 'user' },
]

export function SpaceNav() {
  const pathname = usePathname() ?? ''
  const ref = useRef<HTMLElement>(null)
  // sur mobile, la rangée défile : fondu du bord qui cache des onglets, onglet actif amené en vue
  useSegFade(ref, pathname)
  return (
    <nav ref={ref} className="space-tabs" aria-label="Mon espace">
      <div className="seg seg--bleed">
        {TABS.map((t) => {
          const current = t.href === '/compte' ? pathname === '/compte' : pathname === t.href || pathname.startsWith(`${t.href}/`)
          return (
            <Link key={t.href} href={t.href} aria-current={current ? 'page' : undefined} scroll={false}>
              <Icon name={t.icon} />
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
