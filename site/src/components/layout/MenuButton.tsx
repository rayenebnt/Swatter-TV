'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { onDrawerState, openDrawer } from './nav'

/** Bouton « burger » de l'en-tête (≤ 1100 px) : ouvre le menu mobile. */
export function MenuButton() {
  const [open, setOpen] = useState(false)
  useEffect(() => onDrawerState(setOpen), [])
  return (
    <button
      className="icon-btn burger"
      type="button"
      aria-label="Ouvrir le menu"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="drawer"
      onClick={(e) => openDrawer(e.currentTarget)}
    >
      <Icon name="menu" className="ico" />
    </button>
  )
}
