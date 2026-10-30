// Traitements ffmpeg (src/hooks/ffmpeg.ts) : arguments construits (lecture limitée à file ou http(s), cadrage 16:9 avec
// fond flouté, extrait muet H.264, diaporama en fondu), lecture de ffprobe, tailles ; puis lancement avec un faux ffmpeg
// (script) : deux traitements à la fois au plus, délai dépassé, programme absent, erreur, repli pour une vidéo très courte.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clipArgs,
  clipStart,
  coverArgs,
  coverSize,
  ffmpegReady,
  frame16x9,
  inputArgs,
  LIMITS,
  MissingProgramError,
  parseProbe,
  PREVIEW,
  probeArgs,
  resetFfmpegState,
  slideshow,
  slideshowArgs,
  videoCover,
} from '@/hooks/ffmpeg'

/** Valeur qui suit une option dans une liste d'arguments. */
const after = (args: string[], option: string) => args[args.indexOf(option) + 1]

describe('lecture de la vidéo : protocoles limités', () => {
  it('fichier du disque : protocole « file » seul, chemin préfixé (un « : » dans le nom n’est pas un protocole)', () => {
    expect(inputArgs({ path: '/srv/media/a:b.mp4' })).toEqual(['-protocol_whitelist', 'file', '-i', 'file:/srv/media/a:b.mp4'])
  })

  it('adresse distante : http et https seulement (et ce qu’il faut pour TLS, HLS chiffré, proxy), délai réseau de 15 s', () => {
    const args = inputArgs({ url: 'https://cdn.exemple.fr/live.m3u8' })
    expect(after(args, '-protocol_whitelist').split(',').sort()).toEqual(['crypto', 'http', 'httpproxy', 'https', 'tcp', 'tls'])
    expect(after(args, '-protocol_whitelist')).not.toMatch(/file|data|concat|subfile/)
    expect(after(args, '-rw_timeout')).toBe('15000000')
    expect(args.slice(-2)).toEqual(['-i', 'https://cdn.exemple.fr/live.m3u8'])
  })

  it('ffprobe : durée, dimensions et rotation de la première piste vidéo, en JSON', () => {
    const args = probeArgs({ path: '/srv/clip.mp4' })
    expect(after(args, '-print_format')).toBe('json')
    expect(after(args, '-select_streams')).toBe('v:0')
    expect(after(args, '-show_entries')).toContain('format=duration')
    expect(args.slice(-2)).toEqual(['-i', 'file:/srv/clip.mp4'])
  })
})

describe('ffprobe : durée et dimensions affichées', () => {
  it('vidéo ordinaire', () => {
    expect(parseProbe(JSON.stringify({ format: { duration: '8.000000' }, streams: [{ width: 1280, height: 720 }] }))).toEqual({ duration: 8, width: 1280, height: 720 })
  })

  it('vidéo de téléphone tournée d’un quart (rotation -90 ou ancienne balise rotate) : largeur et hauteur échangées', () => {
    const side = { format: { duration: '12.5' }, streams: [{ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }] }
    expect(parseProbe(JSON.stringify(side))).toEqual({ duration: 12.5, width: 1080, height: 1920 })
    const tag = { format: { duration: '3' }, streams: [{ width: 1920, height: 1080, tags: { rotate: '270' } }] }
    expect(parseProbe(JSON.stringify(tag))).toMatchObject({ width: 1080, height: 1920 })
    const half = { streams: [{ width: 1920, height: 1080, side_data_list: [{ rotation: 180 }] }] }
    expect(parseProbe(JSON.stringify(half))).toMatchObject({ width: 1920, height: 1080 })
  })

  it('flux en direct (durée « N/A »), réponse vide ou illisible : inconnu', () => {
    expect(parseProbe(JSON.stringify({ format: { duration: 'N/A' }, streams: [{ width: 640, height: 360 }] })).duration).toBeNull()
    expect(parseProbe('{}')).toEqual({ duration: null, width: null, height: null })
    expect(parseProbe('pas du json')).toEqual({ duration: null, width: null, height: null })
  })
})

describe('tailles et point de départ', () => {
  it('couverture 16:9 de 540 à 1080 de haut selon la vidéo (1920 de large au plus), 720 si inconnue', () => {
    expect(coverSize({ duration: 1, width: 3840, height: 2160 })).toEqual({ width: 1920, height: 1080 })
    expect(coverSize({ duration: 1, width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 })
    expect(coverSize({ duration: 1, width: 1080, height: 1920 })).toEqual({ width: 1920, height: 1080 })
    expect(coverSize({ duration: 1, width: 320, height: 180 })).toEqual({ width: 960, height: 540 })
    expect(coverSize(null)).toEqual({ width: 1280, height: 720 })
    for (const height of [181, 541, 999, 2000]) {
      const size = coverSize({ duration: 1, width: null, height })
      expect(size.width % 2 + size.height % 2, `${height}`).toBe(0)
      expect(size.width).toBeLessThanOrEqual(1920)
    }
  })

  it('extrait pris vers 10 % de la durée, sans dépasser la fin ; dès le début si la durée est inconnue ou courte', () => {
    expect(clipStart(600)).toBe(60)
    expect(clipStart(8)).toBe(0.8)
    expect(clipStart(5.4)).toBe(0.4)
    expect(clipStart(5)).toBe(0)
    expect(clipStart(0.5)).toBe(0)
    expect(clipStart(null)).toBe(0)
    expect(clipStart(7200)).toBe(720)
  })
})

describe('cadrage 16:9', () => {
  it('fond flouté de la même image et image entière par-dessus : ni bandes noires ni recadrage brutal', () => {
    const filter = frame16x9({ width: 960, height: 540 })
    // bords rognés de 10 % au plus
    expect(filter).toContain("crop=w='max(min(iw,ih*16/9),iw*0.9)':h='max(min(ih,iw*9/16),ih*0.9)'")
    expect(filter).toMatch(/boxblur=.*scale=960:540/)
    expect(filter).toContain('scale=960:540:force_original_aspect_ratio=decrease')
    expect(filter).toContain('overlay=(W-w)/2:(H-h)/2')
    expect(filter).toMatch(/format=yuv420p$/)
  })
})

describe('arguments de ffmpeg', () => {
  const input = { path: '/srv/media/clip.mp4' }

  it('couverture : image représentative (filtre thumbnail) après 1 s, une seule image JPEG cadrée en 16:9', () => {
    const args = coverArgs(input, '/tmp/c.jpg', { width: 1280, height: 720 }, 1)
    expect(after(args, '-ss')).toBe('1')
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(after(args, '-filter_complex')).toMatch(/^\[0:v:0\]thumbnail=50,crop=.*scale=1280:720.*\[out\]$/)
    expect(after(args, '-frames:v')).toBe('1')
    expect(args.at(-1)).toBe('/tmp/c.jpg')
    expect(args).toContain('-nostdin')
    // dès le début : pas de -ss
    expect(coverArgs(input, '/tmp/c.jpg', { width: 1280, height: 720 }, 0)).not.toContain('-ss')
  })

  it('aperçu : 5 s muettes, H.264 yuv420p profil main, index en tête (+faststart), 960×540, 30 images/s au plus, < 1 Mo visé', () => {
    const args = clipArgs(input, '/tmp/a.mp4', 60)
    expect(after(args, '-ss')).toBe('60')
    expect(after(args, '-t')).toBe(String(PREVIEW.seconds))
    expect(args).toContain('-an')
    expect(after(args, '-c:v')).toBe('libx264')
    expect(after(args, '-pix_fmt')).toBe('yuv420p')
    expect(after(args, '-profile:v')).toBe('main')
    expect(after(args, '-movflags')).toBe('+faststart')
    expect(after(args, '-fpsmax')).toBe('30')
    expect(after(args, '-filter_complex')).toContain('scale=960:540')
    // débit plafonné : 1,4 Mbit/s × 5 s ≈ 875 Ko au pire
    expect(after(args, '-maxrate')).toBe('1400k')
    expect(clipArgs(input, '/tmp/a.mp4', 0)).not.toContain('-ss')
  })

  it('diaporama : 3 images de 2 s, recadrées en 16:9, zoom avant / arrière, deux fondus (5 s en tout)', () => {
    const args = slideshowArgs(['/tmp/1.jpg', '/tmp/2.jpg', '/tmp/3.jpg'], '/tmp/d.mp4')
    expect(args.filter((a) => a.startsWith('file:/tmp/'))).toEqual(['file:/tmp/1.jpg', 'file:/tmp/2.jpg', 'file:/tmp/3.jpg'])
    const filter = after(args, '-filter_complex')
    expect(filter.match(/crop=w='min\(iw,ih\*16\/9\)':h='min\(ih,iw\*9\/16\)'/g)).toHaveLength(3)
    // chaque image lue une fois : zoompan en tire 50 images (2 s à 25 images/s)
    expect(filter.match(/d=50:s=960x540:fps=25/g)).toHaveLength(3)
    expect(filter).toContain("z='1+0.06*on/50'")
    expect(filter).toContain("z='1.06-0.06*on/50'")
    expect(filter).toContain('xfade=transition=fade:duration=0.5:offset=1.5[x1]')
    expect(filter).toContain('[x1][s2]xfade=transition=fade:duration=0.5:offset=3[x2]')
    expect(filter).toMatch(/\[x2\]format=yuv420p\[out\]$/)
    expect(args).toContain('-an')
    expect(args.at(-1)).toBe('/tmp/d.mp4')
  })
})

describe('lancement (faux ffmpeg)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'faux-ffmpeg-'))
  const fake = path.join(dir, 'ffmpeg')
  const log = path.join(dir, 'log')
  const limits = { ...LIMITS }
  const image = Buffer.alloc(3000, 1)

  /** Faux ffmpeg : note le nombre de traitements en cours, attend FAKE_SLEEP s, écrit le fichier demandé (dernier argument). */
  const script = (body: string) => {
    writeFileSync(fake, `#!/bin/sh\nd=$(dirname "$0")\ntouch "$d/run.$$"\nls "$d" | grep -c '^run\\.' >> "$d/log"\n${body}\nrm -f "$d/run.$$"\n`)
    chmodSync(fake, 0o755)
  }
  const WRITE = 'eval out=\\${$#}\nhead -c 5000 /dev/zero > "$out"'

  beforeEach(() => {
    writeFileSync(log, '')
    vi.stubEnv('FFMPEG_PATH', fake)
    resetFfmpegState()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Object.assign(LIMITS, limits)
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('deux traitements à la fois au plus : les suivants attendent leur tour', async () => {
    script(`sleep 0.3\n${WRITE}`)
    const clips = await Promise.all([1, 2, 3, 4, 5].map(() => slideshow([image, image, image])))
    expect(clips.every((c) => c.length === 5000)).toBe(true)
    const running = readFileSync(log, 'utf8').trim().split('\n').map(Number)
    expect(running).toHaveLength(5)
    expect(Math.max(...running)).toBeLessThanOrEqual(2)
  })

  it('délai dépassé : processus tué, erreur', async () => {
    script(`sleep 5\n${WRITE}`)
    LIMITS.local = 300
    const start = Date.now()
    await expect(slideshow([image])).rejects.toThrow('délai de 0.3 s dépassé')
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('erreur de ffmpeg : sa dernière ligne d’erreur ; fichier non produit : erreur aussi', async () => {
    script('echo "première ligne" >&2\necho "Invalid data found when processing input" >&2\nexit 1')
    await expect(slideshow([image])).rejects.toThrow('Invalid data found when processing input')
    script('exit 0')
    await expect(slideshow([image])).rejects.toThrow('diaporama vide')
  })

  it('vidéo plus courte que le point de départ (rien après 1 s) : nouvel essai dès le début', async () => {
    // n'écrit l'image que sans -ss
    script(`case " $* " in *" -ss "*) ;; *) ${WRITE.replace('\n', ';')} ;; esac`)
    const cover = await videoCover({ path: '/srv/clip.mp4' }, { duration: 10, width: 640, height: 360 })
    expect(cover.length).toBe(5000)
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(2)
    // durée connue et très courte : directement dès le début
    writeFileSync(log, '')
    await videoCover({ path: '/srv/clip.mp4' }, { duration: 0.5, width: 640, height: 360 })
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(1)
  })

  it('programme absent : détecté une fois (un seul signalement), traitements refusés sans relancer de processus', async () => {
    vi.stubEnv('FFMPEG_PATH', path.join(dir, 'inexistant'))
    const onMissing = vi.fn()
    expect(await ffmpegReady(onMissing)).toBe(false)
    expect(await ffmpegReady(onMissing)).toBe(false)
    expect(onMissing).toHaveBeenCalledTimes(1)
    await expect(slideshow([image])).rejects.toBeInstanceOf(MissingProgramError)
    // présent : prêt
    script('exit 0')
    vi.stubEnv('FFMPEG_PATH', fake)
    expect(await ffmpegReady(onMissing)).toBe(true)
    expect(onMissing).toHaveBeenCalledTimes(1)
  })
})
