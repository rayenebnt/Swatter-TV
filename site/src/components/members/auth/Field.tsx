// Formulaires de connexion et d'inscription : attributs d'accessibilité des champs, message d'erreur relié au champ
// et focus sur le premier champ en erreur (mêmes classes .contact-* que le formulaire de contact).

export type Errors = Partial<Record<string, string>>

/** Identifiants du champ, de son aide et de son erreur (reliés par aria-describedby). */
export const fieldId = (base: string, name: string, part?: 'hint' | 'err') => `${base}-${name}${part ? `-${part}` : ''}`

/** Attributs d'un champ : nom, identifiant, état invalide et description (aide puis erreur). */
export function fieldAttrs(base: string, name: string, errors: Errors, hint = false) {
  const describedBy = [hint ? fieldId(base, name, 'hint') : '', errors[name] ? fieldId(base, name, 'err') : ''].filter(Boolean).join(' ')
  return {
    name,
    id: fieldId(base, name),
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const
}

/** Message d'erreur d'un champ (rien s'il n'y en a pas). */
export function FieldError({ base, name, errors }: { base: string; name: string; errors: Errors }) {
  const message = errors[name]
  if (!message) return null
  return (
    <p className="contact-err" id={fieldId(base, name, 'err')}>
      {message}
    </p>
  )
}

/** Message reçu de l'API : espaces insécables avant « : ; ! ? » et dans les guillemets (pas de ponctuation seule en début de ligne). */
export const frenchSpaces = (s: string) => s.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0')

/** Place le focus sur le premier champ en erreur, dans l'ordre du formulaire. */
export function focusFirstError(form: HTMLFormElement | null, errors: Errors) {
  if (!form) return
  const names = new Set(Object.keys(errors).filter((k) => errors[k]))
  for (const el of Array.from(form.elements)) {
    if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && names.has(el.name)) {
      el.focus()
      return
    }
  }
}
