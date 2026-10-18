'use client'

import { Link, useAuth, useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { AdminIcon } from './icons'
import { MENU } from './menu'

/**
 * Rubrique choisie avant même l'arrivée de la page : le lien cliqué s'allume aussitôt (et la barre de progression de
 * Payload démarre, grâce à son Link), au lieu d'attendre la fin du chargement.
 */
function usePendingNav() {
  const pathname = usePathname()
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null)
  // valable seulement tant que l'adresse n'a pas changé : plus besoin de le remettre à zéro ensuite
  const target = pending && pending.from === pathname ? pending.href : null
  const isActive = (href: string, exact = false) => (target ? target === href : exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))
  const onNavigate = (href: string) => () => setPending({ href, from: pathname })
  return { isActive, onNavigate }
}

/**
 * Menu de l'administration (admin.components.beforeNavLinks), dans l'ordre du menu du site. Les groupes automatiques
 * de Payload sont masqués (admin.group: false, voir payload.config.ts) ; la rubrique Administration est réservée
 * aux administrateurs.
 */
export function NavStart() {
  const {
    config: { routes },
  } = useConfig()
  const { user } = useAuth()
  const { isActive, onNavigate } = usePendingNav()
  const isAdmin = (user as { role?: string } | null)?.role === 'admin'
  const home = isActive(routes.admin, true)
  return (
    <>
      <div className="sw-nav sw-nav--start">
        <Link
          className={`sw-nav__link${home ? ' is-active' : ''}`}
          href={routes.admin}
          aria-current={home ? 'page' : undefined}
          prefetch={false}
          onClick={onNavigate(routes.admin)}
        >
          <AdminIcon name="dashboard" />
          Tableau de bord
        </Link>
      </div>
      {MENU.filter((section) => !section.adminOnly || isAdmin).map((section) => (
        <div className="sw-nav sw-nav--section" key={section.title}>
          <p className="sw-nav__heading">{section.title}</p>
          {section.items.map((item) => {
            const href = `${routes.admin}${item.path}`
            const active = isActive(href)
            return (
              <Link
                key={item.path}
                className={`sw-nav__link${item.sub ? ' sw-nav__link--sub' : ''}${active ? ' is-active' : ''}`}
                href={item.search ? `${href}${item.search()}` : href}
                aria-current={active ? 'page' : undefined}
                prefetch={false}
                onClick={onNavigate(href)}
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
  const {
    config: { routes },
  } = useConfig()
  const { isActive, onNavigate } = usePendingNav()
  const help = `${routes.admin}/aide`
  const onHelp = isActive(help, true)
  return (
    <div className="sw-nav sw-nav--end">
      <a className="sw-nav__link" href="/" target="_blank" rel="noopener noreferrer">
        <AdminIcon name="external" />
        Voir le site
      </a>
      <Link className={`sw-nav__link${onHelp ? ' is-active' : ''}`} href={help} aria-current={onHelp ? 'page' : undefined} prefetch={false} onClick={onNavigate(help)}>
        <AdminIcon name="help" />
        Aide
      </Link>
    </div>
  )
}
