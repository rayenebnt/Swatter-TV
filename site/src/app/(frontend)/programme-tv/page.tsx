import type { Metadata } from 'next'
import { AdSlot } from '@/components/layout/AdSlot'
import { programmeDays, programmeDayUrl, dayLong, tvDay } from '@/components/programme/model'
import { ProgramList } from '@/components/programme/ProgramList'
import { TvGridSection } from '@/components/programme/TvGridSection'
import { DocumentTitle } from '@/components/ui/DocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { SITE_NAME } from '@/lib/site'
import { ogImage } from '@/lib/og'

export const revalidate = 60

const INTRO = 'La grille de Swatter TV Info heure par heure : journaux, météo, magazines, documentaires et divertissements, aujourd’hui et toute la semaine.'
/** Texte d'en-tête : la description, complétée d'une aide à la lecture de la grille */
const LEAD = `${INTRO} Choisissez un jour, puis touchez une émission pour lire son résumé et ses horaires.`
const SHARE_IMAGE = '/visuels/hero-crepuscule.webp'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** ?jour=AAAA-MM-JJ parmi les 7 jours proposés ; aujourd'hui (jour civil de Paris) sinon. */
async function resolveDay(searchParams: SearchParams): Promise<{ today: string; day: string }> {
  const raw = (await searchParams).jour
  const jour = Array.isArray(raw) ? raw[0] : raw
  const today = tvDay()
  return { today, day: jour && programmeDays(today).includes(jour) ? jour : today }
}

/** Titre de la page (sans le nom du site) : la semaine, ou le jour choisi. */
const dayTitle = (day: string, today: string) => (day === today ? 'Programme TV : aujourd’hui et toute la semaine' : `Programme TV du ${dayLong(day)}`)

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { today, day } = await resolveDay(searchParams)
  const isToday = day === today
  const title = dayTitle(day, today)
  const description = isToday ? INTRO : `Le programme de Swatter TV Info du ${dayLong(day)}, heure par heure : journaux, météo, magazines, documentaires et divertissements.`
  const url = programmeDayUrl(day, today)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url, title, description, images: [ogImage(null, SHARE_IMAGE)] },
  }
}

export default async function ProgrammeTvPage({ searchParams }: { searchParams: SearchParams }) {
  const { today, day } = await resolveDay(searchParams)
  return (
    <>
      <DocumentTitle title={dayTitle(day, today)} />
      <PageHeader eyebrow="Ce soir et cette semaine" title="Programme TV" description={LEAD} crumbs={[{ label: 'Programme TV' }]} />
      <TvGridSection variant="full" day={day} />
      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>
      <ProgramList day={day} today={today} />
    </>
  )
}
