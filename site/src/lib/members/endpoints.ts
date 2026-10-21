// API de l'espace membres (/api/compte/…) : inscription, connexion, mot de passe, profil, historique, « Ma liste »,
// export et suppression des données ; export de la lettre d'info pour l'équipe. Sessions propres aux membres (cookie
// signé, voir session.ts) : un membre n'est jamais `req.user` et n'a donc aucun droit dans l'administration.
import type { Endpoint, Payload, PayloadRequest, Where } from 'payload'
import type { Member } from '@/payload-types'
import { departmentLabel } from '@/lib/departments'
import { hashPassword, hashToken, newToken, verifyPassword } from './crypto'
import { alreadyRegisteredEmail, resetEmail, sendMemberEmail, verifyEmail } from './emails'
import { isPublicItem, loadItems } from './items'
import { allow, rateFactor } from './rate-limit'
import { clearCookies, memberFromHeaders, sameOrigin, sessionCookies, toProfile } from './session'
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
const VERIFY_MS = 48 * HOUR
const RESET_MS = HOUR

const GENERIC_LOGIN = 'E-mail ou mot de passe incorrect.'

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}
const refused = () => json({ error: 'Requête refusée.' }, 403)
const tooMany = (what: string) => json({ error: `Trop de ${what} depuis votre connexion : réessayez dans quelques minutes.` }, 429)

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
  (await payload.find({ collection: 'members', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true, showHiddenFields: true, pagination: false })).docs[0] ?? null

const update = (payload: Payload, id: number, data: Partial<Member>) => payload.update({ collection: 'members', id, data, overrideAccess: true, depth: 0 })

const idOf = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

/** Enregistre (ou rafraîchit) une ligne unique membre × contenu. */
async function upsert(payload: Payload, collection: 'member-history' | 'member-favorites', memberId: number, kind: FavoriteKind, itemId: number) {
  const now = new Date().toISOString()
  const date = collection === 'member-history' ? { watchedAt: now } : { savedAt: now }
  const where: Where = { and: [{ member: { equals: memberId } }, { kind: { equals: kind } }, { itemId: { equals: itemId } }] }
  const found = (await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true, pagination: false })).docs[0]
  if (found) return payload.update({ collection, id: found.id, data: date, overrideAccess: true, depth: 0 })
  try {
    return await payload.create({ collection, data: { member: memberId, kind, itemId, ...date } as never, overrideAccess: true, depth: 0 })
  } catch {
    // deux requêtes simultanées : la ligne vient d'être créée par l'autre (index unique)
    return null
  }
}

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

const csv = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export const memberEndpoints: Endpoint[] = [
  {
    // Inscription : compte créé non confirmé, lien de confirmation envoyé par e-mail. Réponse identique que l'adresse
    // ait déjà un compte ou non (on ne révèle pas qui est inscrit).
    path: '/compte/inscription',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (!raw) return json({ error: 'Requête illisible.' }, 400)
      // champ piège rempli, ou envoi sans le formulaire / en moins de 3 s : un robot (réponse polie, rien n'est fait)
      const shownAt = Number(raw.shownAt)
      if (raw.website || !Number.isFinite(shownAt) || Date.now() - shownAt < 3000) return json({ ok: true })
      const settings = await req.payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
      if (settings?.members?.signupOpen === false) return json({ error: 'Les inscriptions sont momentanément fermées. Revenez bientôt !', code: 'closed' }, 403)
      const { data, errors } = checkSignup(raw)
      if (Object.keys(errors).length) return json({ errors }, 400)
      if (!allow('inscription', req.headers, 10 * rateFactor(), HOUR)) return tooMany('inscriptions')

      const payload = req.payload
      const existing = await findByEmail(payload, data.email)
      if (existing?.blocked) return json({ ok: true })
      if (existing?.verified) {
        await sendMemberEmail(payload, existing.email, alreadyRegisteredEmail(existing.firstName))
        return json({ ok: true })
      }
      const { token, hash } = newToken()
      const fields = {
        firstName: data.firstName,
        email: data.email,
        department: data.department,
        newsletter: data.newsletter,
        passwordHash: await hashPassword(data.password),
        verifyTokenHash: hash,
        verifyTokenExpires: new Date(Date.now() + VERIFY_MS).toISOString(),
        consentAt: new Date().toISOString(),
        verified: false,
      }
      try {
        // adresse inscrite mais jamais confirmée : la dernière inscription remplace la précédente (nouveau lien)
        if (existing) await update(payload, existing.id, fields)
        else await payload.create({ collection: 'members', data: fields, overrideAccess: true, depth: 0 })
      } catch (error) {
        payload.logger.error(`[swatter] Inscription impossible : ${error instanceof Error ? error.message : String(error)}`)
        return json({ error: 'L’inscription n’a pas abouti. Réessayez dans un instant.' }, 500)
      }
      const link = `${SITE_URL}/compte/verifier?token=${encodeURIComponent(token)}`
      await sendMemberEmail(payload, data.email, verifyEmail(data.firstName, token), link)
      return json({ ok: true })
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
      const m = email && password ? await findByEmail(payload, email) : null
      // vérification faite même sans compte : le temps de réponse ne révèle pas si l'adresse est inscrite
      const good = await verifyPassword(password, m?.passwordHash)
      if (!m) return json({ error: GENERIC_LOGIN }, 401)
      if (m.lockUntil && Date.parse(m.lockUntil) > Date.now()) {
        return json({ error: 'Trop d’essais : la connexion à ce compte est bloquée pendant 15 minutes. Vous pouvez aussi choisir un nouveau mot de passe.', code: 'locked' }, 429)
      }
      if (!good) {
        const attempts = (Number(m.loginAttempts) || 0) + 1
        await update(payload, m.id, attempts >= MAX_ATTEMPTS ? { loginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_MS).toISOString() } : { loginAttempts: attempts })
        return json({ error: GENERIC_LOGIN }, 401)
      }
      if (m.blocked) return json({ error: 'Ce compte a été suspendu. Écrivez-nous si vous pensez qu’il s’agit d’une erreur.', code: 'blocked' }, 403)
      if (!m.verified) {
        return json({ error: 'Confirmez d’abord votre adresse e-mail : cliquez sur le lien que nous vous avons envoyé.', code: 'unverified' }, 403)
      }
      await update(payload, m.id, { loginAttempts: 0, lockUntil: null, lastLoginAt: new Date().toISOString() })
      return json({ ok: true, firstName: m.firstName }, 200, sessionCookies(m))
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
        if (m) await update(req.payload, m.id, { sessionVersion: (Number(m.sessionVersion) || 0) + 1 })
      }
      return json({ ok: true }, 200, clearCookies())
    },
  },
  {
    path: '/compte/renvoyer-confirmation',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (!allow('renvoi', req.headers, 5 * rateFactor(), 15 * MINUTE)) return tooMany('demandes')
      const m = await findByEmail(req.payload, normalizeEmail(raw?.email))
      if (m && !m.verified && !m.blocked) {
        const { token, hash } = newToken()
        await update(req.payload, m.id, { verifyTokenHash: hash, verifyTokenExpires: new Date(Date.now() + VERIFY_MS).toISOString() })
        await sendMemberEmail(req.payload, m.email, verifyEmail(m.firstName, token), `${SITE_URL}/compte/verifier?token=${encodeURIComponent(token)}`)
      }
      return json({ ok: true })
    },
  },
  {
    path: '/compte/mot-de-passe-oublie',
    method: 'post',
    handler: async (req) => {
      if (!sameOrigin(req.headers, req.url)) return refused()
      const raw = await readBody(req)
      if (!allow('oubli', req.headers, 5 * rateFactor(), 15 * MINUTE)) return tooMany('demandes')
      const m = await findByEmail(req.payload, normalizeEmail(raw?.email))
      if (m && !m.blocked) {
        const { token, hash } = newToken()
        await update(req.payload, m.id, { resetTokenHash: hash, resetTokenExpires: new Date(Date.now() + RESET_MS).toISOString() })
        await sendMemberEmail(req.payload, m.email, resetEmail(m.firstName, token), `${SITE_URL}/compte/nouveau-mot-de-passe?token=${encodeURIComponent(token)}`)
      }
      // même réponse que l'adresse soit inscrite ou non
      return json({ ok: true })
    },
  },
  {
    // Nouveau mot de passe depuis le lien reçu : il confirme aussi l'adresse, ferme les autres sessions et connecte.
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
      const m = token
        ? (
            await payload.find({
              collection: 'members',
              where: { and: [{ resetTokenHash: { equals: hashToken(token) } }, { resetTokenExpires: { greater_than: new Date().toISOString() } }] },
              limit: 1,
              depth: 0,
              overrideAccess: true,
              showHiddenFields: true,
              pagination: false,
            })
          ).docs[0]
        : null
      if (!m) return json({ error: 'Ce lien n’est plus valable (il sert une seule fois, pendant une heure). Faites une nouvelle demande.', code: 'invalid' }, 400)
      if (m.blocked) return json({ error: 'Ce compte a été suspendu.', code: 'blocked' }, 403)
      const sessionVersion = (Number(m.sessionVersion) || 0) + 1
      await update(payload, m.id, {
        passwordHash: await hashPassword(raw?.password as string),
        resetTokenHash: null,
        resetTokenExpires: null,
        verified: true,
        verifyTokenHash: null,
        verifyTokenExpires: null,
        loginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date().toISOString(),
        sessionVersion,
      })
      // version calculée ici : la réponse de la mise à jour ne contient pas les champs techniques (masqués)
      return json({ ok: true, firstName: m.firstName }, 200, sessionCookies({ id: m.id, sessionVersion }))
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
      const updated = await update(req.payload, m.id, data)
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
      if (!(await verifyPassword(typeof raw?.current === 'string' ? raw.current : '', m.passwordHash))) {
        return json({ errors: { current: 'Mot de passe actuel incorrect.' } }, 400)
      }
      const sessionVersion = (Number(m.sessionVersion) || 0) + 1
      await update(req.payload, m.id, { passwordHash: await hashPassword(raw?.password as string), sessionVersion })
      return json({ ok: true }, 200, sessionCookies({ id: m.id, sessionVersion }))
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
      if (kind !== null || id !== null) {
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
        where: { and: [{ member: { equals: m.id } }, { kind: { equals: kind } }, { itemId: { equals: id } }] },
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
      const { totalDocs } = await req.payload.count({ collection: 'member-favorites', where: { member: { equals: m.id } }, overrideAccess: true })
      if (totalDocs >= 500) return json({ error: 'Votre liste est pleine (500 contenus) : retirez-en quelques-uns.' }, 409)
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
      await req.payload.delete({
        collection: 'member-favorites',
        where: { and: [{ member: { equals: m.id } }, { kind: { equals: kind } }, { itemId: { equals: id } }] },
        overrideAccess: true,
      })
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
      if (!(await verifyPassword(typeof raw?.password === 'string' ? raw.password : '', m.passwordHash))) {
        return json({ errors: { current: 'Mot de passe incorrect.' } }, 400)
      }
      await req.payload.delete({ collection: 'members', id: m.id, overrideAccess: true })
      return json({ ok: true }, 200, clearCookies())
    },
  },
  {
    // Pour l'équipe (administrateurs) : membres confirmés qui acceptent les e-mails, au format CSV (Excel, Brevo…)
    path: '/membres/lettre-info.csv',
    method: 'get',
    handler: async (req) => {
      const user = req.user as { role?: string; collection?: string } | null
      if (user?.collection !== 'users' || user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, 403)
      const res = await req.payload.find({
        collection: 'members',
        where: { and: [{ newsletter: { equals: true } }, { verified: { equals: true } }, { blocked: { not_equals: true } }] },
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
          [d.firstName, d.lastName ?? '', d.email, d.department ? departmentLabel(d.department) : '', d.createdAt.slice(0, 10)].map((v) => csv(String(v))).join(';'),
        ),
      ]
      return new Response(`﻿${lines.join('\r\n')}\r\n`, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="membres-lettre-info-${new Date().toISOString().slice(0, 10)}.csv"`,
          'cache-control': 'no-store',
        },
      })
    },
  },
]
