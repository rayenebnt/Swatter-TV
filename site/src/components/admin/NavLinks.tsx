'use client'

import { useAuth, useConfig } from '@payloadcms/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminIcon } from './icons'
import { MENU } from './menu'

/**
 * Menu de l'administration (admin.components.beforeNavLinks), dans l'ordre du menu du site. Les groupes automatiques
 * de Payload sont masqués (admin.group: false, voir payload.config.ts) ; la rubrique Administration est réservée
 * aux administrateurs.
 */
export function NavStart() {
  const pathname = usePathname()
  const {
    config: { routes },
  } = useConfig()
  const { user } = useAuth()
  const isAdmin = (user as { role?: string } | null)?.role === 'admin'
  const home = pathname === routes.admin
  return (
    <>
      <div className="sw-nav sw-nav--start">
        <Link className={`sw-nav__link${home ? ' is-active' : ''}`} href={routes.admin} aria-current={home ? 'page' : undefined} prefetch={false}>
          <AdminIcon name="dashboard" />
          Tableau de bord
        </Link>
      </div>
      {MENU.filter((section) => !section.adminOnly || isAdmin).map((section) => (
        <div className="sw-nav sw-nav--section" key={section.title}>
          <p className="sw-nav__heading">{section.title}</p>
          {section.items.map((item) => {
            const href = `${routes.admin}${item.path}`
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={item.path}
                className={`sw-nav__link${item.sub ? ' sw-nav__link--sub' : ''}${active ? ' is-active' : ''}`}
                href={item.search ? `${href}${item.search()}` : href}
                aria-current={active ? 'page' : undefined}
                prefetch={false}
              >
                <AdminIcon name={item.icon} />
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </>
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
