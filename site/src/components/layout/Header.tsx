import Link from 'next/link'
import { Icon, Logo } from '@/components/ui/Icon'
import { HeaderFrame } from './HeaderFrame'
import { MainNav } from './MainNav'
import { MenuButton } from './MenuButton'
import { MobileMenu } from './MobileMenu'
import { DRAWER_NAV, MAIN_NAV } from './nav'
import '@/styles/header.css'

/**
 * En-tête fixe (logo, navigation, recherche, connexion, menu mobile).
 * Le menu mobile est rendu à côté du <header> (et non dedans) : il reste ainsi positionné
 * par rapport à la fenêtre même quand l'en-tête est translaté.
 */
export function Header() {
  return (
    <>
      <HeaderFrame>
        <div className="container hdr__in">
          <Link className="logo" href="/" aria-label="Swatter TV — Accueil">
            <Logo />
          </Link>
          <MainNav items={MAIN_NAV} />
          <div className="hdr__actions">
            {/* La rubrique « recherche » ouvre son panneau au clic sur tout élément [data-open-search] */}
            <button className="icon-btn" type="button" data-open-search aria-label="Rechercher (raccourci /)" aria-haspopup="dialog">
              <Icon name="search" className="ico" />
            </button>
            <kbd className="k" aria-hidden="true">
              /
            </kbd>
            <Link className="btn btn--gold btn--sm login" href="/admin" prefetch={false}>
              <Icon name="user" />
              Se connecter
            </Link>
            <MenuButton />
          </div>
        </div>
      </HeaderFrame>
      <MobileMenu items={DRAWER_NAV} />
    </>
  )
}
