import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WebcamsListing, webcamsMetadata } from '@/components/webcams/WebcamsListing'
import { isWebcamZone } from '@/lib/departments'

export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache (un département inconnu : page introuvable). « plus » : Web Cams +. */
export function generateStaticParams() {
  return []
}

type Params = Promise<{ departement: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { departement } = await params
  if (!isWebcamZone(departement)) notFound()
  return webcamsMetadata(departement)
}

/** Webcams d'un département, ou hors région (/webcams/plus). */
export default async function DepartmentWebcamsPage({ params }: { params: Params }) {
  const { departement } = await params
  if (!isWebcamZone(departement)) notFound()
  return <WebcamsListing zone={departement} />
}
