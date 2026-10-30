import Link from 'next/link'
import { infoZoneLabel } from '@/lib/departments'
import { getFlashArticles } from '@/lib/queries/home'
import { getSettings } from '@/lib/queries/settings'
import { articleUrl } from '@/lib/urls'
import { TickerClock, TickerFrame } from './TickerClient'
import '@/styles/hero.css'

type FlashItem = { key: string; label: string; text: string; href: string | null }

// Vitesse de défilement de la maquette : 75 s pour 6 messages
const SECONDS_PER_ITEM = 12.5
// Avec peu de messages, ils sont répétés pour que la boucle remplisse toujours la largeur du bandeau
const MIN_LOOP_ITEMS = 6

function Message({ item, copy }: { item: FlashItem; copy: boolean }) {
  const content = (
    <>
      <b>{item.label}</b>
      <span>{item.text}</span>
    </>
  )
  if (!item.href) return <span className="ticker__msg">{content}</span>
  // La copie (boucle du défilement) est masquée aux lecteurs d'écran et hors de l'ordre de tabulation
  const tab = copy ? -1 : undefined
  return item.href.startsWith('/') && !item.href.startsWith('//') ? (
    <Link className="ticker__msg" href={item.href} tabIndex={tab} prefetch={false}>
      {content}
    </Link>
  ) : (
    <a className="ticker__msg" href={item.href} tabIndex={tab} rel="noopener">
      {content}
    </a>
  )
}

/**
 * Bandeau « Flash info » : messages saisis dans les réglages, complétés (option flashAuto) par les 6 derniers articles.
 * Défilement continu en CSS sur une liste dupliquée ; défilement manuel si l'utilisateur préfère réduire les animations.
 */
export async function Ticker() {
  const settings = await getSettings()
  const manual: FlashItem[] = (settings?.flashItems ?? [])
    .filter((f) => f.label?.trim() && f.text?.trim())
    .map((f, i) => ({ key: f.id || `flash-${i}`, label: f.label.trim(), text: f.text.trim(), href: f.href?.trim() || null }))

  const auto: FlashItem[] =
    settings?.flashAuto === false
      ? []
      : (await getFlashArticles(6)).map((a) => ({
          key: `article-${a.id}`,
          label: a.city || a.kicker || infoZoneLabel(a.department),
          text: a.title,
          href: articleUrl(a),
        }))

  // Un article déjà présent parmi les messages saisis n'est pas répété
  const known = new Set(manual.map((m) => m.href).filter(Boolean))
  const items = [...manual, ...auto.filter((a) => !known.has(a.href))]
  if (!items.length) return null

  // Boucle : messages (éventuellement répétés), rendue deux fois ; seuls les premiers sont lus par les lecteurs d'écran
  const repeat = Math.ceil(MIN_LOOP_ITEMS / items.length)
  const loop = Array.from({ length: repeat * 2 }, (_, r) => items.map((item) => ({ item, r }))).flat()

  return (
    <TickerFrame duration={repeat * items.length * SECONDS_PER_ITEM}>
      <div className="container ticker__in" data-preview="flash">
        <span className="badge badge--gold">Flash info</span>
        <TickerClock />
        <div className="ticker__track" role="marquee" aria-label="Messages du flash info" tabIndex={0}>
          <ul className="ticker__list">
            {loop.map(({ item, r }) => (
              <li key={`${item.key}-${r}`} aria-hidden={r > 0 || undefined}>
                <Message item={item} copy={r > 0} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TickerFrame>
  )
}
