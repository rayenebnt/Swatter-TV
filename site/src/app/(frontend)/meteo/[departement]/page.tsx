import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MeteoListing, meteoMetadata } from '@/components/meteo/MeteoListing'
import { isDepartment } from '@/lib/departments'

// Page régénérée au plus toutes les 60 s (et après chaque import des prévisions).
export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache (un département inconnu : page introuvable). */
export function generateStaticParams() {
  return []
}

type Params = Promise<{ departement: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { departement } = await params
  if (!isDepartment(departement)) notFound()
  return meteoMetadata(departement)
}

/** Météo d'un département : prévisions détaillées de sa ville. */
export default async function DepartmentMeteoPage({ params }: { params: Params }) {
  const { departement } = await params
  if (!isDepartment(departement)) notFound()
  return <MeteoListing dept={departement} />
}
