'use client'

import { Link, useAuth, useConfig, useNav } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AdminIcon } from './icons'
import { MENU, MODAL_NAV_QUERY } from './menu'

/**
 * Premier élément affiché parmi ceux du sélecteur : largeur non nulle (sur téléphone, le bouton du menu de la marge
 * gauche reste dans la page, vide et large de 0 px, à côté de celui de l'en-tête).
 */
const firstShown = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].find((el) => el.getBoundingClientRect().width > 0)

/**
 * Téléphone et tablette (≤ 1024 px) : le menu s'ouvre par-dessus le contenu (custom.scss). Il est fermé à l'arrivée
 * (et au retour sur la page par le bouton « Précédent »), se referme en touchant un de ses liens, en touchant le voile
 * posé sur le contenu, avec Échap (le focus revient alors au bouton du menu), et ouvert au clavier, il reçoit le focus.
 * Payload ne le referme lui-même qu'au changement d'adresse, et seulement sous 768 px. Sur ordinateur, rien ne change :
 * le menu reste comme l'utilisateur l'a laissé (préférence mémorisée par Payload).
 */
function useModalNav() {
  const { navOpen, setNavOpen } = useNav()

  useEffect(() => {
    const close = () => {
      if (window.matchMedia(MODAL_NAV_QUERY).matches) setNavOpen(false)
    }
    close()
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) close()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [setNavOpen])

  useEffect(() => {
    if (!navOpen || !window.matchMedia(MODAL_NAV_QUERY).matches) return
    // ouvert au clavier (bouton du menu focalisé et focus visible) : le focus entre dans le menu, sinon Tab parcourrait
    // la page cachée derrière ; au toucher, rien ne bouge
    const opener = document.activeElement
    const nav = document.querySelector<HTMLElement>('aside.nav')
    if (nav && opener instanceof HTMLElement && opener.matches('.nav-toggler:focus-visible')) {
      firstShown(nav, '.nav__mobile-close, a[href]')?.focus({ preventScroll: true })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !window.matchMedia(MODAL_NAV_QUERY).matches) return
      setNavOpen(false)
      firstShown(document, '.nav-toggler')?.focus({ preventScroll: true })
    }
    const onClick = (event: MouseEvent) => {
      if (!window.matchMedia(MODAL_NAV_QUERY).matches || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      // lien du menu, ou voile : pseudo-élément de .template-default__wrap, qui reçoit donc le toucher
      if (target?.closest('.nav a[href]') || target?.classList.contains('template-default__wrap')) setNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick)
    }
  }, [navOpen, setNavOpen])
}

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
  // monté avec le menu, sur toutes les pages de l'administration (une seule fois : NavEnd ne l'appelle pas)
  useModalNav()
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
