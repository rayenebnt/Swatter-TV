'use client'
// Champ mot de passe avec bouton « Afficher le mot de passe » (bouton bascule), aide et erreur reliées au champ.
import { useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { MAX_PASSWORD } from '@/lib/members/shared'
import { FieldError, fieldAttrs, fieldId, type Errors } from './Field'

export function PasswordField({
  base,
  name,
  label,
  autoComplete,
  errors,
  hint,
  required = true,
}: {
  /** Préfixe des identifiants du formulaire (useId). */
  base: string
  name: string
  label: ReactNode
  autoComplete: 'current-password' | 'new-password'
  errors: Errors
  hint?: ReactNode
  required?: boolean
}) {
  const [shown, setShown] = useState(false)
  const id = fieldId(base, name)
  return (
    <div className="contact-field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className="auth-pass">
        <input
          {...fieldAttrs(base, name, errors, Boolean(hint))}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          maxLength={MAX_PASSWORD}
        />
        <button
          type="button"
          className="auth-pass__toggle"
          aria-pressed={shown}
          aria-controls={id}
          title={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          onClick={() => setShown((v) => !v)}
        >
          <Icon name={shown ? 'eye-off' : 'eye'} />
          <span className="sr-only">Afficher le mot de passe</span>
        </button>
      </div>
      {hint && (
        <p className="contact-hint" id={fieldId(base, name, 'hint')}>
          {hint}
        </p>
      )}
      <FieldError base={base} name={name} errors={errors} />
    </div>
  )
}
