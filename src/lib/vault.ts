import { useSyncExternalStore } from 'react'
import { detectFormat } from './formats'
import { importFiles, renamePath, useItems } from './library'
import type { VaultScan } from './types'

/** A file in the open folder that Stillpage can show. */
export interface VaultFile {
  path: string
  rel: string
  name: string
  /** Folders above it, relative to the vault, e.g. "Courses/Physics". */
  dir: string
  size: number
  mtime: number
}

export interface Vault {
  root: string
  name: string
  files: VaultFile[]
  truncated: boolean
}

const KEY = 'stillpage.vault'

let current: Vault | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function fromScan(scan: VaultScan): Vault {
  const files = scan.files
    .filter((f) => detectFormat(f.rel))
    .map((f) => {
      const slash = f.rel.lastIndexOf('/')
      return { path: `${scan.root}/${f.rel}`, rel: f.rel, name: f.rel.slice(slash + 1), dir: slash < 0 ? '' : f.rel.slice(0, slash), size: f.size, mtime: f.mtime }
    })
    .sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' }))
  return { root: scan.root, name: scan.name, files, truncated: scan.truncated }
}

/** Opens a folder as the vault, replacing any other. Returns false if it
 *  couldn't be opened. */
export async function openVault(root: string): Promise<boolean> {
  const scan = await window.stillpage?.vault?.open(root)
  if (!scan) return false
  current = fromScan(scan)
  try {
    localStorage.setItem(KEY, scan.root)
  } catch {
    /* opened, just not remembered */
  }
  emit()
  return true
}

export async function closeVault() {
  await window.stillpage?.vault?.open(null)
  current = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to forget */
  }
  emit()
}

async function rescan() {
  const scan = await window.stillpage?.vault?.scan()
  if (!scan || scan.root !== current?.root) return
  const before = current
  current = fromScan(scan)
  // Files renamed or moved outside Stillpage: follow them when we can tell
  // which is which (one file gone, one with the same size and time arrived).
  const gone = before.files.filter((f) => !current!.files.some((g) => g.path === f.path))
  const arrived = current.files.filter((f) => !before.files.some((g) => g.path === f.path))
  for (const old of gone) {
    const twin = arrived.find((f) => f.size === old.size && Math.abs(f.mtime - old.mtime) < 2)
    if (twin) renamePath(old.path, twin.path)
  }
  emit()
}

/** Reopens last session's folder and keeps the vault in step with the disk. */
export function startVault() {
  const bridge = window.stillpage
  if (!bridge?.vault) return () => {}
  let saved: string | null = null
  try {
    saved = localStorage.getItem(KEY)
  } catch {
    /* no folder to reopen */
  }
  if (saved) void openVault(saved)
  const offChanged = bridge.vault.onChanged(() => void rescan())
  // Coming back to the window catches anything the watcher missed.
  const onFocus = () => current && void rescan()
  window.addEventListener('focus', onFocus)
  return () => {
    offChanged()
    window.removeEventListener('focus', onFocus)
  }
}

export function useVault(): Vault | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** Brings a vault file into the library (once) and returns its id. */
export async function itemForFile(file: string): Promise<string | null> {
  const [data] = (await window.stillpage?.readFiles([file])) ?? []
  if (!data) return null
  const { ids } = await importFiles([new File([data.data as BlobPart], data.name, { lastModified: data.lastModified })], [file])
  return ids[0] ?? null
}

/** Makes a new Markdown note called `name` in the vault (in `dir`, relative)
 *  and returns its path. A name already taken gets a number. */
export async function newVaultNote(name: string, dir = ''): Promise<string | null> {
  const file = await window.stillpage?.vault?.create(dir, name, '')
  if (file) await rescan()
  return file ?? null
}

export async function renameVaultFile(file: string, name: string): Promise<string | null> {
  const result = await window.stillpage?.vault?.rename(file, name)
  if (!result) return null
  if (typeof result !== 'string') {
    window.dispatchEvent(new CustomEvent('stillpage:toast', { detail: result.error }))
    return null
  }
  renamePath(file, result)
  await rescan()
  return result
}

export async function trashVaultFile(file: string): Promise<boolean> {
  const ok = await window.stillpage?.vault?.trash(file)
  if (ok) await rescan()
  return Boolean(ok)
}

/** The library item already open for a vault file, if any. */
export function useOpenedPaths(): Map<string, string> {
  const items = useItems()
  const map = new Map<string, string>()
  for (const item of Object.values(items)) if (item.path) map.set(item.path, item.id)
  return map
}
