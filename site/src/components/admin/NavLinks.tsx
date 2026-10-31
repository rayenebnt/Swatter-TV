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
 * Tant qu'il est ouvert, le contenu derrière est inerte : ni Tab ni VoiceOver n'y mènent. Payload ne le referme
 * lui-même qu'au changement d'adresse, et seulement sous 768 px. Sur ordinateur, rien ne change : le menu reste comme
 * l'utilisateur l'a laissé (préférence mémorisée par Payload), et le contenu n'est jamais rendu inerte.
 */
function useModalNav() {
  const { hydrated, navOpen, setNavOpen } = useNav()

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
    const modal = window.matchMedia(MODAL_NAV_QUERY)
    // pas avant que le menu soit hydraté : le HTML du serveur arrive menu ouvert (défaut de Payload) et close() ne le
    // referme qu'au rendu suivant ; rendre la page inerte à ce moment-là ferait perdre le focus à un champ touché pendant
    // le chargement
    if (!navOpen || !hydrated || !modal.matches) return
    // ouvert au clavier (bouton du menu focalisé et focus visible) : le focus entre dans le menu, avant que le bouton
    // (dans l'en-tête sur téléphone) ne devienne inerte ; au toucher, rien ne bouge
    const opener = document.activeElement
    const nav = document.querySelector<HTMLElement>('aside.nav')
    if (nav && opener instanceof HTMLElement && opener.matches('.nav-toggler:focus-visible')) {
      firstShown(nav, '.nav__mobile-close, a[href]')?.focus({ preventScroll: true })
    }
    // contenu derrière le menu (en-tête, page) rendu inerte : Tab et le balayage de VoiceOver restent dans le menu au
    // lieu de parcourir la page cachée. Les enfants de .template-default__wrap, pas le wrap lui-même, dont le ::before
    // (le voile) doit rester touchable ; un enfant déjà inerte est laissé tel quel. Libéré à la fermeture et au
    // démontage (nettoyage de l'effet), et dès que l'écran passe à la taille d'un ordinateur, menu ouvert
    // (fenêtre agrandie, tablette tournée : le menu n'y est plus une fenêtre). Sans inert (iOS < 15.5), rien ne change.
    const behind = [...document.querySelectorAll<HTMLElement>('.template-default__wrap > *')].filter((el) => !el.inert)
    const setInert = (inert: boolean) => {
      for (const el of behind) el.inert = inert
    }
    setInert(true)
    const onResize = () => setInert(modal.matches)
    modal.addEventListener('change', onResize)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !modal.matches) return
      // libéré AVANT de rendre le focus : sur téléphone, le bouton du menu est dans l'en-tête, donc derrière le menu, et
      // focus() ne fait rien sur un élément encore inerte (le nettoyage de l'effet ne vient qu'après le nouveau rendu)
      setInert(false)
      setNavOpen(false)
      firstShown(document, '.nav-toggler')?.focus({ preventScroll: true })
    }
    const onClick = (event: MouseEvent) => {
      if (!modal.matches || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      // lien du menu, ou voile : pseudo-élément de .template-default__wrap, qui reçoit donc le toucher
      if (target?.closest('.nav a[href]') || target?.classList.contains('template-default__wrap')) setNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick)
    return () => {
      setInert(false)
      modal.removeEventListener('change', onResize)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick)
    }
  }, [hydrated, navOpen, setNavOpen])
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
