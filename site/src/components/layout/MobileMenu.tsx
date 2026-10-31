'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon, Logo } from '@/components/ui/Icon'
import { useOnAir } from '@/components/video/useOnAir'
import { useMemberHint } from '@/lib/members/browser'
import { loginHref } from '@/lib/members/shared'
import { DRAWER_STATE_EVENT, isActive, OPEN_DRAWER_EVENT, type DrawerStateDetail, type NavItem, type OpenDrawerDetail } from './nav'
import '@/styles/shell.css'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Menu mobile plein écran (dialogue modal) : s'ouvre sur l'événement window « swatter:open-drawer »
 * (burger de l'en-tête, onglet « Menu »…). Échap, piège du focus, retour du focus au bouton d'origine,
 * défilement de la page verrouillé, fermeture au changement de page.
 * En bas : « Proposer une info » et l'accès à l'espace membres (« Mon espace » ou « Se connecter », selon le cookie témoin).
 */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  // Point rouge de « Le Direct » : seulement à l'antenne (18 h – 0 h 30), jamais au rendu serveur
  const onAir = useOnAir()
  const member = useMemberHint()
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState(pathname)
  const ref = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  // Changement de page : fermeture (ajustement d'état pendant le rendu, sans effet)
  if (path !== pathname) {
    setPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    const onOpen = (e: Event) => {
      const trigger = (e as CustomEvent<OpenDrawerDetail | undefined>).detail?.trigger
      const active = document.activeElement
      returnTo.current = trigger instanceof HTMLElement ? trigger : active instanceof HTMLElement && active !== document.body ? active : null
      setOpen(true)
    }
    window.addEventListener(OPEN_DRAWER_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_DRAWER_EVENT, onOpen)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<DrawerStateDetail>(DRAWER_STATE_EVENT, { detail: { open } }))
    const root = ref.current
    if (!open || !root) return

    // Verrouillage du défilement (avec compensation de la barre de défilement sur ordinateur)
    const html = document.documentElement
    const body = document.body
    const scrollbar = window.innerWidth - html.clientWidth
    const prev = { overflow: html.style.overflow, paddingRight: body.style.paddingRight }
    html.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    const focusables = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const focusTimer = window.setTimeout(() => (root.querySelector<HTMLElement>('.drawer__close') ?? focusables()[0])?.focus(), 30)

    const onKey = (e: KeyboardEvent) => {
      const current = document.activeElement
      const inside = current instanceof Node && root.contains(current)
      // Un autre dialogue (recherche…) a le focus : il gère lui-même le clavier
      if (!inside && current instanceof Element && current.closest('[role="dialog"]')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && (current === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (current === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    // Passage au format ordinateur (burger masqué) : fermeture
    const wide = window.matchMedia('(min-width: 1101px)')
    const onWide = () => {
      if (wide.matches) setOpen(false)
    }
    wide.addEventListener('change', onWide)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
      html.style.overflow = prev.overflow
      body.style.paddingRight = prev.paddingRight
      const back = returnTo.current
      returnTo.current = null
      if (back?.isConnected && back.getClientRects().length) back.focus({ preventScroll: true })
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={ref} id="drawer" className={`drawer${open ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu" inert={!open}>
      <div className="drawer__top">
        <Link className="logo" href="/" aria-label="Swatter TV Info — Accueil" onClick={close}>
          <Logo />
        </Link>
        <button className="icon-btn drawer__close" type="button" aria-label="Fermer le menu" onClick={close}>
          <Icon name="x" className="ico" />
        </button>
      </div>
      <nav aria-label="Menu principal">
        {items.map((it, i) => (
          <Link
            key={it.href}
            href={it.href}
            style={{ '--i': i } as CSSProperties}
            aria-current={isActive(pathname, it.href) ? 'page' : undefined}
            onClick={close}
          >
            {it.live && onAir && <span className="dot-live" aria-hidden="true" />}
            {it.label}
            <Icon name="right" className="drawer__chev" />
          </Link>
        ))}
      </nav>
      <Link className="btn btn--gold" href="/contact" onClick={close} style={{ '--i': items.length } as CSSProperties}>
        <Icon name="mail" />
        Proposer une info
      </Link>
      {/* Espace membres : page dynamique, pas de préchargement (le menu fermé reste « visible » pour le navigateur) */}
      <Link
        className="btn btn--ghost drawer__account"
        href={member ? '/compte' : loginHref(pathname)}
        prefetch={false}
        onClick={close}
        style={{ '--i': items.length + 1 } as CSSProperties}
      >
        <Icon name="user" />
        {member ? 'Mon espace' : 'Se connecter'}
      </Link>
    </div>
  )
}
