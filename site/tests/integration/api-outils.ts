// Outils des tests d'intégration des routes de l'API (fichiers api-*.test.ts) : une adresse IP par test (les limites
// anti-abus sont comptées par adresse), membres inscrits par l'API comme depuis le formulaire, contenus publiés,
// brouillons, programmés ou retirés du site, lignes d'activité des membres écrites directement en base.
import type { Payload } from 'payload'
import type { Article, Event, Member, Program, Replay, Video, Webcam } from '@/payload-types'
import { adminToken, apiJson, CookieJar, testPayload, unique, type ApiOptions } from './helpers'

/** Pas de régénération du site pendant les tests (aucun runtime Next.js). */
const CONTEXT = { disableRevalidate: true }

let ipCount = 0
/** Adresse IP propre à un test (dernier maillon de X-Forwarded-For, celui du reverse proxy). */
export function newIp(): string {
  ipCount++
  return `198.18.${Math.floor(ipCount / 250)}.${(ipCount % 250) + 1}`
}

/** En-têtes d'une requête venue de l'adresse `ip`. */
export const fromIp = (ip: string, headers: Record<string, string> = {}): Record<string, string> => ({ 'x-forwarded-for': ip, ...headers })

/** Instant décalé de `minutes` par rapport à maintenant, en ISO. */
export const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

/** Minutes entre maintenant et l'instant `iso` (négatif s'il est passé). */
export const minutesUntil = (iso: string | null | undefined) => (iso ? (Date.parse(iso) - Date.now()) / 60_000 : Number.NaN)

export type SetCookie = { value: string; attributes: Map<string, string> }

/** Cookies posés par une réponse (Set-Cookie) : valeur et attributs (noms en minuscules) de chacun. */
export function setCookies(response: Response): Map<string, SetCookie> {
  const out = new Map<string, SetCookie>()
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(';').map((s) => s.trim())
    const [name, ...value] = pair.split('=')
    const attrs = new Map(
      attributes.map((a): [string, string] => {
        const [k, ...v] = a.split('=')
        return [k.toLowerCase(), v.join('=')]
      }),
    )
    out.set(name, { value: value.join('='), attributes: attrs })
  }
  return out
}

/** Réponse d'un point d'entrée qui efface la session : les deux cookies de l'espace membres, vides et expirés. */
export function clearsSession(response: Response): boolean {
  const cookies = setCookies(response)
  return ['sw_membre', 'sw_connecte'].every((name) => cookies.get(name)?.value === '' && cookies.get(name)?.attributes.get('max-age') === '0')
}

// ----- Membres -----

export const PASSWORD = 'mot-de-passe-des-tests'

/** Adresse e-mail unique (en minuscules, comme l'enregistre l'inscription). */
export const newEmail = (tag = 'membre') => `${unique(tag)}@example.com`.toLowerCase()

export type TestMember = { id: number; email: string; password: string; firstName: string; ip: string; jar: CookieJar }

/** Fiche complète d'un membre (champs techniques compris), lue en base. */
export async function findMember(email: string): Promise<Member | null> {
  const payload = await testPayload()
  const { docs } = await payload.find({
    collection: 'members',
    where: { email: { equals: email.toLowerCase() } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return docs[0] ?? null
}

/** Fiche d'un membre par son numéro (null s'il n'existe plus). */
export async function memberById(id: number): Promise<Member | null> {
  const payload = await testPayload()
  return payload.findByID({ collection: 'members', id, depth: 0, overrideAccess: true, showHiddenFields: true, disableErrors: true })
}

/** Inscription par l'API, comme le formulaire (champ piège vide, envoi 5 s après l'affichage) : membre connecté dans `jar`. */
export async function signup(options: Partial<Pick<TestMember, 'firstName' | 'email' | 'password' | 'ip'>> = {}): Promise<TestMember> {
  const member = { firstName: 'Camille', email: newEmail(), password: PASSWORD, ip: newIp(), ...options }
  const res = await apiJson<{ ok?: boolean }>('/compte/inscription', {
    body: { firstName: member.firstName, email: member.email, password: member.password, website: '', elapsed: 5000 },
    headers: fromIp(member.ip),
  })
  if (res.status !== 200 || !res.body?.ok) throw new Error(`Inscription impossible (${res.status}) : ${JSON.stringify(res.body)}`)
  const doc = await findMember(member.email)
  if (!doc) throw new Error(`Membre ${member.email} introuvable après l’inscription`)
  return { ...member, email: doc.email, id: doc.id, jar: new CookieJar().store(res.response) }
}

/** Connexion par l'API (cookies de la réponse dans un nouveau « navigateur »). */
export async function memberLogin(credentials: { email: string; password: string }, ip = newIp()) {
  const res = await apiJson<{ ok?: boolean; firstName?: string; error?: string; code?: string }>('/compte/connexion', {
    body: { email: credentials.email, password: credentials.password },
    headers: fromIp(ip),
  })
  return { ...res, jar: new CookieJar().store(res.response) }
}

/**
 * Requête d'un membre à l'API, depuis son adresse IP et avec les cookies de `jar` (mis à jour par la réponse, comme
 * un navigateur).
 */
export async function asMember<T = Record<string, unknown>>(member: Pick<TestMember, 'ip'>, jar: CookieJar, path: string, options: ApiOptions = {}) {
  const res = await apiJson<T>(path, { ...options, cookie: jar.header(), headers: fromIp(member.ip, options.headers) })
  jar.store(res.response)
  return res
}

/** Fiche d'un membre modifiée par un administrateur, comme depuis l'administration (API REST, hooks compris). */
export async function adminUpdateMember(id: number, data: Record<string, unknown>) {
  const res = await apiJson<{ doc?: Member; errors?: unknown }>(`/members/${id}`, { method: 'PATCH', body: data, token: await adminToken() })
  if (res.status !== 200) throw new Error(`Modification du membre ${id} impossible (${res.status}) : ${JSON.stringify(res.body)}`)
  return res.body.doc
}

/** Écriture directe en base d'une fiche de membre (sans hooks), pour préparer une situation. */
export async function writeMember(id: number, data: Record<string, unknown>) {
  const payload = await testPayload()
  await payload.db.updateOne({ collection: 'members', id, data })
}

/** Lignes de l'historique ou de « Ma liste » d'un membre, en base (les plus récentes d'abord). */
export async function activityOf(collection: 'member-history' | 'member-favorites', memberId: number) {
  const payload = await testPayload()
  const { docs } = await payload.find({
    collection,
    where: { member: { equals: memberId } },
    sort: collection === 'member-history' ? '-watchedAt' : '-savedAt',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((d) => ({ id: d.id, kind: d.kind, itemId: d.itemId, at: 'watchedAt' in d ? d.watchedAt : d.savedAt }))
}

type ActivityRow = { kind: 'video' | 'replay' | 'article' | 'event'; itemId: number; at: string }

/**
 * Lignes d'activité écrites directement en base (un historique ou une liste déjà bien remplis), 25 à la fois.
 * Les contenus désignés n'ont pas besoin d'exister.
 */
export async function addActivity(collection: 'member-history' | 'member-favorites', memberId: number, rows: ActivityRow[]) {
  const payload = await testPayload()
  const add = ({ kind, itemId, at }: ActivityRow) =>
    collection === 'member-history'
      ? payload.create({ collection, data: { member: memberId, kind: kind as 'video' | 'replay', itemId, watchedAt: at }, overrideAccess: true, depth: 0 })
      : payload.create({ collection, data: { member: memberId, kind, itemId, savedAt: at }, overrideAccess: true, depth: 0 })
  for (let i = 0; i < rows.length; i += 25) await Promise.all(rows.slice(i, i + 25).map(add))
}

// ----- Contenus -----

type Status = { draft?: boolean }
const status = (draft?: boolean) => (draft ? ('draft' as const) : ('published' as const))

/** Vidéo YouTube (sans lien : aucune vignette à télécharger), publiée il y a une heure sauf indication contraire. */
export async function createVideo(data: Partial<Omit<Video, 'id'>> = {}, { draft }: Status = {}): Promise<Video> {
  const payload = await testPayload()
  return payload.create({
    collection: 'videos',
    draft: Boolean(draft),
    data: {
      title: unique('Vidéo'),
      source: { provider: 'youtube' },
      category: 'divertissement',
      publishedAt: minutesFromNow(-60),
      _status: status(draft),
      ...data,
    },
    context: CONTEXT,
  })
}

/** Replay diffusé il y a une heure sauf indication contraire. */
export async function createReplay(data: Partial<Omit<Replay, 'id'>> = {}, { draft }: Status = {}): Promise<Replay> {
  const payload = await testPayload()
  return payload.create({
    collection: 'replays',
    draft: Boolean(draft),
    data: { title: unique('Replay'), source: { provider: 'youtube' }, broadcastAt: minutesFromNow(-60), _status: status(draft), ...data },
    context: CONTEXT,
  })
}

/** Article publié il y a une heure sauf indication contraire. */
export async function createArticle(data: Partial<Omit<Article, 'id'>> = {}, { draft }: Status = {}): Promise<Article> {
  const payload = await testPayload()
  return payload.create({
    collection: 'articles',
    draft: Boolean(draft),
    data: { title: unique('Article'), department: 'haute-savoie', publishedAt: minutesFromNow(-60), _status: status(draft), ...data },
    context: CONTEXT,
  })
}

/** Événement dans une semaine sauf indication contraire. */
export async function createEvent(data: Partial<Omit<Event, 'id'>> = {}, { draft }: Status = {}): Promise<Event> {
  const payload = await testPayload()
  return payload.create({
    collection: 'events',
    draft: Boolean(draft),
    data: { title: unique('Événement'), startDate: minutesFromNow(7 * 24 * 60), city: 'Annecy', department: 'haute-savoie', _status: status(draft), ...data },
    context: CONTEXT,
  })
}

/** Émission. */
export async function createProgram(data: Partial<Omit<Program, 'id'>> = {}, { draft }: Status = {}): Promise<Program> {
  const payload = await testPayload()
  return payload.create({
    collection: 'programs',
    draft: Boolean(draft),
    data: { title: unique('Émission'), genre: 'magazine', _status: status(draft), ...data },
    context: CONTEXT,
  })
}

/** Webcam active. */
export async function createWebcam(data: Partial<Omit<Webcam, 'id'>> = {}, { draft }: Status = {}): Promise<Webcam> {
  const payload = await testPayload()
  return payload.create({
    collection: 'webcams',
    draft: Boolean(draft),
    data: { name: unique('Webcam'), department: 'haute-savoie', provider: 'iframe', active: true, _status: status(draft), ...data },
    context: CONTEXT,
  })
}

/** « Retirer du site » : la ligne principale repasse en brouillon (le contenu reste enregistré). */
export async function unpublish(collection: 'videos' | 'replays' | 'articles' | 'events', id: number) {
  const payload = await testPayload()
  await payload.update({ collection, id, data: { _status: 'draft' }, context: CONTEXT })
}

/** Instance Payload des tests (raccourci typé). */
export const db = (): Promise<Payload> => testPayload()
