import { mkdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test'

/**
 * Outils des tests de bout en bout accessibilite.spec.ts, seo.spec.ts et parcours.spec.ts : contenus temporaires créés
 * par l'API de Payload (compte administrateur), comptes de membres, contexte « mobile » ouvert depuis un test du projet
 * « bureau » et relevé des requêtes envoyées à d'autres sites que Swatter TV.
 *
 * Connexion administrateur : Payload garde les sessions dans la fiche de l'utilisateur (lecture puis réécriture) ; deux
 * connexions simultanées au même compte peuvent effacer l'une des deux sessions. Les connexions de ces fichiers passent
 * donc une à une (verrou dans le dossier temporaire du système) et une session perdue malgré tout (connexion d'un autre
 * test au même moment) est rouverte, puis la requête renvoyée une fois.
 */

export const SITE = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000').origin

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin@swatter-tv.fr',
  password: process.env.E2E_ADMIN_PASSWORD || 'swatter-admin-2026',
}

/** Identifiant court et unique (titres des contenus de test, adresses e-mail des membres). */
export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** Adresse IP fictive : les limites anti-abus de l'espace membres sont comptées par adresse (dernier maillon de X-Forwarded-For). */
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const LOCK = path.join(os.tmpdir(), 'swatter-e2e-connexion-admin.lock')

/** Exécute `fn` seul : aucune autre connexion administrateur de ces fichiers ne se fait en même temps. */
async function withLoginLock<T>(fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      mkdirSync(LOCK)
      break
    } catch {
      // verrou laissé par un processus interrompu : abandonné au bout de 30 s
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 30_000) rmSync(LOCK, { recursive: true, force: true })
      } catch {
        // verrou libéré entre-temps
      }
      if (Date.now() > deadline) throw new Error('Connexion administrateur : verrou toujours pris après 90 s')
      await sleep(100)
    }
  }
  try {
    return await fn()
  } finally {
    rmSync(LOCK, { recursive: true, force: true })
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type Doc = { id: number; slug?: string | null; title?: string | null; name?: string | null }

/** Accès administrateur à l'API REST de Payload (requêtes sans les cookies des pages du test). */
export class AdminApi {
  private token = ''
  private readonly created: { collection: string; id: number }[] = []

  private constructor(private readonly api: APIRequestContext) {}

  /** Session administrateur ouverte par POST /api/users/login, ou null si les identifiants sont refusés. */
  static async open(): Promise<AdminApi | null> {
    const api = await playwrightRequest.newContext({ baseURL: SITE })
    const admin = new AdminApi(api)
    if (await admin.login()) return admin
    await api.dispose()
    return null
  }

  private async login(): Promise<boolean> {
    return withLoginLock(async () => {
      const res = await this.api.post('/api/users/login', { data: ADMIN })
      if (!res.ok()) return false
      this.token = ((await res.json()) as { token?: string }).token ?? ''
      return Boolean(this.token)
    })
  }

  private async loggedIn(): Promise<boolean> {
    const res = await this.api.get('/api/users/me', { headers: { Authorization: `JWT ${this.token}` } })
    return Boolean(((await res.json().catch(() => ({}))) as { user?: unknown }).user)
  }

  /** Requête authentifiée ; session perdue (401 ou 403 sans utilisateur reconnu) : nouvelle connexion puis nouvel essai. */
  async send(method: Method, url: string, data?: unknown): Promise<APIResponse> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.api.fetch(url, { method, data, headers: { Authorization: `JWT ${this.token}` } })
      if ((res.status() !== 401 && res.status() !== 403) || attempt > 0 || (await this.loggedIn())) return res
      expect(await this.login(), 'nouvelle connexion administrateur').toBe(true)
    }
  }

  /** Crée et publie un document ; il est supprimé par cleanup(). */
  async create<T extends Doc = Doc>(collection: string, data: Record<string, unknown>): Promise<T> {
    const res = await this.send('POST', `/api/${collection}?depth=0`, { _status: 'published', ...data })
    expect(res.ok(), `création dans « ${collection} » : ${res.status()} ${await res.text()}`).toBe(true)
    const { doc } = (await res.json()) as { doc: T }
    this.created.push({ collection, id: doc.id })
    return doc
  }

  /** Crée plusieurs documents, quelques-uns à la fois. */
  async createMany<T extends Doc = Doc>(collection: string, items: Record<string, unknown>[]): Promise<T[]> {
    const docs: T[] = []
    for (let i = 0; i < items.length; i += 5) docs.push(...(await Promise.all(items.slice(i, i + 5).map((d) => this.create<T>(collection, d)))))
    return docs
  }

  async remove(collection: string, id: number): Promise<void> {
    const res = await this.send('DELETE', `/api/${collection}/${id}`)
    expect([200, 404], `suppression de ${collection}/${id}`).toContain(res.status())
    const i = this.created.findIndex((c) => c.collection === collection && c.id === id)
    if (i >= 0) this.created.splice(i, 1)
  }

  /** Supprime tout ce que cette session a créé (contenus encore présents). */
  async cleanup(): Promise<void> {
    for (const { collection, id } of [...this.created].reverse()) await this.remove(collection, id).catch(() => undefined)
  }

  async dispose(): Promise<void> {
    await this.cleanup()
    await this.api.dispose()
  }

  /** Image de la médiathèque (visuel des contenus de départ) : vignette des vidéos créées, sans téléchargement YouTube. */
  async imageId(): Promise<number> {
    const res = await this.send('GET', '/api/media?limit=100&depth=0')
    const { docs } = (await res.json()) as { docs: { id: number; filename?: string | null; mimeType?: string | null }[] }
    const image = docs.find((m) => m.mimeType?.startsWith('image/') && !m.filename?.startsWith('youtube-'))
    expect(image, 'une image dans la médiathèque (npm run seed)').toBeTruthy()
    return image!.id
  }

  /**
   * Vidéo YouTube publiée (identifiant fictif, absent du faux YouTube des tests d'import) avec une vignette de la
   * médiathèque : le site n'a rien à télécharger.
   */
  async createYoutubeVideo(title: string, youtubeId = 'e2eSwatTV01'): Promise<Doc & { slug: string }> {
    const video = await this.create('videos', {
      title,
      source: { provider: 'youtube', youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}` },
      thumbnail: await this.imageId(),
      category: 'nature',
      description: 'Vidéo créée par un test automatique, supprimée à la fin du test.',
      publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    expect(video.slug, 'adresse de la vidéo').toBeTruthy()
    return video as Doc & { slug: string }
  }
}

/** Membre créé par l'API d'inscription (comme le formulaire) ; avec page.request, le navigateur de la page est connecté. */
export async function signupMember(request: APIRequestContext, firstName = 'Camille'): Promise<{ email: string; password: string }> {
  const email = `e2e-${unique('membre')}@example.com`
  const password = 'mot-de-passe-e2e'
  const res = await request.post('/api/compte/inscription', {
    headers: { origin: SITE, 'x-forwarded-for': randomIp() },
    data: { firstName, email, password, website: '', elapsed: 5000 },
  })
  expect(res.ok(), `inscription : ${res.status()} ${await res.text()}`).toBe(true)
  return { email, password }
}

/** Suppression du compte par le membre lui-même (mot de passe exigé). */
export async function deleteMember(request: APIRequestContext, password: string): Promise<void> {
  await request.post('/api/compte/supprimer', { headers: { origin: SITE, 'x-forwarded-for': randomIp() }, data: { password } }).catch(() => undefined)
}

/**
 * Contexte de navigation aux réglages du projet « mobile » (390 px, tactile), ouvert depuis un test du projet « bureau »
 * (tests qui se connectent en administrateur : un seul projet, pour ne pas ouvrir deux sessions à la fois).
 */
export async function mobileContext(browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const { config, project } = test.info()
  const mobile = config.projects.find((p) => p.name === 'mobile')?.use ?? {}
  return browser.newContext({
    baseURL: project.use.baseURL,
    locale: project.use.locale,
    timezoneId: project.use.timezoneId,
    viewport: mobile.viewport ?? { width: 390, height: 844 },
    deviceScaleFactor: mobile.deviceScaleFactor ?? 2,
    isMobile: mobile.isMobile ?? true,
    hasTouch: mobile.hasTouch ?? true,
    userAgent: mobile.userAgent,
    ...options,
  })
}

/**
 * Relève toutes les requêtes vers un autre site que Swatter TV (YouTube, Twitch, lecteurs de webcams…) et y répond par
 * une page vide : le test ne dépend pas d'Internet. Renvoie la liste, remplie au fil du test.
 */
export async function recordThirdParty(context: BrowserContext): Promise<string[]> {
  const urls: string[] = []
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.origin !== SITE,
    (route) => {
      urls.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Contenu externe simulé</title>' })
    },
  )
  return urls
}

/** Choix des cookies déjà fait (le bandeau ne s'affiche pas), pour les tests qui ne portent pas sur lui. */
export async function presetConsent(context: BrowserContext, choice = { audience: false, externes: false }): Promise<void> {
  await context.addInitScript((c) => {
    try {
      window.localStorage.setItem('swatter-consent', JSON.stringify({ v: 1, ...c, date: new Date().toISOString() }))
    } catch {
      // stockage indisponible : le bandeau s'affichera
    }
  }, choice)
}
