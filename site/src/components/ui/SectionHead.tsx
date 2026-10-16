import type { ReactNode } from 'react'

/** En-tête de section : sur-titre doré, titre, sous-titre et outils (filtres, flèches, lien). */
export function SectionHead({
  eyebrow,
  title,
  titleId,
  subtitle,
  as: Tag = 'h2',
  children,
}: {
  eyebrow?: string
  title: string
  titleId?: string
  subtitle?: string
  as?: 'h1' | 'h2'
  children?: ReactNode
}) {
  return (
    <div className="sec-head" data-reveal>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Tag id={titleId}>{title}</Tag>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="sec-tools">{children}</div>}
    </div>
  )
}
