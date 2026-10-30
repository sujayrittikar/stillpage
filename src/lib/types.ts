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
  | 'odp'
  | 'office'
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
  /** Where the file lives on disk, when we know. Edits are saved there. */
  path?: string
  /** The file's modification time when we last read or wrote it. */
  mtime?: number
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  /** A note nobody has written in or named yet. Never saved. */
  draft?: boolean
  /** Named by hand, so the title no longer follows the first line. */
  named?: boolean
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

/** How a laid-out document is shown: reflowed in Stillpage's typography, or
 *  as the author's own pages (rendered by LibreOffice). */
export type DocView = 'reading' | 'original'

export type Rendered =
  | { type: 'html'; html: string; variant?: 'code' | 'plain' }
  | { type: 'pdf'; data: ArrayBuffer }
  | { type: 'slides'; slides: Slide[] }
  | { type: 'sheet'; sheets: Sheet[] }
  | { type: 'image'; url: string }

/** A folder opened as a vault, as the main process found it. */
export interface VaultScan {
  root: string
  name: string
  files: { rel: string; size: number; mtime: number }[]
  truncated: boolean
}

export interface DesktopFile {
  name: string
  path?: string
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
      spotifyWeb: {
        status: () => Promise<boolean>
        login: () => Promise<boolean>
        logout: () => Promise<boolean>
      }
      drmStatus: () => Promise<'ready' | 'unavailable'>
      spanScreens: (on?: boolean) => Promise<{ spanned: boolean; seams: number[] }>
      screenInfo: () => Promise<{ count: number; spanned: boolean }>
      onSpanChanged: (cb: (spanned: boolean) => void) => () => void
      exportPdf: (name: string, html: string) => Promise<string | null>
      saveFile: (name: string, text: string) => Promise<string | null>
      showInFolder: (file: string) => Promise<void>
      officeStatus: () => Promise<{ ready: boolean; install: string }>
      convertToPdf: (name: string, data: Uint8Array) => Promise<{ pdf?: Uint8Array; error?: string }>
      openExternal: (url: string) => Promise<void>
      pathForFile: (file: File) => string
      readTextFile: (file: string) => Promise<{ text?: string; mtime?: number; error?: string }>
      writeTextFile: (file: string, text: string, expectedMtime?: number, force?: boolean) => Promise<{ mtime?: number; conflict?: boolean; error?: string }>
      statFile: (file: string) => Promise<{ mtime: number; size: number } | null>
      readFiles: (files: string[]) => Promise<DesktopFile[]>
      pickFolder: () => Promise<string | null>
      takePendingFolder: () => Promise<string | null>
      onOpenFolder: (cb: (folder: string) => void) => () => void
      vault: {
        open: (root: string | null) => Promise<VaultScan | null>
        scan: () => Promise<VaultScan | null>
        create: (dir: string, name: string, text: string) => Promise<string | null>
        rename: (file: string, name: string) => Promise<string | { error: string } | null>
        trash: (file: string) => Promise<boolean>
        reveal: (file: string) => Promise<void>
        onChanged: (cb: () => void) => () => void
      }
    }
  }
}
