// API de l'espace membres (/api/compte/…) : inscription, connexion, mot de passe, profil, historique, « Ma liste »,
// export et suppression des données ; export de la lettre d'info pour l'équipe. Sessions propres aux membres (cookie
// signé, voir session.ts) : un membre n'est jamais `req.user` et n'a donc aucun droit dans l'administration.
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { after } from 'next/server'
import type { Endpoint, Payload, PayloadRequest, Where } from 'payload'
import type { Member } from '@/payload-types'
import { departmentLabel } from '@/lib/departments'
import { parisDay } from '@/lib/format'
import { hashPassword, hashToken, newToken, verifyPassword } from './crypto'
import { resetEmail, sendMemberEmail } from './emails'
import { isPublicItem, loadItems } from './items'
import { allow, allowKey, rateFactor } from './rate-limit'
import { clearCookies, memberFromHeaders, NO_COUNTS, sameOrigin, sessionCookies, toProfile } from './session'
import {
  checkPassword,
  checkProfile,
  checkSignup,
  isFavoriteKind,
  isHistoryKind,
  normalizeEmail,
  type FavoriteKind,
} from './shared'
import { SITE_URL } from '@/lib/site'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** Essais de mot de passe avant blocage du compte, et durée du blocage. */
const MAX_ATTEMPTS = 5
const LOCK_MS = 15 * MINUTE
/** Entrées gardées dans l'historique d'un membre (les plus anciennes sont effacées au-delà). */
export const HISTORY_MAX = 200
const RESET_MS = HOUR

const GENERIC_LOGIN = 'E-mail ou mot de passe incorrect.'
const EMAIL_TAKEN = 'Un compte existe déjà avec cette adresse : connectez-vous (ou choisissez un nouveau mot de passe si vous l’avez oublié).'

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}
const refused = () => json({ error: 'Requête refusée.' }, 403)
/** « Trop de tentatives… », « Trop d’inscriptions… » (élision devant une voyelle). */
const tooMany = (what: string) =>
  json({ error: `Trop ${/^[aeiouyéèêàâîôû]/i.test(what) ? 'd’' : 'de '}${what} depuis votre connexion : réessayez dans quelques minutes.` }, 429)
const locked = () =>
  json({ error: 'Trop d’essais : la connexion à ce compte est bloquée pendant 15 minutes. Vous pouvez aussi choisir un nouveau mot de passe.', code: 'locked' }, 429)

async function readBody(req: PayloadRequest): Promise<Record<string, unknown> | null> {
  const raw: unknown = await req.json?.().catch(() => null)
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/** Membre connecté, ou réponse 401 (qui efface un cookie de session devenu invalide). */
async function member(req: PayloadRequest): Promise<Member | Response> {
  const m = await memberFromHeaders(req.payload, req.headers)
  if (m) return m
  const stale = Boolean(req.headers.get('cookie')?.includes('sw_'))
  const error = stale ? 'Votre session a expiré : reconnectez-vous.' : 'Connectez-vous pour accéder à votre espace.'
  return json({ error, code: 'unauthenticated' }, 401, stale ? clearCookies() : [])
}

const findByEmail = async (payload: Payload, email: string) =>
  (
    await payload.find({
      collection: 'members',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      pagination: false,
      context: NO_COUNTS,
    })
  ).docs[0] ?? null

/**
 * Écriture partielle d'un membre : seules les colonnes indiquées changent (`{ $inc: 1 }` incrémente en base). Une mise à jour
 * Payload réécrirait tout le document tel qu'il a été lu au départ, et annulerait une écriture faite entre-temps
 * (changement de mot de passe, suspension…). Sans hooks ni validation : valeurs déjà vérifiées ici uniquement.
 */
const write = async (payload: Payload, id: number, data: Record<string, unknown>): Promise<Member> =>
  (await payload.db.updateOne({ collection: 'members', id, data: { ...data, updatedAt: new Date().toISOString() } })) as unknown as Member

/**
 * Écriture partielle conditionnelle, en une seule requête : seulement si la ligne vérifie encore `conditions` (état lu
 * quelques millisecondes plus tôt). Null si une autre requête l'a changée entre-temps.
 */
const writeIf = async (payload: Payload, id: number, conditions: Where[], data: Record<string, unknown>): Promise<Member | null> =>
  (await payload.db.updateOne({
    collection: 'members',
    where: { and: [{ id: { equals: id } }, ...conditions] },
    data: { ...data, updatedAt: new Date().toISOString() },
    options: { atomic: true },
  })) as Member | null

/**
 * Réserve un essai de mot de passe AVANT de le vérifier, en une seule requête : des essais envoyés en même temps sont tous
 * comptés (lire puis réécrire le compteur laisserait passer toute une rafale). Faux si le compte est bloqué ; le 5e essai
 * bloque le compte pour 15 minutes (il est encore vérifié : le bon mot de passe passe et débloque).
 */
async function reserveAttempt(payload: Payload, id: number): Promise<boolean> {
  const { drizzle } = payload.db as unknown as PostgresAdapter
  const res = await drizzle.execute(sql`
    update members set
      login_attempts = case when coalesce(login_attempts, 0) + 1 >= ${MAX_ATTEMPTS} then 0 else coalesce(login_attempts, 0) + 1 end,
      lock_until = case when coalesce(login_attempts, 0) + 1 >= ${MAX_ATTEMPTS} then now() + make_interval(mins => ${LOCK_MS / MINUTE}) else null end
    where id = ${id} and (lock_until is null or lock_until <= now())
    returning id`)
  return res.rows.length > 0
}

/**
 * Adresses sans compte : essais comptés, et blocage, comme en base pour un vrai compte (reserveAttempt : compteur sans
 * limite de temps, blocage de 15 minutes au 5e essai), pour que la réponse ne dise pas si l'adresse est inscrite.
 * Mémoire du processus (un serveur unique).
 */
const unknownAttempts = new Map<string, { count: number; lockUntil: number }>()
function reserveUnknown(email: string): boolean {
  const now = Date.now()
  const entry = unknownAttempts.get(email)
  if (entry && entry.lockUntil > now) return false
  const count = (entry?.count ?? 0) + 1
  unknownAttempts.set(email, count >= MAX_ATTEMPTS ? { count: 0, lockUntil: now + LOCK_MS } : { count, lockUntil: 0 })
  if (unknownAttempts.size > 10_000) unknownAttempts.clear()
  return true
}

/**
 * Mot de passe actuel demandé par une action faite avec une session valide (changement de mot de passe, suppression) :
 * 5 essais par quart d'heure, compteur propre au membre (les essais de connexion d'un tiers ne bloquent pas ces actions).
 */
const allowCurrentPassword = (memberId: number) => allowKey('mot-de-passe-actuel', String(memberId), MAX_ATTEMPTS, LOCK_MS)
const tooManyCurrent = () => json({ error: 'Trop d’essais : réessayez dans 15 minutes.', code: 'locked' }, 429)

/**
 * Travail fait après l'envoi de la réponse (recherche du compte, écritures, e-mail) : la durée de la réponse ne révèle pas
 * si l'adresse est inscrite. Une erreur est écrite dans le journal du serveur.
 */
function later(payload: Payload, what: string, task: () => Promise<unknown>) {
  const run = () => task().catch((e: unknown) => payload.logger.error(`[swatter] ${what} : ${e instanceof Error ? e.message : String(e)}`))
  try {
    after(run)
  } catch {
    // hors d'une requête Next.js (scripts) : tout de suite
    void run()
  }
}

/** Identifiant de contenu : entier positif d'une colonne PostgreSQL `integer`. */
const idOf = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null
}

/** Enregistre (ou rafraîchit) une ligne unique membre × contenu. */
async function upsert(payload: Payload, collection: 'member-history' | 'member-favorites', memberId: number, kind: FavoriteKind, itemId: number) {
  const now = new Date().toISOString()
  const date = collection === 'member-history' ? { watchedAt: now } : { savedAt: now }
  try {
    const found = (await payload.find({ collection, where: activityWhere(memberId, kind, itemId), limit: 1, depth: 0, overrideAccess: true, pagination: false })).docs[0]
    if (found) return await payload.update({ collection, id: found.id, data: date, overrideAccess: true, depth: 0 })
    return await payload.create({ collection, data: { member: memberId, kind, itemId, ...date } as never, overrideAccess: true, depth: 0 })
  } catch {
    // requêtes simultanées : ligne créée par l'autre (index unique) ou effacée entre-temps
    return null
  }
}

const activityWhere = (memberId: number, kind: string, itemId: number): Where => ({
  and: [{ member: { equals: memberId } }, { kind: { equals: kind } }, { itemId: { equals: itemId } }],
})

/** Garde les HISTORY_MAX entrées les plus récentes de l'historique d'un membre. */
async function trimHistory(payload: Payload, memberId: number) {
  const { totalDocs } = await payload.count({ collection: 'member-history', where: { member: { equals: memberId } }, overrideAccess: true })
  if (totalDocs <= HISTORY_MAX) return
  const old = await payload.find({
    collection: 'member-history',
    where: { member: { equals: memberId } },
    sort: 'watchedAt',
    limit: totalDocs - HISTORY_MAX,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { watchedAt: true },
  })
  await payload.delete({ collection: 'member-history', where: { id: { in: old.docs.map((d) => d.id) } }, overrideAccess: true })
}

/**
 * Cellule CSV. Une valeur saisie par un membre qui commence par = + - @ (ou une tabulation) serait lue comme une formule par
 * Excel ou LibreOffice (lien piégé, envoi de la colonne des e-mails…) : une apostrophe en tête la garde comme du texte.
 */
export const csv = (raw: string) => {
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export const memberEndpoints: Endpoint[] = [
  {
    // Inscription : prénom, e-mail et mot de passe. Le compte est actif aussitôt et le membre connecté (pas d'e-mail de
    // confirmation). Une adresse déjà inscrite est signalée : sans confirmation, on ne peut pas faire autrement.
    path: '/compte/inscription',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (!raw) return json({ error: 'Requête illisible.' }, 400)
      // champ piège rempli, ou envoi sans le formulaire / moins de 3 s après son affichage (durée mesurée par le
      // navigateur, `elapsed` en ms : indépendante de son horloge) : un robot (réponse polie, rien n'est fait)
      const elapsed = Number(raw.elapsed)
      if (raw.website || !Number.isFinite(elapsed) || elapsed < 3000) return json({ ok: true })
      const settings = await req.payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
      if (settings?.members?.signupOpen === false) return json({ error: 'Les inscriptions sont momentanément fermées. Revenez bientôt !', code: 'closed' }, 403)
      const { data, errors } = checkSignup(raw)
      if (Object.keys(errors).length) return json({ errors }, 400)
      if (!allow('inscription', req.headers, 10 * rateFactor(), HOUR)) return tooMany('inscriptions')

      const payload = req.payload
      const exists = () => json({ errors: { email: EMAIL_TAKEN }, code: 'exists' }, 400)
      if (await findByEmail(payload, data.email)) return exists()
      const now = new Date().toISOString()
      try {
        const created = await payload.create({
          collection: 'members',
          data: { firstName: data.firstName, email: data.email, passwordHash: await hashPassword(data.password), consentAt: now, lastLoginAt: now },
          overrideAccess: true,
          showHiddenFields: true,
          depth: 0,
          context: NO_COUNTS,
        })
        return json({ ok: true, firstName: created.firstName }, 200, sessionCookies(created))
      } catch (error) {
        // deux inscriptions simultanées avec la même adresse (index unique)
        if (await findByEmail(payload, data.email)) return exists()
        payload.logger.error(`[swatter] Inscription impossible : ${error instanceof Error ? error.message : String(error)}`)
        return json({ error: 'L’inscription n’a pas abouti. Réessayez dans un instant.' }, 500)
      }
    },
  },
  {
    path: '/compte/connexion',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (!raw) return json({ error: 'Requête illisible.' }, 400)
      if (!allow('connexion', req.headers, 30 * rateFactor(), 15 * MINUTE)) return tooMany('tentatives')
      const email = normalizeEmail(raw.email)
      const password = typeof raw.password === 'string' ? raw.password : ''
      const payload = req.payload
      if (!email || !password) {
        // champ vide : même réponse et même durée pour toutes les adresses, sans compter d'essai
        await verifyPassword(password, undefined)
        return json({ error: GENERIC_LOGIN }, 401)
      }
      const m = await findByEmail(payload, email)
      if (!m) {
        // adresse inconnue : même blocage après 5 essais, et même calcul de mot de passe, que pour un vrai compte (la
        // connexion ne révèle pas si l'adresse est inscrite)
        if (!reserveUnknown(email)) return locked()
        await verifyPassword(password, undefined)
        return json({ error: GENERIC_LOGIN }, 401)
      }
      if (!(await reserveAttempt(payload, m.id))) return locked()
      if (!(await verifyPassword(password, m.passwordHash))) return json({ error: GENERIC_LOGIN }, 401)
      if (m.blocked) return json({ error: 'Ce compte a été suspendu. Écrivez-nous si vous pensez qu’il s’agit d’une erreur.', code: 'blocked' }, 403)
      const updated = await write(payload, m.id, { loginAttempts: 0, lockUntil: null, lastLoginAt: new Date().toISOString() })
      return json({ ok: true, firstName: m.firstName }, 200, sessionCookies(updated))
    },
  },
  {
    // ?partout=1 (ou { partout: true }) : ferme aussi les sessions des autres appareils
    path: '/compte/deconnexion',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (raw?.partout === true || req.searchParams.get('partout') === '1') {
        const m = await memberFromHeaders(req.payload, req.headers)
        if (m) await write(req.payload, m.id, { sessionVersion: { $inc: 1 } })
      }
      return json({ ok: true }, 200, clearCookies())
    },
  },
  {
    path: '/compte/mot-de-passe-oublie',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (!allow('oubli', req.headers, 5 * rateFactor(), 15 * MINUTE)) return tooMany('demandes')
      const payload = req.payload
      const email = normalizeEmail(raw?.email)
      later(payload, 'Envoi du lien de nouveau mot de passe impossible', async () => {
        const m = email ? await findByEmail(payload, email) : null
        if (!m || m.blocked) return
        const { token, hash } = newToken()
        // rien n'est envoyé si l'adresse a changé (administration) ou si le compte a été suspendu entre-temps
        const conditions: Where[] = [{ email: { equals: m.email } }, { blocked: { not_equals: true } }]
        if (!(await writeIf(payload, m.id, conditions, { resetTokenHash: hash, resetTokenExpires: new Date(Date.now() + RESET_MS).toISOString() }))) return
        await sendMemberEmail(payload, m.email, resetEmail(m.firstName, token), `${SITE_URL}/compte/nouveau-mot-de-passe?token=${encodeURIComponent(token)}`)
      })
      // même réponse, et même durée, que l'adresse soit inscrite ou non
      return json({ ok: true })
    },
  },
  {
    // Nouveau mot de passe depuis le lien reçu : il ferme les autres sessions et connecte.
    path: '/compte/nouveau-mot-de-passe',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (!allow('nouveau-mdp', req.headers, 20 * rateFactor(), 15 * MINUTE)) return tooMany('tentatives')
      const token = typeof raw?.token === 'string' ? raw.token : ''
      const pwdError = checkPassword(raw?.password)
      if (pwdError) return json({ errors: { password: pwdError } }, 400)
      const payload = req.payload
      // jeton consommé en une seule requête (deux envois simultanés du même lien : un seul passe)
      const m = token
        ? ((await payload.db.updateOne({
            collection: 'members',
            where: { and: [{ resetTokenHash: { equals: hashToken(token) } }, { resetTokenExpires: { greater_than: new Date().toISOString() } }] },
            data: { resetTokenHash: null, resetTokenExpires: null },
            options: { atomic: true },
          })) as Member | null)
        : null
      if (!m) return json({ error: 'Ce lien n’est plus valable (il sert une seule fois, pendant une heure). Faites une nouvelle demande.', code: 'invalid' }, 400)
      if (m.blocked) return json({ error: 'Ce compte a été suspendu.', code: 'blocked' }, 403)
      const updated = await write(payload, m.id, {
        passwordHash: await hashPassword(raw?.password as string),
        loginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date().toISOString(),
        sessionVersion: { $inc: 1 },
      })
      return json({ ok: true, firstName: m.firstName }, 200, sessionCookies(updated))
    },
  },
  {
    path: '/compte/moi',
    method: 'get',
    handler: async (req) => {
      const m = await member(req)
      return m instanceof Response ? m : json(toProfile(m))
    },
  },
  {
    path: '/compte/profil',
    method: 'patch',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const m = await member(req)
      if (m instanceof Response) return m
      const raw = await readBody(req)
      if (!raw) return json({ error: 'Requête illisible.' }, 400)
      const { data, errors } = checkProfile(raw)
      if (Object.keys(errors).length) return json({ errors }, 400)
      const updated = await write(req.payload, m.id, data)
      return json(toProfile(updated))
    },
  },
  {
    // Changement de mot de passe (mot de passe actuel exigé) : les autres appareils sont déconnectés, pas celui-ci.
    path: '/compte/mot-de-passe',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const m = await member(req)
      if (m instanceof Response) return m
      if (!allow('changement-mdp', req.headers, 10 * rateFactor(), 15 * MINUTE)) return tooMany('tentatives')
      const raw = await readBody(req)
      const pwdError = checkPassword(raw?.password)
      if (pwdError) return json({ errors: { password: pwdError } }, 400)
      if (!allowCurrentPassword(m.id)) return tooManyCurrent()
      if (!(await verifyPassword(typeof raw?.current === 'string' ? raw.current : '', m.passwordHash))) {
        return json({ errors: { current: 'Mot de passe actuel incorrect.' } }, 400)
      }
      const updated = await write(req.payload, m.id, {
        passwordHash: await hashPassword(raw?.password as string),
        sessionVersion: { $inc: 1 },
        resetTokenHash: null,
        resetTokenExpires: null,
      })
      return json({ ok: true }, 200, sessionCookies(updated))
    },
  },
  {
    // Vidéo ou replay lancé : ajouté en tête de l'historique (sauf historique en pause)
    path: '/compte/historique',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const m = await member(req)
      if (m instanceof Response) return m
      const raw = await readBody(req)
      const id = idOf(raw?.id)
      if (!isHistoryKind(raw?.kind) || !id) return json({ error: 'Contenu inconnu.' }, 400)
      if (m.historyPaused) return json({ ok: true, paused: true })
      if (!(await isPublicItem(req.payload, raw.kind, id))) return json({ error: 'Contenu introuvable.' }, 404)
      await upsert(req.payload, 'member-history', m.id, raw.kind, id)
      await trimHistory(req.payload, m.id)
      return json({ ok: true })
    },
  },
  {
    // ?kind=video&id=12 : une entrée ; sans paramètre : tout l'historique
    path: '/compte/historique',
    method: 'delete',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const m = await member(req)
      if (m instanceof Response) return m
      const kind = req.searchParams.get('kind')
      const id = idOf(req.searchParams.get('id'))
      // une entrée précise, ou (sans aucun paramètre) tout l'historique : jamais tout effacer sur un paramètre invalide
      if ([...req.searchParams.keys()].length) {
        if (!isHistoryKind(kind) || !id) return json({ error: 'Contenu inconnu.' }, 400)
      }
      await req.payload.delete({
        collection: 'member-history',
        where: { and: [{ member: { equals: m.id } }, ...(id && kind ? [{ kind: { equals: kind } }, { itemId: { equals: id } }] : [])] },
        overrideAccess: true,
      })
      return json({ ok: true })
    },
  },
  {
    // ?kind=article&id=4 : le contenu est-il dans « Ma liste » ?
    path: '/compte/favoris',
    method: 'get',
    handler: async (req) => {
      const m = await member(req)
      if (m instanceof Response) return m
      const kind = req.searchParams.get('kind')
      const id = idOf(req.searchParams.get('id'))
      if (!isFavoriteKind(kind) || !id) return json({ error: 'Contenu inconnu.' }, 400)
      const { totalDocs } = await req.payload.count({
        collection: 'member-favorites',
        where: activityWhere(m.id, kind, id),
        overrideAccess: true,
      })
      return json({ saved: totalDocs > 0 })
    },
  },
  {
    path: '/compte/favoris',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const m = await member(req)
      if (m instanceof Response) return m
      const raw = await readBody(req)
      const id = idOf(raw?.id)
      if (!isFavoriteKind(raw?.kind) || !id) return json({ error: 'Contenu inconnu.' }, 400)
      if (!(await isPublicItem(req.payload, raw.kind, id))) return json({ error: 'Contenu introuvable.' }, 404)
      // limite comptée pour un nouvel ajout seulement (un contenu déjà gardé reste « enregistré »)
      const already = await req.payload.count({ collection: 'member-favorites', where: activityWhere(m.id, raw.kind, id), overrideAccess: true })
      if (!already.totalDocs) {
        const { totalDocs } = await req.payload.count({ collection: 'member-favorites', where: { member: { equals: m.id } }, overrideAccess: true })
        if (totalDocs >= 500) return json({ error: 'Votre liste est pleine (500 contenus) : retirez-en quelques-uns.' }, 409)
      }
      await upsert(req.payload, 'member-favorites', m.id, raw.kind, id)
      return json({ saved: true })
    },
  },
  {
    path: '/compte/favoris',
    method: 'delete',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const m = await member(req)
      if (m instanceof Response) return m
      const kind = req.searchParams.get('kind')
      const id = idOf(req.searchParams.get('id'))
      if (!isFavoriteKind(kind) || !id) return json({ error: 'Contenu inconnu.' }, 400)
      await req.payload.delete({ collection: 'member-favorites', where: activityWhere(m.id, kind, id), overrideAccess: true })
      return json({ saved: false })
    },
  },
  {
    // Droit d'accès et à la portabilité (RGPD) : toutes les données du membre, en JSON
    path: '/compte/export',
    method: 'get',
    handler: async (req) => {
      const m = await member(req)
      if (m instanceof Response) return m
      const payload = req.payload
      const [history, favorites] = await Promise.all([
        payload.find({ collection: 'member-history', where: { member: { equals: m.id } }, sort: '-watchedAt', limit: 1000, depth: 0, pagination: false, overrideAccess: true }),
        payload.find({ collection: 'member-favorites', where: { member: { equals: m.id } }, sort: '-savedAt', limit: 1000, depth: 0, pagination: false, overrideAccess: true }),
      ])
      const items = await loadItems(payload, [...history.docs, ...favorites.docs] as { kind: FavoriteKind; itemId: number }[], { publicOnly: false })
      const describe = (d: { kind: string; itemId: number }) => {
        const item = items.get(`${d.kind}:${d.itemId}`)
        return { type: d.kind, titre: item?.title ?? '(contenu retiré du site)', adresse: item ? `${SITE_URL}${item.href}` : null }
      }
      const data = {
        exportéLe: new Date().toISOString(),
        profil: {
          ...toProfile(m),
          département: m.department ? departmentLabel(m.department) : null,
          conditionsAcceptéesLe: m.consentAt ?? null,
          dernièreConnexion: m.lastLoginAt ?? null,
        },
        historique: history.docs.map((d) => ({ ...describe(d), regardéLe: d.watchedAt })),
        maListe: favorites.docs.map((d) => ({ ...describe(d), ajoutéLe: d.savedAt })),
      }
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': 'attachment; filename="mes-donnees-swatter-tv.json"',
          'cache-control': 'no-store',
        },
      })
    },
  },
  {
    // Suppression du compte (mot de passe exigé) : profil, historique et liste effacés définitivement.
    path: '/compte/supprimer',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const m = await member(req)
      if (m instanceof Response) return m
      if (!allow('suppression', req.headers, 10 * rateFactor(), 15 * MINUTE)) return tooMany('tentatives')
      const raw = await readBody(req)
      if (!allowCurrentPassword(m.id)) return tooManyCurrent()
      if (!(await verifyPassword(typeof raw?.password === 'string' ? raw.password : '', m.passwordHash))) {
        return json({ errors: { current: 'Mot de passe incorrect.' } }, 400)
      }
      // sessions fermées d'abord : plus aucun ajout (vidéo lancée dans un autre onglet…) ne peut suivre. Un ajout déjà en
      // cours peut encore glisser une ligne entre le ménage de l'historique et la suppression (clé étrangère) : nouvel essai.
      await write(req.payload, m.id, { sessionVersion: { $inc: 1 } })
      for (let attempt = 1; ; attempt++) {
        try {
          await req.payload.delete({ collection: 'members', id: m.id, overrideAccess: true })
          break
        } catch (error) {
          if (attempt >= 3) throw error
          await new Promise((resolve) => setTimeout(resolve, 150 * attempt))
        }
      }
      return json({ ok: true }, 200, clearCookies())
    },
  },
  {
    // Pour l'équipe (administrateurs) : membres non suspendus qui acceptent les e-mails, au format CSV (Excel, Brevo…)
    path: '/membres/lettre-info.csv',
    method: 'get',
    handler: async (req) => {
      const user = req.user as { role?: string; collection?: string } | null
      if (user?.collection !== 'users' || user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, 403)
      const res = await req.payload.find({
        collection: 'members',
        where: { and: [{ newsletter: { equals: true } }, { blocked: { not_equals: true } }] },
        sort: 'createdAt',
        limit: 50_000,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        select: { firstName: true, lastName: true, email: true, department: true, createdAt: true },
      })
      const lines = [
        ['Prénom', 'Nom', 'E-mail', 'Département', 'Inscrit le'].join(';'),
        ...res.docs.map((d) =>
          [d.firstName, d.lastName ?? '', d.email, d.department ? departmentLabel(d.department) : '', parisDay(d.createdAt)].map((v) => csv(String(v))).join(';'),
        ),
      ]
      return new Response(`﻿${lines.join('\r\n')}\r\n`, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="membres-lettre-info-${parisDay()}.csv"`,
          'cache-control': 'no-store',
        },
      })
    },
  },
]
