// Réglage de la mesure d'audience (Accueil, direct et flash info › Mesure d'audience) par l'API REST : ID de mesure de
// Google Analytics nettoyé et vérifié (rien d'autre ne finit dans les pages), modifiable par les administrateurs
// seulement, lu par le site dans la version publiée.
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminToken, api, apiJson, editorToken, testPayload } from './helpers'

type Settings = { analytics?: { measurementId?: string | null } | null; tagline?: string | null }

let payload: Payload
let admin: string
let editor: string
let before: string | null = null

const publish = (token: string, body: Record<string, unknown>) => apiJson<{ result?: Settings; errors?: { message: string; data?: unknown }[] }>(
  '/globals/settings',
  { method: 'POST', token, body: { ...body, _status: 'published' } },
)
const published = async () => (await apiJson<Settings>('/globals/settings')).body

beforeAll(async () => {
  payload = await testPayload()
  admin = await adminToken()
  editor = await editorToken()
  before = ((await payload.findGlobal({ slug: 'settings', depth: 0 })) as Settings).analytics?.measurementId ?? null
})

afterAll(async () => {
  await payload.updateGlobal({ slug: 'settings', data: { analytics: { measurementId: before }, _status: 'published' } as never, context: { disableRevalidate: true } })
})

describe('mesure d’audience : ID de mesure de Google Analytics', () => {
  it('un administrateur enregistre l’ID : espaces retirés et majuscules, lu par le site dans la version publiée', async () => {
    const res = await publish(admin, { analytics: { measurementId: '  g-ab12cd34ef ' } })
    expect(res.status).toBe(200)
    expect((await published()).analytics?.measurementId).toBe('G-AB12CD34EF')
  })

  it('un identifiant qui n’est pas un ID de mesure GA4 est refusé, avec un message en français', async () => {
    await publish(admin, { analytics: { measurementId: 'G-AB12CD34EF' } })
    for (const wrong of ['UA-12345-1', 'GTM-AB12CD', 'G-AB12"><script>alert(1)</script>', 'G-AB12 CD34', 'https://analytics.google.com']) {
      const res = await publish(admin, { analytics: { measurementId: wrong } })
      expect(res.status, wrong).toBe(400)
      expect(JSON.stringify(res.body), wrong).toContain('ID de mesure')
    }
    expect((await published()).analytics?.measurementId).toBe('G-AB12CD34EF')
  })

  it('case vidée : plus de mesure d’audience', async () => {
    await publish(admin, { analytics: { measurementId: 'G-AB12CD34EF' } })
    expect((await publish(admin, { analytics: { measurementId: '' } })).status).toBe(200)
    expect((await published()).analytics?.measurementId ?? null).toBeFalsy()
  })

  it('un éditeur ne change pas l’ID (champ réservé aux administrateurs), mais ses autres modifications sont enregistrées', async () => {
    await publish(admin, { analytics: { measurementId: 'G-AB12CD34EF' } })
    const tagline = `Présentation de l’éditeur ${Date.now()}`
    const res = await publish(editor, { tagline, analytics: { measurementId: 'G-PIRATE1234' } })
    expect(res.status).toBe(200)
    const after = await published()
    expect(after.analytics?.measurementId).toBe('G-AB12CD34EF')
    expect(after.tagline).toBe(tagline)
  })

  it('visiteur : aucune écriture', async () => {
    expect((await api('/globals/settings', { method: 'POST', body: { analytics: { measurementId: 'G-VISITEUR12' } } })).status).toBe(403)
  })
})
