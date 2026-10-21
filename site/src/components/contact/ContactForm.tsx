'use client'
// Formulaire « Proposer une info » : vérification immédiate, envoi à POST /api/contact, confirmation à l'écran.
// Membre connecté : nom et e-mail pré-remplis depuis son profil (GET /api/compte/moi).
import { useSearchParams } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { CONTACT_SUBJECTS, checkContact, isSubject, type ContactErrors } from '@/lib/contact'
import { memberApi, useMemberHint } from '@/lib/members/browser'
import type { MemberProfile } from '@/lib/members/shared'

type State = 'idle' | 'sending' | 'sent'
type Identity = { name: string; email: string }

/** Remplit un champ du formulaire (non contrôlé) s'il est encore vide : rien de ce que le visiteur a saisi n'est remplacé. */
function fillEmpty(form: HTMLFormElement, name: string, value: string) {
  const el = form.elements.namedItem(name)
  if (value && el instanceof HTMLInputElement && !el.value) el.value = value
}

export function ContactForm() {
  const params = useSearchParams()
  const initial = params.get('sujet')
  const [subject, setSubject] = useState(isSubject(initial) ? initial : 'info')
  const [errors, setErrors] = useState<ContactErrors>({})
  const [failure, setFailure] = useState('')
  const [state, setState] = useState<State>('idle')
  const form = useRef<HTMLFormElement>(null)
  const done = useRef<HTMLHeadingElement>(null)
  const shownAt = useRef(0)
  const id = useId()
  const member = useMemberHint()
  const [identity, setIdentity] = useState<Identity | null>(null)
  // Formulaire déjà pré-rempli (un nouveau formulaire s'affiche après « Envoyer un autre message »)
  const filled = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    if (!member) return
    let cancelled = false
    memberApi<MemberProfile>('/moi').then((res) => {
      if (cancelled || !res.ok) return
      // Même limite que le champ (maxlength ne s'applique qu'à la saisie)
      const name = [res.data.firstName, res.data.lastName].map((v) => v?.trim()).filter(Boolean).join(' ').slice(0, 120)
      setIdentity({ name, email: res.data.email ?? '' })
    })
    return () => {
      cancelled = true
    }
  }, [member])

  useEffect(() => {
    const f = form.current
    if (!f || !identity || filled.current === f) return
    filled.current = f
    fillEmpty(f, 'name', identity.name)
    fillEmpty(f, 'email', identity.email)
  }, [identity, state])

  // durée mesurée depuis l'affichage d'un formulaire neuf : un nouvel essai juste après un échec n'est pas pris pour un robot
  useEffect(() => {
    shownAt.current = Date.now()
  }, [])
  useEffect(() => {
    if (state === 'sent') done.current?.focus()
  }, [state])

  const focusFirstError = (errs: ContactErrors) => {
    const first = Object.keys(errs)[0]
    if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const raw = { ...Object.fromEntries(fd.entries()), consent: fd.get('consent') === 'on', subject }
    const { errors: errs } = checkContact(raw)
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return focusFirstError(errs)
    setState('sending')
    // envoi très rapide (remplissage automatique) : on attend les 3 s en deçà desquelles le serveur croit à un robot
    const elapsed = Date.now() - shownAt.current
    if (elapsed < 3200) await new Promise((resolve) => setTimeout(resolve, 3200 - elapsed))
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // durée depuis l'affichage, mesurée ici : le serveur écarte les envois de moins de 3 s (robots)
        body: JSON.stringify({ ...raw, elapsed: Date.now() - shownAt.current }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; errors?: ContactErrors; error?: string } | null
      if (res.ok && json?.ok) return setState('sent')
      if (json?.errors) {
        setErrors(json.errors)
        focusFirstError(json.errors)
      } else setFailure(json?.error ?? 'L’envoi n’a pas abouti. Réessayez dans un instant.')
    } catch {
      setFailure('L’envoi n’a pas abouti (connexion interrompue). Réessayez dans un instant.')
    }
    setState('idle')
  }

  if (state === 'sent') {
    return (
      <div className="contact-done" role="status">
        <span className="contact-done__icon" aria-hidden="true">
          <Icon name="mail" />
        </span>
        <h2 ref={done} tabIndex={-1}>
          Merci, votre message est bien parti&nbsp;!
        </h2>
        <p>La rédaction de Swatter TV l’a reçu et vous répondra par e-mail si besoin.</p>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            shownAt.current = Date.now()
            setState('idle')
          }}
        >
          Envoyer un autre message
        </button>
      </div>
    )
  }

  const field = (name: keyof ContactErrors) => ({
    name,
    id: `${id}-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${id}-${name}-err` : undefined,
  })
  const error = (name: keyof ContactErrors) =>
    errors[name] ? (
      <p className="contact-err" id={`${id}-${name}-err`}>
        {errors[name]}
      </p>
    ) : null

  return (
    <form ref={form} className="contact-form" method="post" onSubmit={submit} noValidate>
      <fieldset className="contact-subjects">
        <legend>Vous souhaitez</legend>
        {CONTACT_SUBJECTS.map((s) => (
          <label key={s.value} className={subject === s.value ? 'is-on' : undefined}>
            <input type="radio" name="subject" value={s.value} checked={subject === s.value} onChange={() => setSubject(s.value)} />
            {s.label}
          </label>
        ))}
      </fieldset>

      <div className="contact-grid">
        <div className="contact-field">
          <label htmlFor={`${id}-name`}>
            Nom et prénom <span aria-hidden="true">*</span>
          </label>
          <input {...field('name')} type="text" autoComplete="name" required maxLength={120} />
          {error('name')}
        </div>
        <div className="contact-field">
          <label htmlFor={`${id}-email`}>
            E-mail <span aria-hidden="true">*</span>
          </label>
          <input {...field('email')} type="email" autoComplete="email" required maxLength={200} />
          {error('email')}
        </div>
        <div className="contact-field">
          <label htmlFor={`${id}-phone`}>Téléphone (facultatif)</label>
          <input {...field('phone')} type="tel" autoComplete="tel" maxLength={40} />
        </div>
        <div className="contact-field">
          <label htmlFor={`${id}-city`}>Commune concernée (facultatif)</label>
          <input {...field('city')} type="text" autoComplete="address-level2" maxLength={120} placeholder="Annecy, Cluses…" />
        </div>
      </div>

      <div className="contact-field">
        <label htmlFor={`${id}-message`}>
          {subject === 'info' ? 'Votre info : que s’est-il passé, où et quand ?' : 'Votre message'} <span aria-hidden="true">*</span>
        </label>
        <textarea {...field('message')} rows={7} required maxLength={5000} />
        {error('message')}
      </div>

      <div className="contact-field">
        <label htmlFor={`${id}-link`}>Lien vers vos photos ou votre vidéo (facultatif)</label>
        <input {...field('link')} type="url" inputMode="url" maxLength={500} placeholder="https://…" />
        <p className="contact-hint">Un lien de partage (Google Drive, WeTransfer, YouTube…) : la rédaction pourra récupérer vos images.</p>
        {error('link')}
      </div>

      {/* champ piège invisible : seuls les robots le remplissent */}
      <div className="contact-trap" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Ne pas remplir</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="contact-field contact-consent">
        <label>
          <input {...field('consent')} type="checkbox" />
          <span>
            J’accepte que Swatter TV utilise ces informations pour traiter ma demande et me répondre. <span aria-hidden="true">*</span>
          </span>
        </label>
        {error('consent')}
      </div>

      {failure && (
        <p className="contact-err contact-err--global" role="alert">
          {failure}
        </p>
      )}

      <div className="contact-actions">
        <button type="submit" className="btn btn--gold" disabled={state === 'sending'}>
          <Icon name="mail" />
          {state === 'sending' ? 'Envoi en cours…' : 'Envoyer à la rédaction'}
        </button>
        <p className="contact-hint">
          <span aria-hidden="true">*</span> Champs obligatoires.
        </p>
      </div>
    </form>
  )
}
