// Outils des tests d'intégration : instance Payload de la base de test, et appels de l'API REST comme un navigateur
// (handleEndpoints : la même chaîne que /api/… du site, authentification et droits compris), sans serveur.
import config from '@payload-config'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import { ADMIN, EDITOR } from './accounts'

/** Origine du site pendant les tests (NEXT_PUBLIC_SITE_URL de vitest.config.ts). */
export const SITE = 'http://localhost:3000'

let instance: Promise<Payload> | undefined

/** Instance Payload de la base de test (une par fichier de tests), journal limité aux avertissements. */
export function testPayload(): Promise<Payload> {
  instance ??= getPayload({ config }).then((payload) => {
    payload.logger.level = 'warn'
    return payload
  })
  return instance
}

/**
 * Ferme Payload et ses connexions à la base (son `destroy()` laisse le pool PostgreSQL ouvert), sans attendre plus de
 * 3 s une connexion que Payload garderait (le processus de test s'arrête de toute façon à la fin).
 */
export async function shutdown(payload: Payload) {
  const pool = (payload.db as unknown as { pool?: { end: () => Promise<void> } }).pool
  await payload.destroy()
  await Promise.race([pool?.end().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000).unref())])
}

/** Ferme la connexion à la base en fin de fichier (setup.ts). */
export async function closePayload() {
  if (!instance) return
  const payload = await instance
  instance = undefined
  await shutdown(payload)
}

export type ApiOptions = {
  method?: string
  /** corps JSON */
  body?: unknown
  headers?: Record<string, string>
  /** cookies à envoyer (CookieJar.header()) */
  cookie?: string
  /** en-tête Origin : celui du site par défaut ; null pour ne pas l'envoyer */
  origin?: string | null
  /** jeton de l'équipe (« Authorization: JWT … ») */
  token?: string
}

/** Requête à l'API REST (`path` sans « /api »), réponse fetch. */
export async function api(path: string, options: ApiOptions = {}): Promise<Response> {
  await testPayload()
  const headers = new Headers(options.headers)
  const method = (options.method ?? (options.body === undefined ? 'GET' : 'POST')).toUpperCase()
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (options.cookie) headers.set('cookie', options.cookie)
  if (options.token) headers.set('authorization', `JWT ${options.token}`)
  const origin = options.origin === undefined ? (method === 'GET' ? null : SITE) : options.origin
  if (origin) headers.set('origin', origin)
  const request = new Request(`${SITE}/api${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
  })
  return handleEndpoints({ config, request })
}

/** Réponse JSON (et code) d'un appel à l'API. */
export async function apiJson<T = Record<string, unknown>>(path: string, options: ApiOptions = {}): Promise<{ status: number; body: T; response: Response }> {
  const response = await api(path, options)
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body: body as T, response }
}

/** Cookies reçus (Set-Cookie), renvoyés aux requêtes suivantes, comme un navigateur. */
export class CookieJar {
  private cookies = new Map<string, string>()
  /** Retient les cookies d'une réponse (un cookie expiré est oublié). */
  store(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';').map((s) => s.trim())
      const [name, ...value] = pair.split('=')
      const expired = attributes.some((a) => /^max-age=0$/i.test(a)) || value.join('=') === ''
      if (expired) this.cookies.delete(name)
      else this.cookies.set(name, value.join('='))
    }
    return this
  }
  get(name: string) {
    return this.cookies.get(name)
  }
  set(name: string, value: string) {
    this.cookies.set(name, value)
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

const tokens = new Map<string, string>()

/** Jeton de connexion d'un compte de l'équipe (connexion par l'API, gardé pour le fichier de tests). */
export async function login(account: { email: string; password: string }): Promise<string> {
  const cached = tokens.get(account.email)
  if (cached) return cached
  const { status, body } = await apiJson<{ token?: string }>('/users/login', { body: { email: account.email, password: account.password } })
  if (status !== 200 || !body.token) throw new Error(`Connexion impossible pour ${account.email} (${status})`)
  tokens.set(account.email, body.token)
  return body.token
}

export const adminToken = () => login(ADMIN)
export const editorToken = () => login(EDITOR)

/** Identifiant unique pour nommer les contenus d'un test (pas de collision entre tests). */
export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
