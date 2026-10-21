import type { AdminViewServerProps } from 'payload'
import { Gutter, Link } from '@payloadcms/ui'
import { dayLabel, tvDay } from '@/components/programme/model'
import { formatDayLong, formatTime, timeAgo } from '@/lib/format'
import { KIND_LABELS } from '@/lib/members/shared'
import { rangeSearch } from '@/lib/schedule-week'
import { getDashboardData, type Featured, type MembersStats, type RecentCollection } from './dashboard-data'
import { scheduleSearch } from './menu'
import { AdminIcon, type IconName } from './icons'

type Tone = 'ok' | 'warn' | 'off'

const TYPE_LABELS: Record<RecentCollection, string> = { videos: 'Vidéo', articles: 'Info', events: 'Agenda', replays: 'Replay' }

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
/** Rapports de Google Analytics (le compte Google de la chaîne y choisit la propriété « Swatter TV »). */
const ANALYTICS_URL = 'https://analytics.google.com/analytics/web/'
/** Ligne d'état dont la requête a échoué : ni « tout va bien » ni « rien à faire » par défaut. */
const UNAVAILABLE = 'Information indisponible pour le moment : rechargez la page dans un instant'

/** « 128 membres, dont 6 inscrits ces 7 derniers jours · Inscriptions fermées » (comptes suspendus non comptés) */
function membersValue(m: MembersStats): string {
  const active = m.active
    ? `${plural(m.active, 'membre', 'membres')}${m.newThisWeek ? `, dont ${plural(m.newThisWeek, 'inscrit', 'inscrits')} ces 7 derniers jours` : ''}`
    : 'Aucun membre actif pour l’instant'
  return [active, m.signupOpen ? null : 'Inscriptions fermées'].filter(Boolean).join(' · ')
}

/**
 * Tableau de bord de l'administration (admin.components.views.dashboard) : les actions courantes en gros boutons,
 * ce qui est affiché sur le site en ce moment (avec les oublis à corriger), les derniers contenus modifiés et, dès qu'un
 * visiteur a créé un compte, les contenus les plus regardés par les membres (chiffres des comptes : administrateurs seuls).
 */
export async function Dashboard({ payload, user }: AdminViewServerProps) {
  const admin = payload.config.routes.admin
  const collection = (slug: string) => `${admin}/collections/${slug}`
  const edit = (slug: string, id: number) => `${collection(slug)}/${id}`
  const global = (slug: string) => `${admin}/globals/${slug}`
  const data = await getDashboardData(payload)
  // les membres du site (données personnelles) ne sont visibles que des administrateurs
  const isAdmin = (user as { role?: string } | undefined)?.role === 'admin'

  const now = new Date()
  const firstName = String((user as { name?: string | null } | undefined)?.name ?? '').trim().split(/\s+/)[0]
  const hour = Number(formatTime(now).slice(0, 2))
  const greeting = `${hour >= 18 ? 'Bonsoir' : 'Bonjour'}${firstName ? ` ${firstName}` : ''}`
  const todayLabel = formatDayLong(now)
  const today = tvDay(now)

  // dans l'ordre du menu du site (L'Info, Agenda, Le Replay, Vidéos…), comme le menu de l'administration
  const publish: { href: string; icon: IconName; title: string; text: string }[] = [
    { href: `${collection('articles')}/create`, icon: 'article', title: 'Écrire une info', text: 'Un article pour L’Info' },
    { href: `${collection('events')}/create`, icon: 'event', title: 'Ajouter une sortie', text: 'Un événement dans l’agenda' },
    { href: `${collection('replays')}/create`, icon: 'replay', title: 'Mettre un replay en ligne', text: 'Une émission à revoir' },
    { href: `${collection('videos')}/create`, icon: 'video', title: 'Publier une vidéo', text: 'Un lien YouTube suffit' },
  ]
  const manage: { href: string; icon: IconName; title: string; text: string }[] = [
    { href: global('settings'), icon: 'home', title: 'Accueil et direct', text: 'Carrousel, direct, flash info' },
    { href: global('meteo'), icon: 'weather', title: 'La Météo', text: 'Le bulletin du jour' },
    { href: `${collection('schedule')}${scheduleSearch()}`, icon: 'grid', title: 'Programme TV', text: 'La grille de la semaine' },
    { href: collection('webcams'), icon: 'webcam', title: 'Webcams', text: 'Les vues en direct' },
    { href: collection('ads'), icon: 'ad', title: 'Publicités', text: 'Les bannières des annonceurs' },
    { href: collection('media'), icon: 'media', title: 'Médiathèque', text: 'Toutes les images et vidéos' },
  ]

  const featuredValue = (item: Featured, none: string, fallbackHint: string) =>
    !item ? none : item.picked ? `« ${item.title} »` : `Aucune case cochée : le site affiche ${fallbackHint} (« ${item.title} »)`

  const meteoAgeHours = data.meteo.updatedAt ? (now.getTime() - new Date(data.meteo.updatedAt).getTime()) / 3_600_000 : null
  const meteoLate = data.meteo.auto && (meteoAgeHours === null || meteoAgeHours > 3)

  return (
    <Gutter className="sw-dash">
      <header className="sw-dash__head">
        <div>
          <p className="sw-dash__date">{todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}</p>
          <h1 className="sw-dash__title">{greeting}</h1>
          <p className="sw-dash__lead">Que souhaitez-vous faire aujourd’hui ?</p>
        </div>
        <div className="sw-dash__links">
          <a className="sw-btn" href="/" target="_blank" rel="noopener noreferrer">
            <AdminIcon name="external" />
            Voir le site
          </a>
          <Link prefetch={false} className="sw-btn" href={`${admin}/aide`}>
            <AdminIcon name="help" />
            Aide
          </Link>
        </div>
      </header>

      <section aria-labelledby="sw-dash-publish">
        <h2 className="sw-dash__h2" id="sw-dash-publish">
          Publier
        </h2>
        <ul className="sw-dash__actions">
          {publish.map((a) => (
            <li key={a.href}>
              <Link prefetch={false} className="sw-action" href={a.href}>
                <span className="sw-action__icon">
                  <AdminIcon name={a.icon} />
                </span>
                <span className="sw-action__text">
                  <strong>{a.title}</strong>
                  <span>{a.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sw-dash-manage">
        <h2 className="sw-dash__h2" id="sw-dash-manage">
          Gérer le site
        </h2>
        <ul className="sw-dash__tiles">
          {manage.map((t) => (
            <li key={t.href}>
              <Link prefetch={false} className="sw-tile" href={t.href}>
                <AdminIcon name={t.icon} className="sw-tile__icon" />
                <span className="sw-tile__text">
                  <strong>{t.title}</strong>
                  <span>{t.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="sw-dash__cols">
        <section className="sw-panel" aria-labelledby="sw-dash-now">
          <h2 className="sw-dash__h2" id="sw-dash-now">
            Sur le site en ce moment
          </h2>
          <ul className="sw-status">
            <StatusRow
              icon="flash"
              label="Flash info"
              tone={data.flash.messages || data.flash.auto ? 'ok' : 'off'}
              value={
                data.flash.messages
                  ? `${data.flash.messages} message${data.flash.messages > 1 ? 's' : ''}${data.flash.auto ? ', complétés par les derniers articles' : ''}`
                  : data.flash.auto
                    ? 'Les derniers articles défilent automatiquement'
                    : 'Aucun message : le bandeau est masqué'
              }
              href={global('settings')}
            />
            <StatusRow
              icon="live"
              label="Le direct"
              tone={data.live.enabled && data.live.configured ? 'ok' : data.live.enabled ? 'warn' : 'off'}
              value={
                data.live.enabled && data.live.configured
                  ? 'Activé'
                  : data.live.enabled
                    ? 'Activé, mais aucun flux vidéo n’est renseigné'
                    : 'Désactivé : la page « Direct » affiche « Le direct reprend bientôt »'
              }
              href={global('settings')}
            />
            <StatusRow
              icon="article"
              label="Info du jour"
              tone={data.infoOfDay?.picked ? 'ok' : 'warn'}
              value={featuredValue(data.infoOfDay, 'Aucun article publié', 'le dernier article publié')}
              href={data.infoOfDay?.picked ? edit('articles', data.infoOfDay.id) : collection('articles')}
            />
            <StatusRow
              icon="weather"
              label="Météo"
              tone={!data.meteo.auto ? 'off' : meteoLate ? 'warn' : 'ok'}
              value={
                !data.meteo.auto
                  ? 'Mise à jour automatique désactivée'
                  : meteoLate
                    ? data.meteo.updatedAt
                      ? `Pas de mise à jour depuis ${timeAgo(data.meteo.updatedAt, now).toLowerCase().replace(/^il y a /, '')} : si cela dure, prévenez votre webmaster`
                      : 'Prévisions pas encore importées'
                    : `Mise à jour automatique (${timeAgo(data.meteo.updatedAt!, now).toLowerCase()})`
              }
              href={global('meteo')}
            />
            <StatusRow
              icon="event"
              label="Sortie du week-end"
              tone={data.weekendPick?.picked ? 'ok' : 'warn'}
              value={featuredValue(data.weekendPick, 'Aucun événement à venir dans l’agenda', 'le prochain événement')}
              href={data.weekendPick?.picked ? edit('events', data.weekendPick.id) : collection('events')}
            />
            <StatusRow
              icon="grid"
              label="Programme TV"
              tone={data.emptyDays === null || data.emptyDays.length ? 'warn' : 'ok'}
              value={
                data.emptyDays === null
                  ? UNAVAILABLE
                  : data.emptyDays.length === 0
                    ? 'Rempli pour les 7 prochains jours'
                    : data.emptyDays.length === 7
                      ? 'Aucune émission prévue pour les 7 prochains jours'
                      : `Rien de prévu : ${data.emptyDays.map((d) => dayLabel(d, today).toLowerCase()).join(', ')}`
              }
              href={data.emptyDays?.length && data.emptyDays.length < 7 ? `${collection('schedule')}${rangeSearch(data.emptyDays[0], 1)}` : collection('schedule')}
            />
            <StatusRow
              icon="star"
              label="Vidéo du jour"
              tone={data.videoOfDay?.picked ? 'ok' : 'warn'}
              value={featuredValue(data.videoOfDay, 'Aucune vidéo publiée', 'la dernière vidéo publiée')}
              href={data.videoOfDay?.picked ? edit('videos', data.videoOfDay.id) : collection('videos')}
            />
            {data.missingImages.videos + data.missingImages.replays > 0 && (
              <StatusRow
                icon="media"
                label="Images manquantes"
                tone="warn"
                value={`${[
                  data.missingImages.videos ? plural(data.missingImages.videos, 'vidéo', 'vidéos') : null,
                  data.missingImages.replays ? plural(data.missingImages.replays, 'replay', 'replays') : null,
                ]
                  .filter(Boolean)
                  .join(' et ')} sans image (YouTube était peut-être injoignable) : enregistrez à nouveau ${
                  data.missingImages.videos + data.missingImages.replays > 1 ? 'les fiches' : 'la fiche'
                } ou ajoutez une image`}
                href={`${collection(data.missingImages.videos ? 'videos' : 'replays')}?${new URLSearchParams({ 'where[or][0][and][0][thumbnail][exists]': 'false' })}`}
              />
            )}
            <StatusRow
              icon="ad"
              label="Publicités"
              tone={data.ads === null ? 'warn' : data.ads ? 'ok' : 'off'}
              value={data.ads === null ? UNAVAILABLE : data.ads ? `${data.ads} campagne${data.ads > 1 ? 's' : ''} en cours` : 'Aucune campagne en cours'}
              href={collection('ads')}
            />
            <StatusRow
              icon="mail"
              label="Messages reçus"
              tone={data.messages === null || data.messages ? 'warn' : 'ok'}
              value={
                data.messages === null ? UNAVAILABLE : data.messages ? `${data.messages} message${data.messages > 1 ? 's' : ''} à traiter` : 'Aucun message en attente'
              }
              href={collection('messages')}
            />
            <StatusRow
              icon="chart"
              label="Mesure d’audience"
              tone={data.analyticsId ? 'ok' : 'off'}
              value={
                data.analyticsId
                  ? `Google Analytics actif (${data.analyticsId}) : visiteurs qui ont accepté la mesure d’audience`
                  : 'Aucun ID de mesure : la fréquentation du site n’est pas mesurée (guide, partie 22)'
              }
              href={global('settings')}
              external={data.analyticsId ? { href: ANALYTICS_URL, label: 'Voir les statistiques' } : undefined}
            />
            {isAdmin && data.members && (
              <StatusRow
                icon="member"
                label="Membres du site"
                tone={data.members.signupOpen ? 'ok' : 'off'}
                value={membersValue(data.members)}
                href={collection('members')}
              />
            )}
          </ul>
        </section>

        {/* colonne de droite : les blocs s'empilent */}
        <div className="sw-dash__side">
          <section className="sw-panel" aria-labelledby="sw-dash-recent">
            <h2 className="sw-dash__h2" id="sw-dash-recent">
              Derniers contenus modifiés
            </h2>
            {data.recent.length ? (
              <ul className="sw-recent">
                {data.recent.map((item) => (
                  <li key={`${item.collection}-${item.id}`}>
                    <Link prefetch={false} className="sw-recent__link" href={edit(item.collection, item.id)}>
                      <span className={`sw-chip sw-chip--${item.collection}`}>{TYPE_LABELS[item.collection]}</span>
                      <span className="sw-recent__title">
                        {item.title}
                        {item.draft && <span className="sw-draft">À publier</span>}
                      </span>
                      <span className="sw-recent__when">{timeAgo(item.updatedAt, now)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sw-panel__empty">Rien pour l’instant : vos prochaines publications apparaîtront ici.</p>
            )}
          </section>

          {data.members && (
            <section className="sw-panel" aria-labelledby="sw-dash-watched">
              <h2 className="sw-dash__h2" id="sw-dash-watched">
                Les plus regardées par les membres (7 derniers jours)
              </h2>
              {data.members.topWatched.length ? (
                <ul className="sw-recent">
                  {data.members.topWatched.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <a className="sw-recent__link" href={item.href} target="_blank" rel="noopener noreferrer">
                        <span className={`sw-chip sw-chip--${item.kind === 'video' ? 'videos' : 'replays'}`}>{KIND_LABELS[item.kind]}</span>
                        <span className="sw-recent__title">{item.title}</span>
                        <span className="sw-recent__when">{plural(item.members, 'membre', 'membres')}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sw-panel__empty">Aucune vidéo regardée par les membres connectés ces 7 derniers jours.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </Gutter>
  )
}

type StatusRowProps = {
  icon: IconName
  label: string
  value: string
  tone: Tone
  href: string
  /** lien vers un autre site, sous le texte (ouvert dans un nouvel onglet) */
  external?: { href: string; label: string }
}

function StatusRow({ icon, label, value, tone, href, external }: StatusRowProps) {
  const toneLabel = tone === 'ok' ? 'En place' : tone === 'warn' ? 'À vérifier' : 'Inactif'
  return (
    <li className={`sw-status__row sw-status__row--${tone}`}>
      <span className="sw-status__icon">
        <AdminIcon name={icon} />
      </span>
      <span className="sw-status__text">
        <strong>{label}</strong>
        <span>{value}</span>
        {external && (
          <a className="sw-status__external" href={external.href} target="_blank" rel="noopener noreferrer">
            {external.label}
            <AdminIcon name="external" />
            <span className="sw-visually-hidden"> (nouvel onglet)</span>
          </a>
        )}
      </span>
      <span className="sw-status__tone">{toneLabel}</span>
      <Link prefetch={false} className="sw-status__edit" href={href} aria-label={`Modifier : ${label}`}>
        Modifier
      </Link>
    </li>
  )
}

export default Dashboard
