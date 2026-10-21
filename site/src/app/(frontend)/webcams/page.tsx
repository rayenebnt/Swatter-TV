import { WebcamsListing, webcamsMetadata } from '@/components/webcams/WebcamsListing'

export const revalidate = 60

export const metadata = webcamsMetadata(null)

/** Webcams de toute la région. */
export default function WebcamsPage() {
  return <WebcamsListing dept={null} />
}
