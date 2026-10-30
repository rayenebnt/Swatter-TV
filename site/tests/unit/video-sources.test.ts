// Tests unitaires de src/lib/video.ts : identifiant YouTube de chaque forme d’adresse (watch, youtu.be, shorts, live,
// embed, paramètres, adresses invalides), chaîne ou vidéo Twitch d’après ce qu’on a collé, lecteur Twitch intégré
// et transformation d’une source saisie dans l’administration en lecture exploitable par le lecteur ; lecteurs lancés
// seuls sans le son (direct) et adresse de l’aperçu animé.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mutedEmbedUrl, previewUrl, resolveVideo, twitchEmbedUrl, twitchTarget, youtubeId } from '@/lib/video'

const ID = 'dQw4w9WgXcQ'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('youtubeId : identifiant d’une vidéo YouTube', () => {
  it('lien « Partager » (youtu.be), avec ou sans paramètres', () => {
    expect(youtubeId(`https://youtu.be/${ID}`)).toBe(ID)
    expect(youtubeId(`https://youtu.be/${ID}?si=Hs7gYkqL1x2&t=42`)).toBe(ID)
  })

  it('page de la vidéo (watch?v=), « v » en premier ou après d’autres paramètres', () => {
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL0123`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/watch?feature=share&v=${ID}`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/watch?app=desktop&v=${ID}#t=1m`)).toBe(ID)
  })

  it('sous-domaines (mobile, YouTube Music) et adresse sans protocole', () => {
    expect(youtubeId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(youtubeId(`https://music.youtube.com/watch?v=${ID}&list=RD`)).toBe(ID)
    expect(youtubeId(`youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(youtubeId(`www.youtube.com/shorts/${ID}`)).toBe(ID)
  })

  it('Shorts, directs (live) et lecteur intégré (embed)', () => {
    expect(youtubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
    expect(youtubeId(`https://youtube.com/shorts/${ID}?si=abc`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/live/${ID}?feature=share`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/embed/${ID}?start=10&autoplay=1`)).toBe(ID)
  })

  it('identifiant seul (11 caractères : lettres, chiffres, - et _)', () => {
    expect(youtubeId(ID)).toBe(ID)
    expect(youtubeId('a-b_c-d_e-f')).toBe('a-b_c-d_e-f')
  })

  it('adresses qui ne désignent pas une vidéo YouTube : rien', () => {
    for (const url of [
      '',
      'pas une vidéo',
      'dQw4w9WgXc',
      `https://www.youtube.com/watch?v=dQw4w9WgXc`,
      `https://www.youtube.com/watch?vi=${ID}`,
      'https://www.youtube.com/@swattertv',
      'https://www.youtube.com/channel/UCswatterTVtestChannel01',
      'https://vimeo.com/123456789',
      `https://www.dailymotion.com/video/${ID}`,
    ]) {
      expect(youtubeId(url), url).toBeNull()
    }
  })

  it('lecteur intégré en mode confidentialité avancée (youtube-nocookie.com/embed)', () => {
    expect(youtubeId(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID)
    expect(youtubeId(`https://www.youtube-nocookie.com/embed/${ID}?rel=0`)).toBe(ID)
  })

  it('une liste de lecture intégrée (embed/videoseries?list=…) n’est pas une vidéo', () => {
    expect(youtubeId('https://www.youtube.com/embed/videoseries?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs')).toBeNull()
  })

  it('un identifiant trop long est refusé, pas tronqué à 11 caractères', () => {
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}123`)).toBeNull()
    expect(youtubeId(`https://youtu.be/${ID}XYZ`)).toBeNull()
  })
})

describe('twitchTarget : chaîne ou vidéo Twitch', () => {
  it('adresse de la chaîne copiée dans le navigateur, avec ou sans protocole, en minuscules', () => {
    expect(twitchTarget('https://www.twitch.tv/swattertv')).toEqual({ param: 'channel', value: 'swattertv' })
    expect(twitchTarget('http://www.twitch.tv/SwatterTV')).toEqual({ param: 'channel', value: 'swattertv' })
    expect(twitchTarget('twitch.tv/SwatterTV')).toEqual({ param: 'channel', value: 'swattertv' })
    expect(twitchTarget('https://m.twitch.tv/swattertv')).toEqual({ param: 'channel', value: 'swattertv' })
    expect(twitchTarget('  https://www.twitch.tv/swattertv?sr=a  ')).toEqual({ param: 'channel', value: 'swattertv' })
    // onglet de la chaîne : c'est toujours elle
    expect(twitchTarget('https://www.twitch.tv/swattertv/videos')).toEqual({ param: 'channel', value: 'swattertv' })
  })

  it('le nom de la chaîne seul suffit (4 à 25 caractères : lettres, chiffres, _)', () => {
    expect(twitchTarget('swattertv')).toEqual({ param: 'channel', value: 'swattertv' })
    expect(twitchTarget('Swatter_TV')).toEqual({ param: 'channel', value: 'swatter_tv' })
  })

  it('vidéo déjà diffusée : « v » suivi de son numéro', () => {
    expect(twitchTarget('https://www.twitch.tv/videos/123456789')).toEqual({ param: 'video', value: 'v123456789' })
  })

  it('lien du lecteur intégré (player.twitch.tv) : chaîne ou vidéo', () => {
    expect(twitchTarget('https://player.twitch.tv/?channel=SwatterTV&parent=www.swatter-tv.fr')).toEqual({ param: 'channel', value: 'swattertv' })
    expect(twitchTarget('https://player.twitch.tv/?video=v123456789&parent=x')).toEqual({ param: 'video', value: 'v123456789' })
    expect(twitchTarget('https://player.twitch.tv/?video=123456789')).toEqual({ param: 'video', value: 'v123456789' })
  })

  it('refuse le reste : vide, autre site, pages de Twitch, noms invalides, lecteur sans chaîne', () => {
    for (const input of [
      null,
      undefined,
      '',
      '   ',
      'ab',
      'a'.repeat(26),
      'swatter-tv',
      'https://www.youtube.com/@swattertv',
      'https://evil.com/swattertv',
      'https://nottwitch.tv/swattertv',
      'https://twitch.tv.evil.com/swattertv',
      'https://www.twitch.tv/',
      'https://www.twitch.tv/directory',
      'https://www.twitch.tv/Directory/game/Just%20Chatting',
      'https://www.twitch.tv/p/fr/about',
      'https://www.twitch.tv/search?term=swatter',
      'https://www.twitch.tv/settings/profile',
      'https://www.twitch.tv/downloads',
      'https://www.twitch.tv/videos/abc',
      'https://www.twitch.tv/videos',
      'https://player.twitch.tv/',
      'https://player.twitch.tv/?channel=nom invalide',
      'https://player.twitch.tv/?video=abc',
      'https://',
    ]) {
      expect(twitchTarget(input), String(input)).toBeNull()
    }
  })

  it('un lien de clip (clips.twitch.tv/…) n’est pas une chaîne', () => {
    expect(twitchTarget('https://clips.twitch.tv/MagnifiqueClip')).toBeNull()
  })

  it('les pages d’outils de Twitch (modération, fenêtre détachée) ne sont pas prises pour une chaîne qui porterait leur nom', () => {
    expect(twitchTarget('https://www.twitch.tv/moderator/swattertv')?.value).not.toBe('moderator')
    expect(twitchTarget('https://www.twitch.tv/popout/swattertv/chat?popout=')?.value).not.toBe('popout')
  })
})

describe('twitchEmbedUrl : lecteur Twitch intégré', () => {
  it('chaîne en lecture automatique avec le son, un « parent » par domaine (sans doublon ni vide)', () => {
    const url = new URL(twitchEmbedUrl({ param: 'channel', value: 'swattertv' }, ['www.swatter-tv.fr', '', 'www.swatter-tv.fr', 'swatter-tv.fr']))
    expect(url.origin + url.pathname).toBe('https://player.twitch.tv/')
    expect(url.searchParams.get('channel')).toBe('swattertv')
    expect(url.searchParams.get('autoplay')).toBe('true')
    expect(url.searchParams.get('muted')).toBe('false')
    expect(url.searchParams.getAll('parent')).toEqual(['www.swatter-tv.fr', 'swatter-tv.fr'])
  })

  it('vidéo déjà diffusée', () => {
    expect(twitchEmbedUrl({ param: 'video', value: 'v123456789' }, ['localhost'])).toBe(
      'https://player.twitch.tv/?video=v123456789&autoplay=true&muted=false&parent=localhost',
    )
  })

  it('direct lancé seul quand il est visible : lecture automatique sans le son (muted=true)', () => {
    const url = new URL(twitchEmbedUrl({ param: 'channel', value: 'swattertv' }, ['www.swatter-tv.fr'], true))
    expect(url.searchParams.get('autoplay')).toBe('true')
    expect(url.searchParams.get('muted')).toBe('true')
    expect(url.searchParams.getAll('parent')).toEqual(['www.swatter-tv.fr'])
  })
})

describe('mutedEmbedUrl : lecteur intégré lancé seul, sans le son', () => {
  it('YouTube : mute=1 et playsinline=1 ajoutés aux paramètres du lecteur sans cookies', () => {
    const youtube = resolveVideo({ provider: 'youtube', youtubeUrl: `https://www.youtube.com/watch?v=${ID}` })
    expect(youtube?.kind).toBe('youtube')
    const url = new URL(mutedEmbedUrl(youtube as Extract<typeof youtube, { kind: 'youtube' }>))
    expect(url.origin + url.pathname).toBe(`https://www.youtube-nocookie.com/embed/${ID}`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ autoplay: '1', rel: '0', modestbranding: '1', mute: '1', playsinline: '1' })
  })

  it('Bunny Stream : muted=true, les autres paramètres conservés', () => {
    const url = new URL(mutedEmbedUrl({ kind: 'iframe', embedUrl: 'https://iframe.mediadelivery.net/embed/12345/abc-def?autoplay=true&preload=true&responsive=true' }))
    expect(url.origin + url.pathname).toBe('https://iframe.mediadelivery.net/embed/12345/abc-def')
    expect(Object.fromEntries(url.searchParams)).toEqual({ autoplay: 'true', preload: 'true', responsive: 'true', muted: 'true' })
  })
})

describe('previewUrl : aperçu animé d’une vidéo ou d’un replay', () => {
  it('extrait de la médiathèque chargé : son adresse, en chemin local (même origine que la page)', () => {
    expect(previewUrl({ id: 7, url: '/api/media/file/apercu-balade.mp4', mimeType: 'video/mp4' } as never)).toBe('/api/media/file/apercu-balade.mp4')
    expect(previewUrl({ id: 7, url: 'http://localhost:3000/api/media/file/apercu-balade.webm', mimeType: 'video/webm' } as never)).toBe(
      '/api/media/file/apercu-balade.webm',
    )
  })

  it('aucun aperçu, relation non chargée ou média qui n’est pas une vidéo : rien (l’image reste fixe, aucune requête)', () => {
    expect(previewUrl(null)).toBeNull()
    expect(previewUrl(undefined)).toBeNull()
    expect(previewUrl(7)).toBeNull()
    expect(previewUrl({ id: 7, url: null, mimeType: 'video/mp4' } as never)).toBeNull()
    expect(previewUrl({ id: 7, url: '/api/media/file/photo.webp', mimeType: 'image/webp' } as never)).toBeNull()
  })
})

describe('resolveVideo : source saisie → lecture', () => {
  it('sans source ou sans type : rien', () => {
    expect(resolveVideo(null)).toBeNull()
    expect(resolveVideo(undefined)).toBeNull()
    expect(resolveVideo({ provider: null })).toBeNull()
    expect(resolveVideo({})).toBeNull()
  })

  it('YouTube : lecteur sans cookies en lecture automatique, vignette hqdefault', () => {
    expect(resolveVideo({ provider: 'youtube', youtubeUrl: `https://youtu.be/${ID}?si=x` })).toEqual({
      kind: 'youtube',
      id: ID,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0&modestbranding=1`,
      thumbnail: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
    })
  })

  it('YouTube sans lien ou avec un lien qui n’est pas une vidéo : rien', () => {
    expect(resolveVideo({ provider: 'youtube' })).toBeNull()
    expect(resolveVideo({ provider: 'youtube', youtubeUrl: '' })).toBeNull()
    expect(resolveVideo({ provider: 'youtube', youtubeUrl: 'https://www.youtube.com/@swattertv' })).toBeNull()
  })

  it('Twitch : chaîne ou vidéo ; adresse refusée : rien', () => {
    expect(resolveVideo({ provider: 'twitch', twitchUrl: 'https://www.twitch.tv/SwatterTV' })).toEqual({ kind: 'twitch', param: 'channel', value: 'swattertv' })
    expect(resolveVideo({ provider: 'twitch', twitchUrl: 'https://www.twitch.tv/videos/42' })).toEqual({ kind: 'twitch', param: 'video', value: 'v42' })
    expect(resolveVideo({ provider: 'twitch', twitchUrl: 'https://evil.com/x' })).toBeNull()
    expect(resolveVideo({ provider: 'twitch' })).toBeNull()
  })

  it('Bunny Stream : bibliothèque (NEXT_PUBLIC_BUNNY_LIBRARY_ID) et identifiant de la vidéo nécessaires', () => {
    vi.stubEnv('NEXT_PUBLIC_BUNNY_LIBRARY_ID', '12345')
    expect(resolveVideo({ provider: 'bunny', bunnyVideoId: 'abc-def' })).toEqual({
      kind: 'iframe',
      embedUrl: 'https://iframe.mediadelivery.net/embed/12345/abc-def?autoplay=true&preload=true&responsive=true',
    })
    expect(resolveVideo({ provider: 'bunny', bunnyVideoId: '' })).toBeNull()
    vi.stubEnv('NEXT_PUBLIC_BUNNY_LIBRARY_ID', '')
    expect(resolveVideo({ provider: 'bunny', bunnyVideoId: 'abc-def' })).toBeNull()
  })

  it('lien direct : flux HLS (.m3u8, majuscules et paramètres compris) ou fichier MP4, espaces retirés', () => {
    expect(resolveVideo({ provider: 'url', url: ' https://cdn.example.com/live/playlist.m3u8 ' })).toEqual({
      kind: 'hls',
      src: 'https://cdn.example.com/live/playlist.m3u8',
    })
    expect(resolveVideo({ provider: 'url', url: 'https://cdn.example.com/live/Playlist.M3U8?token=abc' })).toEqual({
      kind: 'hls',
      src: 'https://cdn.example.com/live/Playlist.M3U8?token=abc',
    })
    expect(resolveVideo({ provider: 'url', url: 'https://cdn.example.com/clip.mp4' })).toEqual({ kind: 'mp4', src: 'https://cdn.example.com/clip.mp4' })
    expect(resolveVideo({ provider: 'url', url: 'https://cdn.example.com/a.m3u8.mp4' })).toEqual({ kind: 'mp4', src: 'https://cdn.example.com/a.m3u8.mp4' })
  })

  it('lien direct vide : rien', () => {
    expect(resolveVideo({ provider: 'url', url: '   ' })).toBeNull()
    expect(resolveVideo({ provider: 'url', url: null })).toBeNull()
  })

  it('fichier de la médiathèque : son adresse (relation chargée), rien sinon', () => {
    expect(resolveVideo({ provider: 'upload', file: { id: 3, url: '/api/media/file/clip.mp4' } as never })).toEqual({
      kind: 'mp4',
      src: '/api/media/file/clip.mp4',
    })
    expect(resolveVideo({ provider: 'upload', file: 3 })).toBeNull()
    expect(resolveVideo({ provider: 'upload', file: '3' })).toBeNull()
    expect(resolveVideo({ provider: 'upload', file: null })).toBeNull()
    expect(resolveVideo({ provider: 'upload', file: { id: 3, url: null } as never })).toBeNull()
  })
})
