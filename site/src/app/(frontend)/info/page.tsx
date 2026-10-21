import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InfoListing, listingMetadata, loadListing, parsePage, type SearchParams } from '@/components/info/InfoListing'

export const revalidate = 60

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return listingMetadata(null, parsePage(await searchParams))
}

/** L'info de toute la région : article à la une, filtres par département et liste paginée (?page=). */
export default async function InfoPage({ searchParams }: { searchParams: SearchParams }) {
  const page = parsePage(await searchParams)
  const data = await loadListing(null, page)
  if (page > 1 && page > data.list.totalPages) notFound()
  return <InfoListing dept={null} page={page} data={data} />
}
