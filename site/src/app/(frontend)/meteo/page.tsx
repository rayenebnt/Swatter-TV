import { MeteoListing, meteoMetadata } from '@/components/meteo/MeteoListing'

// Page régénérée au plus toutes les 60 s (et après chaque import des prévisions).
export const revalidate = 60

export const metadata = meteoMetadata(null)

/** Page Météo de toute la région : prévisions détaillées (version large du widget) et présentation de la rubrique. */
export default function MeteoPage() {
  return <MeteoListing dept={null} />
}
