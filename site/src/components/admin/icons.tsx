// Pictogrammes de l'administration (tracés simples, couleur héritée du texte).
import type { ReactNode } from 'react'

export type IconName =
  | 'video'
  | 'article'
  | 'event'
  | 'replay'
  | 'grid'
  | 'home'
  | 'weather'
  | 'ad'
  | 'webcam'
  | 'media'
  | 'live'
  | 'star'
  | 'flash'
  | 'external'
  | 'help'
  | 'dashboard'
  | 'copy'
  | 'arrow-left'
  | 'arrow-right'
  | 'tv'
  | 'page'
  | 'users'
  | 'member'
  | 'redirect'
  | 'mail'
  | 'download'
  | 'chart'

const PATHS: Record<IconName, ReactNode> = {
  video: (
    <>
      <rect x="2.5" y="5" width="14" height="14" rx="2.5" />
      <path d="m16.5 10 5-3v10l-5-3" />
    </>
  ),
  article: (
    <>
      <path d="M5 3.5h10l4 4V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20z" />
      <path d="M8.5 10.5h7M8.5 14h7M8.5 17.5h4" />
    </>
  ),
  event: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m12 12.6.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
    </>
  ),
  replay: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 3.5V8H8" />
      <path d="m10.5 9 4.5 3-4.5 3z" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M9 9v11M3 14.5h18" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  weather: (
    <>
      <path d="M8 4.5v1.5M3.6 8.7l1.3.75M12.4 8.7l-1.3.75" />
      <path d="M5.3 13.2A3.5 3.5 0 1 1 11.6 10" />
      <path d="M8.5 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.1A3 3 0 0 0 8.5 20z" />
    </>
  ),
  ad: (
    <>
      <path d="M4 9.5v5a1 1 0 0 0 1 1h2.5L14 19V5L7.5 8.5H5a1 1 0 0 0-1 1z" />
      <path d="M17.5 9a4 4 0 0 1 0 6M7.5 15.5 9 20.5" />
    </>
  ),
  webcam: (
    <>
      <circle cx="12" cy="10" r="6.5" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M7.5 21h9M12 16.5V21" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="m21 15.5-4.5-4.5L7 20" />
    </>
  ),
  live: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />,
  flash: <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.75.4-1.2.95-1.2 1.8v.5" />
      <circle cx="12" cy="17" r=".6" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12.5" height="12.5" rx="2" />
      <path d="M16 8V5.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M8 21h8M8.5 2.5 12 5.5l3.5-3" />
    </>
  ),
  page: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14.5 3.5V8H19M9 12h7M9 15.5h7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 20a6.5 6.5 0 0 0-2.5-5.1" />
    </>
  ),
  member: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.3 18.6a6.5 6.5 0 0 1 11.4 0" />
    </>
  ),
  redirect: <path d="M4 17V11a4 4 0 0 1 4-4h11M15 3l4 4-4 4M4 21h7" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11.5M7 10l5 5 5-5" />
      <path d="M4.5 17v2.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V17" />
    </>
  ),
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
}

export function AdminIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
