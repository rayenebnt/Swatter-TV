// Espace membres : constantes et validation communes au navigateur et au serveur (aucune dépendance serveur ici).
import { DEPARTMENTS, type DepartmentSlug } from '@/lib/departments'

/** Cookie de session (httpOnly, signé) et cookie témoin lisible par le navigateur (affichage « Mon espace » seulement). */
export const SESSION_COOKIE = 'sw_membre'
export const HINT_COOKIE = 'sw_connecte'
/** Durée d'une session : 30 jours. */
export const SESSION_DAYS = 30
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 200

/** Contenus qu'un membre peut regarder (historique) ou garder dans « Ma liste ». */
export const HISTORY_KINDS = ['video', 'replay'] as const
export const FAVORITE_KINDS = ['video', 'replay', 'article', 'event'] as const
export type HistoryKind = (typeof HISTORY_KINDS)[number]
export type FavoriteKind = (typeof FAVORITE_KINDS)[number]
export const isHistoryKind = (v: unknown): v is HistoryKind => HISTORY_KINDS.includes(v as HistoryKind)
export const isFavoriteKind = (v: unknown): v is FavoriteKind => FAVORITE_KINDS.includes(v as FavoriteKind)
export const KIND_LABELS: Record<FavoriteKind, string> = { video: 'Vidéo', replay: 'Replay', article: 'Info', event: 'Agenda' }

/** Profil modifiable par le membre. */
export type MemberProfile = {
  firstName: string
  lastName: string
  email: string
  department: DepartmentSlug | null
  newsletter: boolean
  historyPaused: boolean
  createdAt: string
}

export type SignupInput = {
  firstName: string
  email: string
  password: string
  department: DepartmentSlug | null
  newsletter: boolean
  consent: boolean
}
export type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'email' | 'password' | 'current' | 'department' | 'consent' | 'token', string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const bool = (v: unknown) => v === true || v === 'on' || v === 'true'

export const normalizeEmail = (v: unknown) => str(v, 200).toLowerCase()
export const isDepartmentValue = (v: unknown): v is DepartmentSlug => DEPARTMENTS.some((d) => d.value === v)

export function checkFirstName(v: unknown): string | undefined {
  const s = str(v, 60)
  if (s.length < 2) return 'Indiquez votre prénom.'
  return undefined
}
export function checkEmail(v: unknown): string | undefined {
  return EMAIL.test(normalizeEmail(v)) ? undefined : 'Indiquez une adresse e-mail valide.'
}
export function checkPassword(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length < MIN_PASSWORD) return `Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`
  if (v.length > MAX_PASSWORD) return 'Ce mot de passe est trop long.'
  if (/^\s|\s$/.test(v)) return 'Le mot de passe ne doit pas commencer ni finir par une espace.'
  return undefined
}

/** Vérifie un formulaire d'inscription ; renvoie les données nettoyées et les erreurs par champ (en français). */
export function checkSignup(raw: Record<string, unknown>): { data: SignupInput; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const data: SignupInput = {
    firstName: str(raw.firstName, 60),
    email: normalizeEmail(raw.email),
    password: typeof raw.password === 'string' ? raw.password : '',
    department: isDepartmentValue(raw.department) ? raw.department : null,
    newsletter: bool(raw.newsletter),
    consent: bool(raw.consent),
  }
  const first = checkFirstName(data.firstName)
  if (first) errors.firstName = first
  const email = checkEmail(data.email)
  if (email) errors.email = email
  const password = checkPassword(data.password)
  if (password) errors.password = password
  if (!data.consent) errors.consent = 'Merci d’accepter la politique de confidentialité pour créer votre compte.'
  return { data, errors }
}

/** Champs du profil modifiables (les absents restent inchangés). */
export function checkProfile(raw: Record<string, unknown>): { data: Partial<Omit<MemberProfile, 'email' | 'createdAt'>>; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const data: Partial<Omit<MemberProfile, 'email' | 'createdAt'>> = {}
  if ('firstName' in raw) {
    const e = checkFirstName(raw.firstName)
    if (e) errors.firstName = e
    else data.firstName = str(raw.firstName, 60)
  }
  if ('lastName' in raw) data.lastName = str(raw.lastName, 80)
  if ('department' in raw) {
    if (raw.department === null || raw.department === '') data.department = null
    else if (isDepartmentValue(raw.department)) data.department = raw.department
    else errors.department = 'Choisissez un département de la liste.'
  }
  if ('newsletter' in raw) data.newsletter = bool(raw.newsletter)
  if ('historyPaused' in raw) data.historyPaused = bool(raw.historyPaused)
  return { data, errors }
}

/**
 * Chemin de retour après connexion : uniquement une adresse interne du site (jamais //autre-site ni l'administration).
 * Caractères de contrôle et barre oblique inverse refusés : le navigateur les retire ou les convertit, et « /\t/site »
 * deviendrait « //site », une adresse extérieure.
 */
export function safeReturn(v: unknown, fallback = '/compte'): string {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || /[\u0000-\u001f\u007f\\]/.test(v)) return fallback
  if (/^\/(admin|api|_next)(\/|$|\?)/.test(v)) return fallback
  return v.slice(0, 300)
}

/** Pages d'où l'on ne revient pas après connexion (elles renverraient en boucle vers elles-mêmes ou vers /compte). */
export const isAuthPage = (path: string) => /^\/(connexion|inscription|mot-de-passe-oublie|compte\/nouveau-mot-de-passe|compte\/verifier)(\/|\?|#|$)/.test(path)

/** Lien « Se connecter » depuis la page `pathname` : on y revient après la connexion (sauf pages de connexion et espace). */
export function loginHref(pathname: string | null): string {
  if (!pathname || pathname === '/' || pathname.startsWith('/compte') || isAuthPage(pathname)) return '/connexion'
  return `/connexion?retour=${encodeURIComponent(safeReturn(pathname, '/'))}`
}
