// Envois de fichiers (src/hooks/envois.ts) : gros envoi multipart réservé à l'équipe connectée, vérifié sur les en-têtes
// avant la lecture du corps ; ménage des fichiers temporaires oubliés ; délai de réception porté à 30 min (http-timeouts.cjs).
import { mkdtempSync, rmSync, utimesSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ANONYMOUS_UPLOAD_MAX_BYTES, purgeUploadTmp, refuseAnonymousUpload, UPLOAD_TMP_MAX_AGE_MS } from '@/hooks/envois'

const request = (headers: Record<string, string>, method = 'POST') => new Request('http://localhost/api/media', { method, headers })
const multipart = (length?: number) => ({ 'content-type': 'multipart/form-data; boundary=x', ...(length === undefined ? {} : { 'content-length': String(length) }) })
const nobody = vi.fn(async () => null)
const editor = async () => ({ collection: 'users' })
const member = async () => ({ collection: 'members' })

describe('gros envois : équipe connectée seulement', () => {
  it('petit envoi multipart (formulaire de connexion, de contact) : accepté sans compte, sans vérifier la connexion', async () => {
    nobody.mockClear()
    expect(await refuseAnonymousUpload(request(multipart(2_000)), nobody)).toBeNull()
    expect(await refuseAnonymousUpload(request(multipart(ANONYMOUS_UPLOAD_MAX_BYTES)), nobody)).toBeNull()
    expect(nobody).not.toHaveBeenCalled()
  })

  it('JSON, lecture, suppression : jamais concernés', async () => {
    expect(await refuseAnonymousUpload(request({ 'content-type': 'application/json', 'content-length': '900000000' }), nobody)).toBeNull()
    expect(await refuseAnonymousUpload(new Request('http://localhost/api/media', { method: 'GET' }), nobody)).toBeNull()
  })

  it('gros envoi ou taille inconnue sans compte de l’équipe (visiteur, membre, jeton illisible) : 401 avant la lecture du corps', async () => {
    for (const headers of [multipart(ANONYMOUS_UPLOAD_MAX_BYTES + 1), multipart(500 * 1024 * 1024), multipart(), multipart(0)]) {
      for (const user of [nobody, member, async () => Promise.reject(new Error('jeton illisible'))]) {
        const res = await refuseAnonymousUpload(request(headers, 'PATCH'), user)
        expect(res?.status, JSON.stringify(headers)).toBe(401)
        expect(((await res!.json()) as { errors: { message: string }[] }).errors[0].message).toMatch(/Connectez-vous/)
      }
    }
  })

  it('gros envoi d’une personne de l’équipe : accepté', async () => {
    expect(await refuseAnonymousUpload(request(multipart(400 * 1024 * 1024)), editor)).toBeNull()
    expect(await refuseAnonymousUpload(request(multipart(), 'PUT'), editor)).toBeNull()
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
    const server = http.createServer(() => {})
    expect(server.requestTimeout).toBe(30 * 60_000)
    expect(http.createServer({ keepAlive: true }, () => {}).requestTimeout).toBe(30 * 60_000)
  })
})
