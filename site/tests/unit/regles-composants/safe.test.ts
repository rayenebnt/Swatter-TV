// Requêtes protégées (src/lib/safe.ts) : une section en échec disparaît sans casser la page, sauf panne de la base
// (relancée pour que Next garde la page en cache), sauf pendant `next build` et pour la mise en page commune.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { safe } from '@/lib/safe'

let errors: MockInstance<typeof console.error>

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errors.mockRestore()
  vi.unstubAllEnvs()
})

const failing = (error: unknown) => async () => {
  throw error
}
const withCode = (code: string, message = `connect ${code} 127.0.0.1:5432`) => Object.assign(new Error(message), { code })

describe('requête réussie ou en échec ordinaire', () => {
  it('renvoie le résultat de la requête', async () => {
    expect(await safe(async () => [1, 2], [], 'liste')).toEqual([1, 2])
    expect(await safe(async () => null, 'repli')).toBeNull()
  })

  it('erreur ordinaire : valeur de repli et message « [swatter] Échec <libellé> » dans le journal', async () => {
    const fallback = { docs: [] }
    expect(await safe(failing(new Error('champ inconnu')), fallback, 'vidéos du jour')).toBe(fallback)
    expect(errors).toHaveBeenCalledWith('[swatter] Échec vidéos du jour :', 'champ inconnu')
  })

  it('libellé par défaut « requête » ; valeur lancée qui n’est pas une Error écrite telle quelle', async () => {
    expect(await safe(failing('texte'), 0)).toBe(0)
    expect(errors).toHaveBeenCalledWith('[swatter] Échec requête :', 'texte')
    expect(await safe(failing(null), 'repli')).toBe('repli')
    expect(await safe(failing(undefined), 'repli')).toBe('repli')
  })

  it('erreur levée avant toute promesse (fonction non asynchrone) : même traitement', async () => {
    const sync = (() => {
      throw new Error('immédiate')
    }) as unknown as () => Promise<number>
    expect(await safe(sync, 7)).toBe(7)
  })

  it('erreur PostgreSQL qui n’est pas une panne (colonne absente, contrainte) : repli', async () => {
    expect(await safe(failing(withCode('42703', 'column "x" does not exist')), 'repli')).toBe('repli')
    expect(await safe(failing(withCode('23505', 'duplicate key value')), 'repli')).toBe('repli')
  })
})

describe('panne de la base : relancée (Next garde la dernière version de la page en cache)', () => {
  it('codes réseau et PostgreSQL d’indisponibilité', async () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P02', '57P03', '53300']) {
      const error = withCode(code)
      await expect(safe(failing(error), 'repli'), code).rejects.toBe(error)
    }
    expect(errors).not.toHaveBeenCalled()
  })

  it('messages de connexion coupée ou impossible (sans code), quelle que soit la casse', async () => {
    const messages = [
      'Connection terminated unexpectedly',
      'Connection terminated due to connection timeout',
      'terminating connection due to administrator command',
      'sorry, too many clients already',
      'connect econnrefused 127.0.0.1:5432',
      'getaddrinfo ENOTFOUND db',
    ]
    for (const message of messages) await expect(safe(failing(new Error(message)), 'repli'), message).rejects.toThrow(message)
  })

  it('panne enveloppée par Payload ou drizzle (cause, cause de la cause)', async () => {
    const pg = withCode('ECONNREFUSED')
    const drizzle = Object.assign(new Error('Failed query: select …'), { cause: pg })
    const payload = Object.assign(new Error('Erreur Payload'), { cause: drizzle })
    await expect(safe(failing(payload), 'repli')).rejects.toBe(payload)
  })

  it('connexion refusée sur toutes les adresses de l’hôte (AggregateError de Node, message vide)', async () => {
    const aggregate = Object.assign(new AggregateError([withCode('ECONNREFUSED'), withCode('ECONNREFUSED')], ''), { code: 'ECONNREFUSED' })
    await expect(safe(failing(aggregate), 'repli')).rejects.toBe(aggregate)
  })

  it('serveur de base injoignable sur le réseau (hôte ou réseau inaccessible) : c’est aussi une panne', async () => {
    for (const code of ['EHOSTUNREACH', 'ENETUNREACH']) {
      const error = withCode(code)
      await expect(safe(failing(error), 'repli'), code).rejects.toBe(error)
    }
  })

  it('mise en page commune (outage: « fallback ») : repli au lieu de relancer, et trace dans le journal', async () => {
    const error = withCode('ECONNREFUSED')
    expect(await safe(failing(error), { name: 'Swatter TV' }, 'réglages', { outage: 'fallback' })).toEqual({ name: 'Swatter TV' })
    expect(errors).toHaveBeenCalledWith('[swatter] Échec réglages :', error.message)
    // option explicite « throw » : comportement par défaut
    await expect(safe(failing(error), null, 'x', { outage: 'throw' })).rejects.toBe(error)
  })
})

describe('pendant next build (sans base, par exemple dans Docker)', () => {
  it('toujours la valeur de repli, même pour une panne de la base', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    expect(await safe(failing(withCode('ECONNREFUSED')), 'repli')).toBe('repli')
    expect(await safe(failing(new Error('autre')), 'repli')).toBe('repli')
    expect(await safe(async () => 'données', 'repli')).toBe('données')
  })

  it('autres phases de Next (serveur de production, développement) : la panne est relancée', async () => {
    for (const phase of ['phase-production-server', 'phase-development-server']) {
      vi.stubEnv('NEXT_PHASE', phase)
      await expect(safe(failing(withCode('ECONNREFUSED')), 'repli')).rejects.toThrow()
    }
  })
})
