// Traitements vidéo côté serveur avec ffmpeg et ffprobe (paquet système, installé dans l'image Docker) : couverture tirée
// d'une vidéo, court extrait muet, diaporama animé de quelques images. Module serveur uniquement (child_process) : jamais
// importé par src/lib (partagé avec le navigateur). Délais stricts, deux traitements à la fois au plus.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Programme ffmpeg : FFMPEG_PATH, sinon celui du système (paquet « ffmpeg »). */
export const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg'
/** Programme ffprobe (durée et dimensions d'une vidéo) : FFPROBE_PATH, sinon celui du système. */
export const ffprobeBin = () => process.env.FFPROBE_PATH || 'ffprobe'

/** Délais maximum (ms) : traitement d'une vidéo du disque, d'une adresse distante ; lecture de la durée et des dimensions. */
export const LIMITS = { local: 30_000, remote: 45_000, probe: 15_000, remoteProbe: 20_000 }
/** Traitements ffmpeg simultanés au plus : les suivants attendent leur tour (serveur modeste, enregistrements automatiques). */
export const MAX_RUNNING = 2
/** Durée de l'aperçu animé (s) et sa taille : 16:9, 540 de haut. */
export const PREVIEW = { seconds: 5, width: 960, height: 540 }
/** Diaporama : durée de chaque image et du fondu (s), images par seconde. */
export const SLIDES = { seconds: 2, fade: 0.5, fps: 25 }

/** Vidéo à lire : fichier du disque, ou adresse http(s). */
export type VideoInput = { path: string } | { url: string }
/** Durée (s) et dimensions affichées (rotation des vidéos de téléphone comprise) ; null : inconnue (flux en direct…). */
export type VideoProbe = { duration: number | null; width: number | null; height: number | null }
export type Size = { width: number; height: number }

/** Programme introuvable (ENOENT) ou non exécutable. */
export class MissingProgramError extends Error {
  program: string
  constructor(program: string) {
    super(`${program} introuvable`)
    this.program = program
  }
}

const COMMON = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y']
/** MP4 H.264 lisible partout (yuv420p, profil main), sans son, métadonnées retirées, index en tête (+faststart). */
const H264 = [
  '-an', '-sn', '-dn',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-maxrate', '1400k', '-bufsize', '2800k',
  '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-movflags', '+faststart', '-map_metadata', '-1', '-map_chapters', '-1',
]

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const seconds = (n: number) => String(Math.round(n * 100) / 100)

/**
 * Options de lecture : un fichier du disque (protocole « file » seul), ou une adresse http/https (jamais file:, ni un autre
 * protocole, même depuis une liste de lecture .m3u8), avec un délai d'attente réseau de 15 s.
 */
export function inputArgs(input: VideoInput): string[] {
  return 'path' in input
    ? ['-protocol_whitelist', 'file', '-i', `file:${input.path}`]
    : ['-protocol_whitelist', 'http,https,tcp,tls,crypto,httpproxy', '-rw_timeout', '15000000', '-i', input.url]
}

/** Arguments de ffprobe : durée, dimensions et rotation de la première piste vidéo, en JSON. */
export function probeArgs(input: VideoInput): string[] {
  const entries = 'format=duration:stream=width,height:stream_tags=rotate:stream_side_data=rotation'
  return ['-v', 'error', '-print_format', 'json', '-select_streams', 'v:0', '-show_entries', entries, ...inputArgs(input)]
}

/** Réponse de ffprobe → durée et dimensions affichées (largeur et hauteur échangées pour une vidéo tournée d'un quart). */
export function parseProbe(json: string): VideoProbe {
  type Stream = { width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }
  let data: { format?: { duration?: string }; streams?: Stream[] } = {}
  try {
    data = JSON.parse(json)
  } catch {
    // réponse illisible : rien de connu
  }
  const stream = data.streams?.[0]
  const duration = Number(data.format?.duration)
  const rotation = Number(stream?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? stream?.tags?.rotate ?? 0)
  const turned = Math.abs(rotation) % 180 === 90
  const width = stream?.width || null
  const height = stream?.height || null
  return { duration: Number.isFinite(duration) && duration > 0 ? duration : null, width: turned ? height : width, height: turned ? width : height }
}

/** Couverture 16:9 aussi nette que la vidéo le permet : de 540 à 1080 de haut (donc 1920 de large au plus). */
export function coverSize(probe: VideoProbe | null): Size {
  const height = Math.min(1080, Math.max(540, even(probe?.height || 720)))
  return { width: even((height * 16) / 9), height }
}

/** Début de l'extrait : vers 10 % de la durée, sans dépasser la fin ; dès le début si la durée est inconnue ou courte. */
export function clipStart(duration: number | null): number {
  if (!duration || duration <= PREVIEW.seconds) return 0
  return Math.round(Math.max(0, Math.min(duration * 0.1, duration - PREVIEW.seconds)) * 100) / 100
}

/**
 * Filtre ffmpeg qui cadre l'image en 16:9 (`width`×`height`) : bords rognés de 10 % au plus, puis le reste posé sur un fond
 * flouté et assombri de la même image. Une vidéo de téléphone (verticale) ou carrée garde tout son cadre, sans bandes
 * noires ni recadrage brutal ; une vidéo 16:9 remplit simplement l'image.
 */
export function frame16x9({ width, height }: Size): string {
  return [
    `crop=w='max(min(iw,ih*16/9),iw*0.9)':h='max(min(ih,iw*9/16),ih*0.9)',split=2[bg0][fg0]`,
    `[bg0]scale=192:108:force_original_aspect_ratio=increase,crop=192:108,boxblur=6:2,scale=${width}:${height},eq=brightness=-0.06[bg]`,
    `[fg0]scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p`,
  ].join(';')
}

/** Arguments ffmpeg de la couverture : image la plus représentative (filtre « thumbnail ») à partir de `seek` secondes. */
export function coverArgs(input: VideoInput, output: string, size: Size, seek: number): string[] {
  return [
    ...COMMON,
    ...(seek > 0 ? ['-ss', seconds(seek)] : []),
    ...inputArgs(input),
    '-filter_complex', `[0:v:0]thumbnail=50,${frame16x9(size)}[out]`,
    '-map', '[out]', '-frames:v', '1', '-q:v', '2', output,
  ]
}

/** Arguments ffmpeg de l'aperçu animé : extrait muet de 5 s à partir de `start`, 960×540, 30 images/s au plus. */
export function clipArgs(input: VideoInput, output: string, start: number): string[] {
  return [
    ...COMMON,
    ...(start > 0 ? ['-ss', seconds(start)] : []),
    ...inputArgs(input),
    '-filter_complex', `[0:v:0]${frame16x9(PREVIEW)}[out]`,
    '-map', '[out]', '-t', String(PREVIEW.seconds), '-fpsmax', '30', ...H264, output,
  ]
}

/**
 * Arguments ffmpeg du diaporama : chaque image (fichiers du disque) recadrée au centre en 16:9 (bandes noires des images
 * 4:3 de YouTube retirées), léger zoom avant puis arrière, fondu enchaîné ; 3 images → 5 s.
 */
export function slideshowArgs(images: string[], output: string): string[] {
  const frames = SLIDES.seconds * SLIDES.fps
  const inputs = images.flatMap((image) => ['-protocol_whitelist', 'file', '-i', `file:${image}`])
  // chaque image est décodée et agrandie une seule fois (2× la sortie : zoom sans à-coups), zoompan en tire `frames` images
  const slides = images.map((_, i) => {
    const zoom = i % 2 ? `1.06-0.06*on/${frames}` : `1+0.06*on/${frames}`
    return (
      `[${i}:v]crop=w='min(iw,ih*16/9)':h='min(ih,iw*9/16)',scale=${PREVIEW.width * 2}:${PREVIEW.height * 2},setsar=1,` +
      `zoompan=z='${zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${PREVIEW.width}x${PREVIEW.height}:fps=${SLIDES.fps}[s${i}]`
    )
  })
  const fades: string[] = []
  let last = 's0'
  for (let i = 1; i < images.length; i++) {
    fades.push(`[${last}][s${i}]xfade=transition=fade:duration=${SLIDES.fade}:offset=${seconds(i * (SLIDES.seconds - SLIDES.fade))}[x${i}]`)
    last = `x${i}`
  }
  return [...COMMON, ...inputs, '-filter_complex', [...slides, ...fades, `[${last}]format=yuv420p[out]`].join(';'), '-map', '[out]', ...H264, output]
}

// ---------- Lancement des programmes ----------

/** Programmes absents, déjà signalés. */
const missing = new Set<string>()
/** Vérification « ffmpeg -version », une fois par programme. */
const checks = new Map<string, Promise<boolean>>()
let running = 0
const waiting: (() => void)[] = []

/** Oublie les programmes absents et les vérifications faites (tests). */
export function resetFfmpegState() {
  missing.clear()
  checks.clear()
}

/** Lance un programme ; sortie standard, ou erreur (dernière ligne d'erreur de ffmpeg, délai dépassé, programme absent). */
function exec(program: string, args: string[], timeoutMs: number): Promise<string> {
  if (missing.has(program)) return Promise.reject(new MissingProgramError(program))
  return new Promise((resolve, reject) => {
    let out = ''
    let err = ''
    let settled = false
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    // processus tué au-delà du délai (lien qui ne répond plus, vidéo interminable…), sans attendre la fermeture de ses sorties
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      done(() => reject(new Error(`délai de ${timeoutMs / 1000} s dépassé`)))
    }, timeoutMs)
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    child.stdout.on('data', (chunk: Buffer) => {
      if (out.length < 1_000_000) out += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-2000)
    })
    child.on('error', (error: NodeJS.ErrnoException) =>
      done(() => {
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
          missing.add(program)
          reject(new MissingProgramError(program))
        } else reject(error)
      }),
    )
    child.on('close', (code, signal) =>
      done(() => {
        if (code === 0) resolve(out)
        else reject(new Error(err.trim().split('\n').pop() || `arrêt (${code ?? signal})`))
      }),
    )
  })
}

/** Lance ffmpeg à son tour (MAX_RUNNING à la fois). */
async function ffmpeg(args: string[], timeoutMs: number): Promise<void> {
  if (running >= MAX_RUNNING) await new Promise<void>((resolve) => waiting.push(resolve))
  else running++
  try {
    await exec(ffmpegBin(), args, timeoutMs)
  } finally {
    // la place passe directement au suivant
    const next = waiting.shift()
    if (next) next()
    else running--
  }
}

/**
 * ffmpeg est-il installé ? Vérifié une fois par programme : `onMissing` n'est appelé que la première fois qu'il manque
 * (un seul avertissement dans le journal). Une autre panne laisse essayer : chaque traitement signalera son erreur.
 */
export function ffmpegReady(onMissing?: (program: string) => void): Promise<boolean> {
  const program = ffmpegBin()
  let check = checks.get(program)
  if (!check) {
    check = exec(program, ['-hide_banner', '-version'], 10_000).then(
      () => true,
      (error: unknown) => {
        if (!(error instanceof MissingProgramError)) return true
        onMissing?.(program)
        return false
      },
    )
    checks.set(program, check)
  }
  return check
}

const timeoutFor = (input: VideoInput) => ('path' in input ? LIMITS.local : LIMITS.remote)

/** Dossier temporaire, supprimé après usage. */
async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'swatter-video-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Fichier produit, ou null s'il manque ou s'il est vide (vidéo plus courte que le point de départ…). */
async function output(file: string, minBytes: number): Promise<Buffer | null> {
  const data = await readFile(file).catch(() => null)
  return data && data.length >= minBytes ? data : null
}

/** Durée et dimensions d'une vidéo ; erreur si ffprobe est absent ou si la vidéo est illisible. */
export async function probeVideo(input: VideoInput): Promise<VideoProbe> {
  return parseProbe(await exec(ffprobeBin(), probeArgs(input), 'path' in input ? LIMITS.probe : LIMITS.remoteProbe))
}

/** Couverture JPEG 16:9 tirée de la vidéo : image représentative après ~1 s (dès le début pour une vidéo très courte). */
export async function videoCover(input: VideoInput, probe: VideoProbe | null): Promise<Buffer> {
  const size = coverSize(probe)
  return inTempDir(async (dir) => {
    const file = path.join(dir, 'couverture.jpg')
    const short = probe?.duration !== null && probe?.duration !== undefined && probe.duration < 2
    if (!short) {
      await ffmpeg(coverArgs(input, file, size, 1), timeoutFor(input))
      const cover = await output(file, 1000)
      if (cover) return cover
    }
    // vidéo de moins d'une seconde ou deux : rien après 1 s, image prise dès le début
    await ffmpeg(coverArgs(input, file, size, 0), timeoutFor(input))
    const cover = await output(file, 1000)
    if (!cover) throw new Error('aucune image dans la vidéo')
    return cover
  })
}

/** Aperçu animé (MP4 H.264 muet, 960×540, 5 s) pris vers 10 % de la durée. */
export async function videoClip(input: VideoInput, probe: VideoProbe | null): Promise<Buffer> {
  return inTempDir(async (dir) => {
    const file = path.join(dir, 'apercu.mp4')
    await ffmpeg(clipArgs(input, file, clipStart(probe?.duration ?? null)), timeoutFor(input))
    const clip = await output(file, 2000)
    if (!clip) throw new Error('aucune image dans l’extrait')
    return clip
  })
}

/** Diaporama animé (MP4 H.264 muet, 960×540) à partir d'images JPEG. */
export async function slideshow(images: Buffer[]): Promise<Buffer> {
  return inTempDir(async (dir) => {
    const files = images.map((_, i) => path.join(dir, `image-${i + 1}.jpg`))
    await Promise.all(images.map((image, i) => writeFile(files[i], image)))
    const file = path.join(dir, 'apercu.mp4')
    await ffmpeg(slideshowArgs(files, file), LIMITS.local)
    const clip = await output(file, 2000)
    if (!clip) throw new Error('diaporama vide')
    return clip
  })
}
