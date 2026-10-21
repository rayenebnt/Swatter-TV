import { describe, expect, it } from 'vitest'
import { api, apiJson, adminToken, editorToken, testPayload } from './helpers'

describe('socle des tests d’intégration', () => {
  it('se connecte à la base de test, pas à la base de travail', async () => {
    const payload = await testPayload()
    expect(process.env.DATABASE_URI).toMatch(/_tests$/)
    const { totalDocs } = await payload.count({ collection: 'users' })
    expect(totalDocs).toBe(2)
  })

  it('l’API REST répond comme le site : public, éditeur, administrateur', async () => {
    expect((await api('/articles')).status).toBe(200)
    const editor = await editorToken()
    const admin = await adminToken()
    const me = await apiJson<{ user: { role: string } }>('/users/me', { token: editor })
    expect(me.body.user.role).toBe('editeur')
    expect((await apiJson<{ user: { role: string } }>('/users/me', { token: admin })).body.user.role).toBe('admin')
  })
})
