'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { isActive, onDrawerState, openDrawer } from './nav'
import '@/styles/shell.css'

const TABS: { href: string; label: string; icon: IconName; live?: boolean }[] = [
  { href: '/', label: 'Accueil', icon: 'home' },
  { href: '/direct', label: 'Direct', icon: 'tv', live: true },
  { href: '/info', label: 'Info', icon: 'news' },
  { href: '/replay', label: 'Replay', icon: 'replay' },
]

/** Barre d'onglets mobile (≤ 760 px), au-dessus de la zone de sécurité iOS. */
export function TabBar() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => onDrawerState(setMenuOpen), [])

  return (
    <nav className="tabbar" aria-label="Navigation mobile">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={isActive(pathname, t.href) ? 'page' : undefined}>
          {t.live && <span className="dot-live" aria-hidden="true" />}
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
      <button type="button" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="drawer" onClick={(e) => openDrawer(e.currentTarget)}>
        <Icon name="menu" />
        Menu
      </button>
    </nav>
  )
}
