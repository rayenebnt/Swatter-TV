import { AgendaSection } from '@/components/agenda/AgendaSection'
import { Hero } from '@/components/home/Hero'
import { Ticker } from '@/components/home/Ticker'
import { Une } from '@/components/home/Une'
import { InfoSection } from '@/components/info/InfoSection'
import { AdSlot } from '@/components/layout/AdSlot'
import { SocialBand } from '@/components/layout/SocialBand'
import { TvGridSection } from '@/components/programme/TvGridSection'
import { ReplaySection } from '@/components/video/ReplaySection'
import { Top10Section } from '@/components/video/Top10Section'
import { VideosSection } from '@/components/video/VideosSection'
import { WebcamsSection } from '@/components/webcams/WebcamsSection'

// Page régénérée au plus toutes les 60 s (et immédiatement après une modification dans l'administration).
export const revalidate = 60

export default function HomePage() {
  return (
    <>
      <Hero />
      <Ticker />
      <Une />
      <Top10Section />
      <div className="container">
        <AdSlot placement="home-leaderboard" />
      </div>
      <VideosSection />
      <InfoSection />
      <TvGridSection variant="home" />
      <AgendaSection />
      <WebcamsSection limit={4} />
      <ReplaySection />
      <SocialBand />
    </>
  )
}
