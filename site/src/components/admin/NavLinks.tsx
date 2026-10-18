'use client'

import { useConfig } from '@payloadcms/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminIcon } from './icons'

/** Haut du menu (admin.components.beforeNavLinks) : retour au tableau de bord, toujours à portée de clic. */
export function NavStart() {
  const pathname = usePathname()
  const {
    config: { routes },
  } = useConfig()
  const active = pathname === routes.admin
  return (
    <div className="sw-nav sw-nav--start">
      <Link className={`sw-nav__link${active ? ' is-active' : ''}`} href={routes.admin} aria-current={active ? 'page' : undefined} prefetch={false}>
        <AdminIcon name="dashboard" />
        Tableau de bord
      </Link>
    </div>
  )
}

/** Bas du menu (admin.components.afterNavLinks) : le site public et l'aide. */
export function NavEnd() {
  const pathname = usePathname()
  const {
    config: { routes },
  } = useConfig()
  const help = `${routes.admin}/aide`
  return (
    <div className="sw-nav sw-nav--end">
      <a className="sw-nav__link" href="/" target="_blank" rel="noopener noreferrer">
        <AdminIcon name="external" />
        Voir le site
      </a>
      <Link className={`sw-nav__link${pathname === help ? ' is-active' : ''}`} href={help} aria-current={pathname === help ? 'page' : undefined} prefetch={false}>
        <AdminIcon name="help" />
        Aide
      </Link>
    </div>
  )
}
