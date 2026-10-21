// « Mon espace » : bloc du tableau de bord (titre, sous-titre, lien « Tout voir ») et état vide commun.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

export function SpaceBlock({
  id,
  title,
  subtitle,
  more,
  className,
  children,
}: {
  /** Préfixe des identifiants (titre du bloc relié à la section) */
  id: string
  title: string
  subtitle?: string
  /** Lien « Tout voir » (texte personnalisable) */
  more?: { href: string; label?: string; sr?: string }
  className?: string
  children: ReactNode
}) {
  return (
    <section className={className ? `space-block ${className}` : 'space-block'} aria-labelledby={`${id}-titre`}>
      <div className="space-block__head">
        <div>
          <h2 id={`${id}-titre`}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {more && (
          <Link className="link-more" href={more.href}>
            {more.label ?? 'Tout voir'}
            {more.sr && <span className="sr-only"> {more.sr}</span>}
            <Icon name="arrow" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * État vide utile : icône, phrase en gras, explication et liens pour aller plus loin. L'explication est réunie dans un
 * seul bloc : texte et liens s'enchaînent sur la ligne, des paragraphes passés tels quels s'empilent.
 */
export function SpaceEmpty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty space-empty">
      <Icon name={icon} />
      <div>
        <b>{title}</b>
        {children && <div className="space-empty__text">{children}</div>}
      </div>
    </div>
  )
}
