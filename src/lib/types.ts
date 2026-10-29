export type Format =
  | 'md'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'sheet'
  | 'epub'
  | 'html'
  | 'txt'
  | 'code'
  | 'image'
  | 'odt'
  | 'rtf'
  | 'ipynb'

export interface Item {
  id: string
  kind: 'doc' | 'note'
  title: string
  format?: Format
  ext?: string
  size?: number
  fingerprint?: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export interface Pane {
  id: string
  tabs: string[]
  active: string | null
  size: number
}

export interface Layout {
  panes: Pane[]
  focused: string
}

export type ThemeName = 'stone' | 'linen' | 'mist' | 'dusk'

export interface Prefs {
  theme: ThemeName
  fontSize: number
  measure: number
  lineHeight: number
  font: 'serif' | 'sans'
  pdfTint: boolean
}

export interface Slide {
  index: number
  title: string
  blocks: SlideBlock[]
  notes: string
}

export type SlideBlock =
  | { kind: 'p'; text: string; level: number; bullet: boolean }
  | { kind: 'img'; src: string }
  | { kind: 'table'; rows: string[][] }

export interface Sheet {
  name: string
  rows: string[][]
}

export type Rendered =
  | { type: 'html'; html: string; variant?: 'code' | 'plain' }
  | { type: 'pdf'; data: ArrayBuffer }
  | { type: 'slides'; slides: Slide[] }
  | { type: 'sheet'; sheets: Sheet[] }
  | { type: 'image'; url: string }

export interface DesktopFile {
  name: string
  data: Uint8Array
  lastModified: number
}

declare global {
  interface Window {
    stillpage?: {
      platform: string
      takePendingFiles: () => Promise<DesktopFile[]>
      onOpenFiles: (cb: (files: DesktopFile[]) => void) => () => void
      spotifyAuth: (url: string) => Promise<string | null>
      drmStatus: () => Promise<'ready' | 'unavailable'>
      openExternal: (url: string) => Promise<void>
    }
  }
}
