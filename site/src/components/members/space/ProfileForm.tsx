'use client'
// « Mon espace » : formulaire « Mes informations » (prénom, nom, département, e-mails de Swatter TV) → PATCH /api/compte/profil.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { DEPARTMENTS } from '@/lib/departments'
import { checkProfile, type FieldErrors, type MemberProfile } from '@/lib/members/shared'
import { useSpaceApi } from './useSpaceApi'

type Field = 'firstName' | 'lastName' | 'department'

export function ProfileForm({ profile, since }: { profile: MemberProfile; since: string }) {
  const router = useRouter()
  const call = useSpaceApi()
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  const focusFirstError = (errs: FieldErrors) => {
    const first = Object.keys(errs)[0]
    if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const raw = {
      firstName: String(fd.get('firstName') ?? ''),
      lastName: String(fd.get('lastName') ?? ''),
      department: String(fd.get('department') ?? '') || null,
      newsletter: fd.get('newsletter') === 'on',
    }
    const { errors: errs } = checkProfile(raw)
    setErrors(errs)
    setFailure('')
    setStatus('')
    if (Object.keys(errs).length) return focusFirstError(errs)
    setSending(true)
    const res = await call<MemberProfile>('/profil', { method: 'PATCH', body: raw })
    setSending(false)
    if (res.ok) {
      setStatus(
        res.data.newsletter !== profile.newsletter
          ? `Vos informations sont enregistrées. ${res.data.newsletter ? 'Vous recevrez les actualités de Swatter TV Info par e-mail.' : 'Vous ne recevrez plus d’e-mails d’actualité.'}`
          : 'Vos informations sont enregistrées.',
      )
      // salutation de l'en-tête et blocs du département du tableau de bord
      router.refresh()
    } else if (res.errors) {
      setErrors(res.errors)
      focusFirstError(res.errors)
    } else if (res.status !== 401) setFailure(res.error)
  }

  const field = (name: Field) => ({
    name,
    id: `${id}-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': [errors[name] ? `${id}-${name}-err` : null, name === 'department' ? `${id}-department-hint` : null].filter(Boolean).join(' ') || undefined,
  })
  const error = (name: Field) =>
    errors[name] ? (
      <p className="contact-err" id={`${id}-${name}-err`}>
        {errors[name]}
      </p>
    ) : null

  return (
    <form ref={form} className="contact-form space-form" method="post" onSubmit={submit} noValidate>
      <div className="contact-grid">
        <div className="contact-field">
          <label htmlFor={`${id}-firstName`}>
            Prénom <span aria-hidden="true">*</span>
          </label>
          <input {...field('firstName')} type="text" autoComplete="given-name" required maxLength={60} defaultValue={profile.firstName} />
          {error('firstName')}
        </div>
        <div className="contact-field">
          <label htmlFor={`${id}-lastName`}>Nom (facultatif)</label>
          <input {...field('lastName')} type="text" autoComplete="family-name" maxLength={80} defaultValue={profile.lastName} />
          {error('lastName')}
        </div>
      </div>

      <div className="contact-field">
        <label htmlFor={`${id}-department`}>Mon département</label>
        <select {...field('department')} defaultValue={profile.department ?? ''}>
          <option value="">Aucun</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label} ({d.code})
            </option>
          ))}
        </select>
        <p className="contact-hint" id={`${id}-department-hint`}>
          Sa météo, ses dernières infos et ses prochaines sorties s’affichent sur votre tableau de bord.
        </p>
        {error('department')}
      </div>

      <div className="space-readonly">
        <p className="space-readonly__label">Adresse e-mail</p>
        <p className="space-readonly__value">
          <Icon name="mail" />
          <span>{profile.email}</span>
        </p>
        <p className="contact-hint">
          Elle vous sert à vous connecter. Pour la changer, <Link href="/contact?sujet=autre">écrivez-nous</Link>.
        </p>
      </div>

      <div className="contact-field contact-consent">
        <label>
          <input name="newsletter" type="checkbox" defaultChecked={profile.newsletter} />
          <span>Recevoir les actualités de Swatter TV Info par e-mail</span>
        </label>
        <p className="contact-hint">Vous pouvez changer d’avis à tout moment, ici même.</p>
      </div>

      <p className="space-status" role="status">
        {status}
      </p>
      {failure && (
        <p className="contact-err contact-err--global" role="alert">
          {failure}
        </p>
      )}

      <div className="contact-actions">
        <button type="submit" className="btn btn--gold btn--sm" disabled={sending}>
          <Icon name="check" />
          {sending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <p className="contact-hint">Membre depuis le {since}.</p>
      </div>
    </form>
  )
}
