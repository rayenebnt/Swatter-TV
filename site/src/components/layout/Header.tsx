import Link from 'next/link'
import { AccountButton } from '@/components/members/AccountButton'
import { Icon, Logo } from '@/components/ui/Icon'
import { HeaderFrame } from './HeaderFrame'
import { MainNav } from './MainNav'
import { MenuButton } from './MenuButton'
import { MobileMenu } from './MobileMenu'
import { DRAWER_NAV, MAIN_NAV } from './nav'
import '@/styles/header.css'

/**
 * En-tête fixe (logo, navigation, recherche, espace membres, « Proposer une info », menu mobile).
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
            {/* Espace membres : « Mon espace » ou « Se connecter » selon le cookie témoin (lu dans le navigateur, page en cache) */}
            <AccountButton />
            {/* l'administration reste à l'adresse /admin : rien ne la signale aux visiteurs */}
            <Link className="btn btn--gold btn--sm login" href="/contact">
              <Icon name="mail" />
              Proposer une info
            </Link>
            <MenuButton />
          </div>
        </div>
      </HeaderFrame>
      <MobileMenu items={DRAWER_NAV} />
    </>
  )
}
