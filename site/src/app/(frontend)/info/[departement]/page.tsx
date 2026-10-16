import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InfoListing, listingMetadata, loadListing, parsePage, type SearchParams } from '@/components/info/InfoListing'
import { isDepartment } from '@/lib/departments'

export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache. */
export function generateStaticParams() {
  return []
}

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
