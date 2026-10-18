import { NextResponse, type NextRequest } from 'next/server'
import { currentMonday, rangeSearch } from '@/lib/schedule-week'

/**
 * Grille des programmes ouverte sans filtre (fil d'Ariane, adresse tapée, filtres vidés) : redirection immédiate vers la
 * semaine en cours, côté serveur, plutôt que de charger toute la grille puis de la filtrer dans le navigateur.
 */
export function proxy(request: NextRequest) {
  const { searchParams } = request.nextUrl
  if ([...searchParams.keys()].some((key) => key.startsWith('where')) || searchParams.has('search')) return NextResponse.next()
  const url = request.nextUrl.clone()
  for (const [key, value] of new URLSearchParams(rangeSearch(currentMonday(), 7))) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export const config = { matcher: '/admin/collections/schedule' }
