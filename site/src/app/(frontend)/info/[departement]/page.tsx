import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InfoListing, listingMetadata, loadListing, parsePage, type SearchParams } from '@/components/info/InfoListing'
import { isDepartment } from '@/lib/departments'

// Page rendue à chaque requête, comme /info : elle lit la pagination (?page=), incompatible avec une page statique
// (generateStaticParams + searchParams provoque une erreur 500 DYNAMIC_SERVER_USAGE en production).
export const revalidate = 60

type Params = Promise<{ departement: string }>

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { departement } = await params
  if (!isDepartment(departement)) notFound()
  return listingMetadata(departement, parsePage(await searchParams))
}

/** L'info d'un département : article à la une, filtres et liste paginée (?page=). */
export default async function DepartmentInfoPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { departement } = await params
  if (!isDepartment(departement)) notFound()
  const page = parsePage(await searchParams)
  const data = await loadListing(departement, page)
  if (page > 1 && page > data.list.totalPages) notFound()
  return <InfoListing dept={departement} page={page} data={data} />
}
