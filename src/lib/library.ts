import { useSyncExternalStore } from 'react'
import { db, uid } from './db'
import { detectFormat, extOf } from './formats'
import type { Item } from './types'

// ---- Items (documents + notes metadata) -----------------------------------

let items: Record<string, Item> = {}
const listeners = new Set<() => void>()

function emit() {
  items = { ...items }
  listeners.forEach((l) => l())
}
// A new note stays a draft, in memory only, until it gets words or a name.
// Opening "New note" and walking away leaves nothing behind.
function persist() {
  void db.set('items', Object.fromEntries(Object.entries(items).filter(([, i]) => !i.draft)))
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export async function loadLibrary() {
  items = (await db.get<Record<string, Item>>('items')) ?? {}
  emit()
}

export function useItems(): Record<string, Item> {
  return useSyncExternalStore(subscribe, () => items)
}

export function getItem(id: string): Item | undefined {
  return items[id]
}

export function touchItem(id: string) {
  if (!items[id]) return
  items[id] = { ...items[id], lastOpenedAt: Date.now() }
  emit()
  persist()
}

export interface ImportResult {
  ids: string[]
  rejected: string[]
}

/** Imports files into the library. `paths` gives where each came from on
 *  disk when the caller knows; otherwise the desktop bridge is asked. */
export async function importFiles(files: File[], paths: (string | undefined)[] = []): Promise<ImportResult> {
  const ids: string[] = []
  const rejected: string[] = []
  for (const [i, file] of files.entries()) {
    const format = detectFormat(file.name)
    if (!format) {
      rejected.push(`${file.name} is not a format Stillpage can read yet.`)
      continue
    }
    const path = paths[i] || window.stillpage?.pathForFile?.(file) || undefined
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`
    // The same file again, even if it has changed since: refresh our copy.
    const existing = Object.values(items).find((it) => (path && it.path === path) || it.fingerprint === fingerprint)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        await db.set('blob:' + existing.id, file)
        forgetRendered(existing.id)
      }
      items[existing.id] = { ...existing, path: path ?? existing.path, mtime: file.lastModified, size: file.size, fingerprint }
      ids.push(existing.id)
      continue
    }
    const id = uid()
    await db.set('blob:' + id, file)
    const now = Date.now()
    items[id] = {
      id,
      kind: 'doc',
      title: file.name.replace(/\.[^.]+$/, ''),
      format,
      ext: extOf(file.name),
      size: file.size,
      fingerprint,
      ...(path && { path, mtime: file.lastModified }),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }
    ids.push(id)
  }
  emit()
  persist()
  return { ids, rejected }
}

export function getBlob(id: string): Promise<Blob | undefined> {
  return db.get<Blob>('blob:' + id)
}

// The renderer's parsed copy of each document; set by render.ts so a changed
// file is parsed again.
let forgetRendered: (id: string) => void = () => {}
export function onContentChanged(forget: (id: string) => void) {
  forgetRendered = forget
}

/** Replaces a document's text after it was edited here or changed on disk. */
export function setDocText(id: string, text: string, mtime?: number) {
  return setDocBlob(id, new Blob([text], { type: 'text/plain' }), mtime)
}

/** Replaces a document's content (a rewritten .docx, say) in the library. */
export async function setDocBlob(id: string, blob: Blob, mtime?: number) {
  const item = items[id]
  if (!item) return
  await db.set('blob:' + id, blob)
  forgetRendered(id)
  const name = `${item.title}.${item.ext ?? 'txt'}`
  items[id] = { ...item, size: blob.size, mtime: mtime ?? item.mtime, fingerprint: `${name}:${blob.size}:${mtime ?? Date.now()}`, updatedAt: Date.now() }
  emit()
  persist()
}

/** A file moved or renamed on disk: the documents that point at it follow. */
export function renamePath(from: string, to: string) {
  let moved = false
  for (const item of Object.values(items)) {
    if (item.path !== from) continue
    const name = to.split('/').pop() ?? item.title
    items[item.id] = { ...item, path: to, title: name.replace(/\.[^.]+$/, ''), ext: extOf(name) }
    moved = true
  }
  if (!moved) return
  emit()
  persist()
}

/** Reads a document that lives on disk again if it changed there. Returns
 *  true when it did. */
export async function refreshFromDisk(id: string): Promise<boolean> {
  const item = items[id]
  const bridge = window.stillpage
  if (!item?.path || !bridge?.statFile) return false
  const stat = await bridge.statFile(item.path)
  if (!stat || (item.mtime !== undefined && Math.abs(stat.mtime - item.mtime) <= 1)) return false
  const name = item.path.split('/').pop() ?? item.title
  const [file] = await bridge.readFiles([item.path])
  if (!file) return false
  await db.set('blob:' + id, new File([file.data as BlobPart], name, { lastModified: stat.mtime }))
  forgetRendered(id)
  items[id] = { ...item, mtime: stat.mtime, size: stat.size, fingerprint: `${name}:${stat.size}:${stat.mtime}`, updatedAt: Date.now() }
  emit()
  persist()
  return true
}

/** The author's-layout PDF LibreOffice made for a document, kept so each file
 *  is converted once. */
export function getOriginal(id: string): Promise<Blob | undefined> {
  return db.get<Blob>('original:' + id)
}

export function setOriginal(id: string, pdf: Blob): Promise<void> {
  return db.set('original:' + id, pdf)
}

export function dropOriginal(id: string): Promise<void> {
  return db.del('original:' + id)
}

export function createNote(initial = ''): string {
  const id = uid()
  const now = Date.now()
  const draft = !initial.trim()
  items[id] = { id, kind: 'note', title: titleFromText(initial), createdAt: now, updatedAt: now, lastOpenedAt: now, ...(draft && { draft }) }
  notes.set(id, initial)
  if (!draft) void db.set('note:' + id, initial)
  emit()
  persist()
  return id
}

/** Names a note. A named note keeps its name instead of following its first line. */
export function renameItem(id: string, title: string) {
  const item = items[id]
  const name = title.trim().slice(0, 120)
  if (!item || !name || name === item.title) return
  items[id] = { ...item, title: name, named: true, draft: undefined, updatedAt: Date.now() }
  if (item.draft) void db.set('note:' + id, notes.get(id) ?? '')
  emit()
  persist()
}

/** Forgets drafts that are no longer open anywhere. */
export function discardDrafts(open: Set<string>) {
  const gone = Object.values(items).filter((i) => i.draft && !open.has(i.id))
  if (!gone.length) return
  for (const i of gone) {
    delete items[i.id]
    notes.delete(i.id)
  }
  emit()
}

export async function removeItem(id: string) {
  const item = items[id]
  if (!item) return
  delete items[id]
  // A save still waiting would write the note back after it's gone.
  window.clearTimeout(saveTimers.get(id))
  emit()
  persist()
  await db.del(item.kind === 'note' ? 'note:' + id : 'blob:' + id)
  if (item.kind === 'doc') await db.del('original:' + id)
  notes.delete(id)
}

// ---- Note contents ---------------------------------------------------------

const notes = new Map<string, string>()
const noteListeners = new Map<string, Set<() => void>>()
const saveTimers = new Map<string, number>()

export function titleFromText(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0)
  if (!line) return 'Untitled note'
  return (
    line
      .replace(/^#+\s*/, '')
      .replace(/^>\s*/, '')
      // A formula reads as its source, without the dollar signs around it.
      .replace(/\$\$?((?:\\.|[^$\\])+?)\$\$?(?!\d)/g, (all, tex: string) => (/^\S/.test(tex) && /\S$/.test(tex) ? tex : all))
      .replace(/[*_`]/g, '')
      .trim()
      .slice(0, 60) || 'Untitled note'
  )
}

function notifyNote(id: string) {
  noteListeners.get(id)?.forEach((l) => l())
}

export async function loadNote(id: string): Promise<string> {
  if (!notes.has(id)) notes.set(id, (await db.get<string>('note:' + id)) ?? '')
  notifyNote(id)
  return notes.get(id)!
}

export function setNote(id: string, text: string) {
  notes.set(id, text)
  notifyNote(id)
  window.clearTimeout(saveTimers.get(id))
  if (items[id]?.draft && !text.trim()) return
  saveTimers.set(
    id,
    window.setTimeout(() => {
      void db.set('note:' + id, text)
      if (items[id]) {
        const item = items[id]
        items[id] = { ...item, title: item.named ? item.title : titleFromText(text), draft: undefined, updatedAt: Date.now() }
        emit()
        persist()
      }
    }, 400),
  )
}

export async function appendToNote(id: string, chunk: string) {
  const current = await loadNote(id)
  const sep = current.length === 0 || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'
  setNote(id, current + sep + chunk)
}

export function useNote(id: string): string | undefined {
  return useSyncExternalStore(
    (l) => {
      if (!noteListeners.has(id)) noteListeners.set(id, new Set())
      noteListeners.get(id)!.add(l)
      if (!notes.has(id)) void loadNote(id)
      return () => noteListeners.get(id)?.delete(l)
    },
    () => notes.get(id),
  )
}
