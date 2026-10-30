// Envois de fichiers (src/hooks/envois.ts) : un fichier, ou un envoi multipart de plus de 1 Mo, exige une personne de
// l'équipe connectée (Payload écrirait sinon sur le disque un fichier jamais effacé) ; GraphQL refuse tout envoi
// multipart ; ménage des fichiers temporaires oubliés ; délai de réception porté à 30 min (http-timeouts.cjs).
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ANONYMOUS_UPLOAD_MAX_BYTES, guardUpload, hasFilePart, purgeUploadTmp, refuseGraphqlUpload, UPLOAD_TMP_MAX_AGE_MS } from '@/hooks/envois'

const BOUNDARY = '----swatter'
const TYPE = `multipart/form-data; boundary=${BOUNDARY}`
/** Corps multipart : champs texte (sans type, comme _payload de l'administration) et parties à en-têtes donnés. */
function body(fields: Record<string, string>, parts: string[][] = []) {
  const chunks = [
    ...Object.entries(fields).map(([name, value]) => `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
    ...parts.map((headers) => `--${BOUNDARY}\r\n${headers.join('\r\n')}\r\n\r\ncontenu du fichier\r\n`),
  ]
  return new TextEncoder().encode(`${chunks.join('')}--${BOUNDARY}--\r\n`)
}
const LOGIN = body({ _payload: JSON.stringify({ email: 'a@b.fr', password: 'Content-Type: x\r\nfilename="y"' }) })
const FILE = body({ _payload: '{}' }, [['Content-Disposition: form-data; name="file"; filename="clip.mp4"', 'Content-Type: video/mp4']])

const request = (headers: Record<string, string>, method = 'POST', content?: Uint8Array) =>
  new Request('http://localhost/api/users/login', { method, headers, body: content })
const multipart = (content?: Uint8Array, length = content?.length) => ({ 'content-type': TYPE, ...(length === undefined ? {} : { 'content-length': String(length) }) })
const nobody = vi.fn(async () => null)
const editor = async () => ({ collection: 'users' })
const member = async () => ({ collection: 'members' })
const isRefusal = async (checked: Request | Response) => {
  expect(checked).toBeInstanceOf(Response)
  const res = checked as Response
  expect(res.status).toBe(401)
  expect(((await res.json()) as { errors: { message: string }[] }).errors[0].message).toMatch(/Connectez-vous/)
}

describe('parties « fichier » d’un corps multipart', () => {
  it('nom de fichier ou type de partie (même sans nom, comme busboy) : fichier ; champs texte, même avec ces mots dans la valeur : non', () => {
    expect(hasFilePart(LOGIN, TYPE)).toBe(false)
    expect(hasFilePart(FILE, TYPE)).toBe(true)
    expect(hasFilePart(body({}, [['Content-Disposition: form-data; name="a"', 'content-type: application/octet-stream']]), TYPE)).toBe(true)
    expect(hasFilePart(body({}, [["Content-Disposition: form-data; name=\"a\"; FILENAME*=utf-8''x.bin"]]), TYPE)).toBe(true)
    expect(hasFilePart(FILE, `multipart/form-data; boundary="${BOUNDARY}"`)).toBe(true)
    // sans délimiteur lisible : prudence
    expect(hasFilePart(LOGIN, 'multipart/form-data')).toBe(true)
  })
})

describe('envois : fichiers réservés à l’équipe connectée', () => {
  it('formulaire de l’administration sans fichier (connexion, mot de passe oublié) : transmis sans vérifier la connexion, corps intact', async () => {
    nobody.mockClear()
    const checked = await guardUpload(request(multipart(LOGIN), 'POST', LOGIN), nobody)
    expect(checked).toBeInstanceOf(Request)
    expect(new Uint8Array(await (checked as Request).arrayBuffer())).toEqual(LOGIN)
    expect((checked as Request).headers.get('content-type')).toBe(TYPE)
    expect(nobody).not.toHaveBeenCalled()
  })

  it('JSON, lecture : jamais concernés (requête transmise telle quelle)', async () => {
    const json = request({ 'content-type': 'application/json', 'content-length': '900000000' })
    expect(await guardUpload(json, nobody)).toBe(json)
    const get = new Request('http://localhost/api/media', { method: 'GET' })
    expect(await guardUpload(get, nobody)).toBe(get)
  })

  it('petit envoi avec un fichier, sans compte de l’équipe (visiteur, membre, jeton illisible) : 401', async () => {
    for (const user of [nobody, member, async () => Promise.reject(new Error('jeton illisible'))]) {
      await isRefusal(await guardUpload(request(multipart(FILE), 'POST', FILE), user))
    }
  })

  it('gros envoi ou taille inconnue sans compte de l’équipe : 401 sur les en-têtes, corps jamais lu', async () => {
    for (const headers of [multipart(undefined, ANONYMOUS_UPLOAD_MAX_BYTES + 1), multipart(undefined, 500 * 1024 * 1024), multipart(), multipart(undefined, 0)]) {
      const req = request(headers, 'PATCH')
      await isRefusal(await guardUpload(req, nobody))
      expect(req.bodyUsed).toBe(false)
    }
  })

  it('personne de l’équipe : petit fichier transmis (corps relu), gros envoi transmis tel quel', async () => {
    const small = await guardUpload(request(multipart(FILE), 'POST', FILE), editor)
    expect(new Uint8Array(await (small as Request).arrayBuffer())).toEqual(FILE)
    const big = request(multipart(undefined, 400 * 1024 * 1024), 'PUT')
    expect(await guardUpload(big, editor)).toBe(big)
  })

  it('GraphQL : envoi multipart refusé (415), JSON transmis', async () => {
    expect(refuseGraphqlUpload(request(multipart(FILE), 'POST', FILE))?.status).toBe(415)
    expect(refuseGraphqlUpload(request({ 'content-type': 'application/json' }, 'POST', new TextEncoder().encode('{}')))).toBeNull()
  })
})

describe('fichiers temporaires oubliés', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'envois-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('supprimés après 2 h, pas ceux d’un envoi en cours ; dossier absent : rien à faire', async () => {
    const now = Date.now()
    const old = path.join(dir, 'tmp-1-ancien')
    const recent = path.join(dir, 'tmp-2-en-cours')
    writeFileSync(old, 'x')
    writeFileSync(recent, 'x')
    utimesSync(old, new Date(now - UPLOAD_TMP_MAX_AGE_MS - 60_000), new Date(now - UPLOAD_TMP_MAX_AGE_MS - 60_000))
    mkdirSync(path.join(dir, 'sous-dossier'))
    expect(await purgeUploadTmp(dir, UPLOAD_TMP_MAX_AGE_MS, now)).toBe(1)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(recent)).toBe(true)
    expect(await purgeUploadTmp(path.join(dir, 'absent'))).toBe(0)
  })
})

describe('délai de réception des requêtes', () => {
  it('http-timeouts.cjs porte requestTimeout de 5 à 30 minutes sur les serveurs créés ensuite', async () => {
    expect(http.createServer().requestTimeout).toBe(300_000)
    await import('../../../http-timeouts.cjs')
    expect(http.createServer(() => {}).requestTimeout).toBe(30 * 60_000)
    expect(http.createServer({ keepAlive: true }, () => {}).requestTimeout).toBe(30 * 60_000)
  })
})
