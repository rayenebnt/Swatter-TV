'use client'

import { useRowLabel } from '@payloadcms/ui'

/** Libellé d'une ligne repliable : « Diapositive 2 : Ce week-end — La Démontagnée » plutôt que « Diapositive 02 ». */
function Label({ prefix, parts }: { prefix: string; parts: (string | null | undefined)[] }) {
  const { rowNumber } = useRowLabel<unknown>()
  const text = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' — ')
  return (
    <span>
      {prefix} {(rowNumber ?? 0) + 1}
      {text ? ` : ${text}` : ''}
    </span>
  )
}

/** Carrousel de l'accueil (réglages, onglet « Accueil ») */
export function SlideLabel() {
  const { data } = useRowLabel<{ kind?: string; navLabel?: string; titleLine1?: string; titleLine2?: string }>()
  return <Label prefix="Diapositive" parts={[data?.kind === 'live' ? 'Le direct' : data?.navLabel, [data?.titleLine1, data?.titleLine2].filter(Boolean).join(' ')]} />
}

/** Étiquettes d'une diapositive */
export function BadgeLabel() {
  const { data } = useRowLabel<{ label?: string }>()
  return <Label prefix="Étiquette" parts={[data?.label]} />
}

/** Messages du flash info */
export function FlashLabel() {
  const { data } = useRowLabel<{ label?: string; text?: string }>()
  return <Label prefix="Message" parts={[data?.label, data?.text]} />
}

/** Programme de la journée d'un événement */
export function MomentLabel() {
  const { data } = useRowLabel<{ time?: string; label?: string }>()
  return <Label prefix="Moment" parts={[data?.time, data?.label]} />
}
