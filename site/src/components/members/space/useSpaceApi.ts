'use client'
// « Mon espace » : appels à l'API /api/compte depuis une page de l'espace ; session expirée (401) → retour à la connexion.
import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { memberApi, type ApiResult } from '@/lib/members/browser'

export function useSpaceApi() {
  const router = useRouter()
  const pathname = usePathname()
  return useCallback(
    async function call<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
      const res = await memberApi<T>(path, init)
      // session expirée ou fermée depuis un autre appareil : connexion, puis retour sur cette page
      if (!res.ok && res.status === 401) router.replace(`/connexion?retour=${encodeURIComponent(pathname || '/compte')}`)
      return res
    },
    [router, pathname],
  )
}
