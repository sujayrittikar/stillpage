import { getBlob, getItem, setDocText } from './library'
import type { Format, Item } from './types'

/** Formats you can edit, as text. */
export const EDITABLE = new Set<Format>(['md', 'txt', 'code', 'html'])

export interface Loaded {
  text: string
  /** The file's modification time on disk, when it lives on disk. */
  mtime?: number
}

/** The document's current text: from disk when it lives there (so changes
 *  made elsewhere show up), otherwise the library's copy. */
export async function readDocText(item: Item): Promise<Loaded> {
  const bridge = window.stillpage
  if (item.path && bridge?.readTextFile) {
    const read = await bridge.readTextFile(item.path)
    if (read.text !== undefined) {
      if (read.mtime !== item.mtime) await setDocText(item.id, read.text, read.mtime)
      return { text: read.text, mtime: read.mtime }
    }
  }
  const blob = await getBlob(item.id)
  if (!blob) throw new Error('This file is no longer in your library. Open it again from disk.')
  return { text: await blob.text() }
}

export type Saved =
  | { state: 'saved'; mtime?: number }
  /** Kept in the library only: we don't know where the file is. */
  | { state: 'library' }
  | { state: 'conflict'; mtime: number }
  | { state: 'error'; message: string }

/** Saves edited text back to the file it came from, and to the library. */
export async function saveDocText(id: string, text: string, expectedMtime?: number, force = false): Promise<Saved> {
  const item = getItem(id)
  if (!item) return { state: 'error', message: 'This file is no longer in your library.' }
  const bridge = window.stillpage
  if (!item.path || !bridge?.writeTextFile) {
    await setDocText(id, text)
    return { state: 'library' }
  }
  const result = await bridge.writeTextFile(item.path, text, expectedMtime, force)
  if (result.conflict && result.mtime !== undefined) return { state: 'conflict', mtime: result.mtime }
  if (result.error) {
    // Keep the words even when the file can't take them.
    await setDocText(id, text)
    return { state: 'error', message: result.error }
  }
  await setDocText(id, text, result.mtime)
  return { state: 'saved', mtime: result.mtime }
}

/** Front matter is metadata for other tools; it's kept exactly as it was and
 *  left out of the writing view. */
export function splitFrontMatter(md: string): { front: string; body: string } {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(md)
  return m ? { front: m[0], body: md.slice(m[0].length) } : { front: '', body: md }
}
