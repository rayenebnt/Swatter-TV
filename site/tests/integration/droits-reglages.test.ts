// Droits d’accès aux réglages (globals « settings », « meteo », « youtube ») par l’API REST et règles de leurs hooks :
// le public ne lit que la version publiée (jamais le brouillon, même avec ?draft=true), l’équipe enregistre et publie ;
// la météo garde les prévisions de la version en ligne et date le bulletin du jour (heure de Paris).
import config from '@payload-config'
import type { GlobalSlug, Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parisDay } from '@/lib/format'
import { SITE, api, apiJson, adminToken, editorToken, testPayload, unique } from './helpers'

type Doc = Record<string, unknown>

let payload: Payload
let editor: string
let admin: string
/** État de chaque global avant les tests, remis à la fin (la base est partagée par tous les fichiers de tests). */
const saved = new Map<GlobalSlug, Doc>()

const SLUGS: GlobalSlug[] = ['settings', 'meteo', 'youtube']

/**
 * Champs modifiés par ces tests, remis à vide s’ils n’existaient pas avant (base neuve : aucun réglage enregistré) ;
 * un global sans version en ligne au départ le redevient (statut « brouillon »).
 */
const TOUCHED: Record<GlobalSlug, Record<string, unknown>> = {
  settings: { tagline: null, _status: 'draft' },
  meteo: { bulletin: null, bulletinDay: null, forecast: null, autoUpdate: true, _status: 'draft' },
  youtube: { channel: null },
}

beforeAll(async () => {
  payload = await testPayload()
  editor = await editorToken()
  admin = await adminToken()
  for (const slug of SLUGS) saved.set(slug, (await payload.findGlobal({ slug, depth: 0 })) as unknown as Doc)
})

afterAll(async () => {
  for (const [slug, doc] of saved) {
    const { id: _id, globalType: _type, createdAt: _created, updatedAt: _updated, ...data } = doc
    await payload.updateGlobal({ slug, data: { ...TOUCHED[slug], ...data } as never, context: { disableRevalidate: true } }).catch(() => undefined)
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('réglages du site et météo : le public ne lit que la version publiée', () => {
  for (const [slug, field, label] of [
    ['settings', 'tagline', 'réglages (accueil, direct, flash info)'],
    ['meteo', 'bulletin', 'météo'],
  ] as const) {
    it(`${label} : version en ligne pour le public, jamais le brouillon (même avec ?draft=true)`, async () => {
      const online = unique('Texte publié')
      const draft = unique('Texte en brouillon')
      expect((await api(`/globals/${slug}`, { method: 'POST', token: editor, body: { [field]: online, _status: 'published' } })).status).toBe(200)
      expect((await api(`/globals/${slug}?draft=true`, { method: 'POST', token: editor, body: { [field]: draft } })).status).toBe(200)

      const pub = await apiJson<Doc>(`/globals/${slug}`)
      expect(pub.status).toBe(200)
      expect(pub.body[field]).toBe(online)
      const asDraft = await api(`/globals/${slug}?draft=true`)
      expect(asDraft.status).toBe(200)
      const text = await asDraft.text()
      expect(text).toContain(online)
      expect(text).not.toContain(draft)

      // l’équipe : la version en ligne, ou avec ?draft=true la dernière version
      for (const token of [editor, admin]) {
        expect((await apiJson<Doc>(`/globals/${slug}`, { token })).body[field]).toBe(online)
        expect((await apiJson<Doc>(`/globals/${slug}?draft=true`, { token })).body[field]).toBe(draft)
      }
    })

    it(`${label} : historique des versions et écritures réservés à l’équipe`, async () => {
      const before = (await payload.findGlobal({ slug, draft: true })) as unknown as Doc
      expect((await api(`/globals/${slug}/versions`)).status).toBe(403)
      const versions = await payload.findGlobalVersions({ slug, limit: 1 })
      if (versions.docs[0]) {
        expect((await api(`/globals/${slug}/versions/${versions.docs[0].id}`)).status).toBe(403)
        expect((await api(`/globals/${slug}/versions/${versions.docs[0].id}`, { method: 'POST' })).status).toBe(403)
      }
      const pirate = unique('Pirate')
      expect((await api(`/globals/${slug}`, { method: 'POST', body: { [field]: pirate, _status: 'published' } })).status).toBe(403)
      expect((await api(`/globals/${slug}?draft=true`, { method: 'POST', body: { [field]: pirate } })).status).toBe(403)
      expect(((await payload.findGlobal({ slug, draft: true })) as unknown as Doc)[field]).toBe(before[field])

      const team = await apiJson<{ totalDocs: number }>(`/globals/${slug}/versions`, { token: editor })
      expect(team.status).toBe(200)
      expect(team.body.totalDocs).toBeGreaterThan(0)
    })
  }

  it('réglages jamais publiés : le public n’en lit rien, même avec ?draft=true', async () => {
    // état d’une base neuve : une seule version, en brouillon (comme une fiche ouverte puis enregistrée automatiquement)
    const draft = unique('Réglages jamais publiés')
    const doc = (await payload.findGlobal({ slug: 'settings', depth: 0 })) as unknown as Doc
    const { id: _id, globalType: _type, createdAt: _c, updatedAt: _u, ...current } = doc
    await payload.updateGlobal({ slug: 'settings', data: { ...current, tagline: draft, _status: 'draft' } as never, context: { disableRevalidate: true } })
    try {
      for (const query of ['', '?draft=true']) {
        const res = await api(`/globals/settings${query}`)
        expect(res.status).toBe(200)
        expect(await res.text()).not.toContain(draft)
      }
      expect((await apiJson<Doc>('/globals/settings?draft=true', { token: editor })).body.tagline).toBe(draft)
    } finally {
      await payload.updateGlobal({ slug: 'settings', data: { ...current, _status: 'published' } as never, context: { disableRevalidate: true } })
    }
  })
})

describe('GraphQL : mêmes règles que l’API REST', () => {
  async function graphql(query: string, token?: string): Promise<{ data?: Record<string, Doc | null> | null; errors?: unknown[] }> {
    const { GRAPHQL_POST } = await import('@payloadcms/next/routes')
    const headers = new Headers({ 'content-type': 'application/json' })
    if (token) headers.set('authorization', `JWT ${token}`)
    const res = await GRAPHQL_POST(config)(new Request(`${SITE}/api/graphql`, { method: 'POST', headers, body: JSON.stringify({ query }) }))
    return res.json()
  }

  it('réglages et météo : version publiée pour le public, jamais le brouillon ; chaîne YouTube réservée à l’équipe', async () => {
    const tagline = unique('Présentation publiée')
    const bulletin = unique('Bulletin publié')
    await api('/globals/settings', { method: 'POST', token: editor, body: { tagline, _status: 'published' } })
    await api('/globals/meteo', { method: 'POST', token: editor, body: { bulletin, _status: 'published' } })
    const pending = unique('Brouillon')
    await api('/globals/settings?draft=true', { method: 'POST', token: editor, body: { tagline: pending } })
    await api('/globals/meteo?draft=true', { method: 'POST', token: editor, body: { bulletin: pending } })
    const spy = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)
    try {
      for (const draft of [false, true]) {
        const res = await graphql(`{ Setting(draft: ${draft}) { tagline } Meteo(draft: ${draft}) { bulletin } }`)
        expect(res.data?.Setting?.tagline).toBe(tagline)
        expect(res.data?.Meteo?.bulletin).toBe(bulletin)
        expect(JSON.stringify(res)).not.toContain(pending)
      }
      const team = await graphql('{ Setting(draft: true) { tagline } }', editor)
      expect(team.data?.Setting?.tagline).toBe(pending)
      const youtube = await graphql('{ Youtube { channel channelId lastError } }')
      expect(youtube.data?.Youtube ?? null).toBeNull()
      expect((await graphql('{ Youtube { channel } }', editor)).data?.Youtube).not.toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('météo : hooks du global', () => {
  const forecast = (label: string) => ({ source: 'tests', label, days: [{ date: '2031-01-10', min: -2, max: 4 }] })

  it('un enregistrement de l’équipe garde les prévisions de la version en ligne (import fait entre-temps)', async () => {
    // import automatique (sans compte de l’équipe) : publie de nouvelles prévisions
    await payload.updateGlobal({ slug: 'meteo', data: { forecast: forecast('import 1'), _status: 'published' }, context: { disableRevalidate: true } })
    // fiche ouverte avant l’import, enregistrée après : ses prévisions sont périmées
    const stale = { bulletin: unique('Bulletin'), forecast: forecast('formulaire périmé'), _status: 'published' }
    const res = await api('/globals/meteo', { method: 'POST', token: editor, body: stale })
    expect(res.status).toBe(200)
    expect((await payload.findGlobal({ slug: 'meteo' })).forecast).toEqual(forecast('import 1'))

    await payload.updateGlobal({ slug: 'meteo', data: { forecast: forecast('import 2'), _status: 'published' }, context: { disableRevalidate: true } })
    expect((await payload.findGlobal({ slug: 'meteo' })).forecast).toEqual(forecast('import 2'))
    // brouillon de l’équipe : prévisions de la version en ligne, elles aussi
    const draft = { bulletin: unique('Brouillon'), forecast: forecast('import 1') }
    expect((await api('/globals/meteo?draft=true', { method: 'POST', token: editor, body: draft })).status).toBe(200)
    expect((await payload.findGlobal({ slug: 'meteo', draft: true })).forecast).toEqual(forecast('import 2'))
    expect((await payload.findGlobal({ slug: 'meteo' })).forecast).toEqual(forecast('import 2'))
  })

  it('bulletin du jour : daté du jour de Paris quand il change, gardé tel quel sinon, effacé avec le texte', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const save = async (iso: string, data: Record<string, unknown>) => {
      vi.setSystemTime(new Date(iso))
      return payload.updateGlobal({ slug: 'meteo', data: { ...data, _status: 'published' }, context: { disableRevalidate: true } })
    }
    // 23 h 30 UTC le 10 janvier : déjà le 11 à Paris
    expect((await save('2031-01-10T23:30:00.000Z', { bulletin: 'Neige en montagne' })).bulletinDay).toBe('2031-01-11')
    expect(parisDay()).toBe('2031-01-11')
    // le lendemain, autre réglage modifié : le bulletin garde son jour (il ne s’affiche plus)
    expect((await save('2031-01-12T09:00:00.000Z', { bulletin: 'Neige en montagne', autoUpdate: true })).bulletinDay).toBe('2031-01-11')
    expect((await save('2031-01-12T09:05:00.000Z', { autoUpdate: true })).bulletinDay).toBe('2031-01-11')
    // nouveau texte : nouveau jour
    expect((await save('2031-01-12T09:10:00.000Z', { bulletin: 'Grand soleil' })).bulletinDay).toBe('2031-01-12')
    // texte effacé : plus de jour
    expect((await save('2031-01-12T09:15:00.000Z', { bulletin: '  ' })).bulletinDay ?? null).toBeNull()
  })
})

describe('chaîne YouTube : réglage interne de l’équipe', () => {
  it('ni lecture ni écriture pour le public', async () => {
    expect((await api('/globals/youtube')).status).toBe(403)
    expect((await api('/globals/youtube?draft=true')).status).toBe(403)
    expect((await api('/globals/youtube', { method: 'POST', body: { channel: 'https://www.youtube.com/@pirate' } })).status).toBe(403)
    expect((await payload.findGlobal({ slug: 'youtube' })).channel).not.toBe('https://www.youtube.com/@pirate')
  })

  it('l’équipe lit et enregistre l’adresse de la chaîne ; une adresse qui n’est pas celle d’une chaîne est refusée', async () => {
    for (const token of [editor, admin]) {
      expect((await api('/globals/youtube', { token })).status).toBe(200)
      const channel = `https://www.youtube.com/@${unique('swattertv')}`
      const res = await api('/globals/youtube', { method: 'POST', token, body: { channel } })
      expect(res.status).toBe(200)
      expect((await payload.findGlobal({ slug: 'youtube' })).channel).toBe(channel)
    }
    const before = (await payload.findGlobal({ slug: 'youtube' })).channel
    const refused = await apiJson<{ errors: { data?: { errors?: { message: string }[] } }[] }>('/globals/youtube', {
      method: 'POST',
      token: editor,
      body: { channel: 'https://www.dailymotion.com/swattertv' },
    })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body)).toContain('Collez l’adresse de la chaîne')
    expect((await payload.findGlobal({ slug: 'youtube' })).channel).toBe(before)
  })
})
