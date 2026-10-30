import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  library: <><path d="M4 4.5v15M8 4.5v15" /><path d="m12.2 5.2 3.6-1 4 14.6-3.6 1z" /></>,
  open: <><path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z" /><path d="M12 16.5v-6m-2.5 2.5L12 10.5l2.5 2.5" /></>,
  note: <><path d="M14.5 4.5 19.5 9.5 9 20H4v-5z" /><path d="m12.5 6.5 5 5" /></>,
  split: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M12 4.5v15" /></>,
  type: <><path d="M4 18 8.5 6h1L14 18M5.6 14h6.8" /><path d="M16.5 11.5c.6-.7 1.4-1 2.3-1 1.5 0 2.2.9 2.2 2.3V18m0-3.4c-.6-.2-1.3-.3-2-.3-1.6 0-2.7.7-2.7 1.9 0 1 .8 1.8 2 1.8 1.4 0 2.7-.9 2.7-2.6" /></>,
  timer: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M10 2.5h4" /></>,
  zen: <path d="M17.6 6.2A7.8 7.8 0 1 0 19.8 12" />,
  close: <path d="m6.5 6.5 11 11m0-11-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: <><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  pause: <><path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth="2.6" /></>,
  prev: <><path d="M17.5 6v12L9 12z" fill="currentColor" /><path d="M6.5 6v12" strokeWidth="2" /></>,
  next: <><path d="M6.5 6v12L15 12z" fill="currentColor" /><path d="M17.5 6v12" strokeWidth="2" /></>,
  music: <><path d="M9 17.5V6l10-2v11.5" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="15.5" r="2.5" /></>,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7" /></>,
  download: <><path d="M12 4v11m-4-4 4 4 4-4M5 19.5h14" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4 4" /></>,
  screens: (
    <>
      <rect x="2.5" y="5" width="8.5" height="11" rx="1.5" />
      <rect x="13" y="5" width="8.5" height="11" rx="1.5" />
      <path d="M6.75 19.5h10.5" />
    </>
  ),
  page: <><path d="M6.5 3.5h7.5l4 4v13h-11.5z" /><path d="M13.5 3.5v4.5h4.5M9.5 12h5M9.5 15h5M9.5 18h3" /></>,
  fullscreen: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  read: <><path d="M3.5 6.5c3-1.2 5.8-1.2 8.5 1 2.7-2.2 5.5-2.2 8.5-1v12c-3-1.2-5.8-1.2-8.5 1-2.7-2.2-5.5-2.2-8.5-1z" /><path d="M12 7.5v12" /></>,
  write: <><path d="M4 7h16M4 12h10M4 17h7" /></>,
  code: <path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5" />,
  both: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M12 4.5v15M6 9h3.5M6 12h3.5M14.5 9H18M14.5 12H18" /></>,
  quote: <><path d="M5 18c0-4 1-7.5 4.5-9.5M13.5 18c0-4 1-7.5 4.5-9.5" /><path d="M5 18h4v-4H5zM13.5 18h4v-4h-4z" /></>,
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="1.8" />,
  device: <><rect x="6" y="3.5" width="12" height="17" rx="2" /><circle cx="12" cy="14" r="2.8" /><path d="M12 7.5h.01" strokeWidth="2" /></>,
  volume: <><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8" strokeWidth="1.8" /></>,
}

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

/** The ensō: one unclosed brush circle. Used as the mark and the zen-mode moment. */
export function Enso({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path
        className="enso-stroke"
        d="M62 14C40 8 16 22 13 47c-3 24 14 41 35 41 22 0 38-16 38-37 0-12-5-22-13-28"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        pathLength={1}
      />
      <path
        className="enso-dry"
        d="M64 17C44 12 21 25 18 47c-2 21 13 36 31 36"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.35"
        pathLength={1}
      />
    </svg>
  )
}
