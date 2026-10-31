import type { Metadata } from 'next'
import { AdSlot } from '@/components/layout/AdSlot'
import { programmeDays, programmeDayUrl, dayLong, tvDay } from '@/components/programme/model'
import { ProgramList } from '@/components/programme/ProgramList'
import { TvGridSection } from '@/components/programme/TvGridSection'
import { DocumentTitle } from '@/components/ui/DocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { BROADCAST_HOURS_LABEL } from '@/lib/broadcast'
import { SITE_NAME } from '@/lib/site'
import { ogImage } from '@/lib/og'

export const revalidate = 60

/** Horaires d'antenne en toutes lettres (ceux de src/lib/broadcast.ts), espaces insécables : « 18 h à 0 h 30 » */
const HOURS = '18 h à 0 h 30'
const INTRO = `La grille de ${SITE_NAME}, tous les soirs de ${HOURS} : journaux, météo, magazines, documentaires et divertissements, ce soir et toute la semaine.`
/** Texte d'en-tête : la description, complétée d'une aide à la lecture de la grille */
const LEAD = `${INTRO} Choisissez une soirée, puis touchez une émission pour lire son résumé et ses horaires.`
const SHARE_IMAGE = '/visuels/hero-crepuscule.webp'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * ?jour=AAAA-MM-JJ parmi les 7 soirées proposées ; ce soir sinon (journée TV : la soirée en cours, de 0 h à 0 h 30
 * comprises, ou celle qui commence à 18 h).
 */
async function resolveDay(searchParams: SearchParams): Promise<{ today: string; day: string }> {
  const raw = (await searchParams).jour
  const jour = Array.isArray(raw) ? raw[0] : raw
  const today = tvDay()
  return { today, day: jour && programmeDays(today).includes(jour) ? jour : today }
}

/** Titre de la page (sans le nom du site) : la semaine, ou la soirée choisie. */
const dayTitle = (day: string, today: string) => (day === today ? 'Programme TV : ce soir et toute la semaine' : `Programme TV de la soirée du ${dayLong(day)}`)

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { today, day } = await resolveDay(searchParams)
  const isToday = day === today
  const title = dayTitle(day, today)
  const description = isToday
    ? INTRO
    : `Le programme de la soirée du ${dayLong(day)} sur ${SITE_NAME}, de ${HOURS} : journaux, météo, magazines, documentaires et divertissements.`
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
      <PageHeader eyebrow={`Tous les soirs, ${BROADCAST_HOURS_LABEL}`} title="Programme TV" description={LEAD} crumbs={[{ label: 'Programme TV' }]} />
      <TvGridSection variant="full" day={day} />
      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>
      <ProgramList day={day} today={today} />
    </>
  )
}
