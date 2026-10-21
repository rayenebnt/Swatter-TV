// Formulaire de contact (page /contact, POST /api/contact) : sujets et vérification des champs, partagés par le
// navigateur (messages immédiats) et le serveur (seule vérification qui compte).
import { isEmailAddress } from './members/shared'

export const CONTACT_SUBJECTS = [
  { value: 'info', label: 'Proposer une info', mail: 'Proposition d’info' },
  { value: 'publicite', label: 'Publicité, partenariat', mail: 'Demande de partenariat' },
  { value: 'autre', label: 'Autre demande', mail: 'Message' },
] as const

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number]['value']

export type ContactInput = {
  subject: ContactSubject
  name: string
  email: string
  phone: string
  city: string
  link: string
  message: string
}

export type ContactErrors = Partial<Record<keyof ContactInput | 'consent', string>>

/** Destinataire par défaut des messages (remplacé par l'e-mail saisi dans « Accueil et direct › Chaîne et contact »). */
export const CONTACT_TO = 'contact@swatter-tv.fr'

export const isSubject = (v: unknown): v is ContactSubject => CONTACT_SUBJECTS.some((s) => s.value === v)
// texte d'une ligne : sans caractères de contrôle (le caractère nul est refusé par PostgreSQL)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '')

/** Champs nettoyés et erreurs (en français, prêtes à afficher sous chaque champ). */
export function checkContact(raw: Record<string, unknown>): { data: ContactInput; errors: ContactErrors } {
  const data: ContactInput = {
    subject: isSubject(raw.subject) ? raw.subject : 'info',
    name: str(raw.name, 120),
    email: str(raw.email, 200),
    phone: str(raw.phone, 40),
    city: str(raw.city, 120),
    link: str(raw.link, 500),
     
    message: typeof raw.message === 'string' ? raw.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 5000) : '',
  }
  const errors: ContactErrors = {}
  if (data.name.length < 2) errors.name = 'Indiquez votre nom.'
  if (!isEmailAddress(data.email)) errors.email = 'Indiquez une adresse e-mail valide, pour que la rédaction puisse vous répondre.'
  if (data.message.length < 10) errors.message = 'Votre message est trop court (10 caractères au moins).'
  if (data.link && !/^https?:\/\/\S+$/i.test(data.link)) errors.link = 'Le lien doit commencer par https://'
  if (raw.consent !== true && raw.consent !== 'on' && raw.consent !== 'true') errors.consent = 'Cochez cette case pour envoyer votre message.'
  return { data, errors }
}

export const subjectLabel = (s: ContactSubject) => CONTACT_SUBJECTS.find((x) => x.value === s)?.label ?? ''
export const subjectMail = (s: ContactSubject) => CONTACT_SUBJECTS.find((x) => x.value === s)?.mail ?? 'Message'
