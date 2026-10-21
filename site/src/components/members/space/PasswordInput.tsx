'use client'
// « Mon espace » : champ de mot de passe avec bouton « Afficher le mot de passe » (état aria-pressed).
import { useState, type ComponentProps } from 'react'
import { Icon } from '@/components/ui/Icon'

export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="space-pwd">
      <input {...props} type={shown ? 'text' : 'password'} spellCheck={false} autoCapitalize="none" />
      <button type="button" className="space-pwd__toggle" aria-pressed={shown} aria-controls={props.id} onClick={() => setShown((s) => !s)}>
        <Icon name={shown ? 'eye-off' : 'eye'} />
        <span className="sr-only">Afficher le mot de passe</span>
      </button>
    </div>
  )
}
