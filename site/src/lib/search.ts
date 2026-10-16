// CONTRACT (agent « recherche ») : recherche plein texte dans vidéos, replays, articles, événements, émissions.
import type { Payload } from 'payload'

export type SearchHit = {
  type: 'video' | 'replay' | 'article' | 'event' | 'program' | 'webcam'
  typeLabel: string
  title: string
  subtitle: string
  href: string
  image: string | null
}

export async function search(_payload: Payload, _q: string, _limit = 8): Promise<SearchHit[]> {
  return []
}
