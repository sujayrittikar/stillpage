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

export async function importFiles(files: File[]): Promise<ImportResult> {
  const ids: string[] = []
  const rejected: string[] = []
  for (const file of files) {
    const format = detectFormat(file.name)
    if (!format) {
      rejected.push(`${file.name} is not a format Stillpage can read yet.`)
      continue
    }
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`
    const existing = Object.values(items).find((i) => i.fingerprint === fingerprint)
    if (existing) {
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

/** The author's-layout PDF LibreOffice made for a document, kept so each file
 *  is converted once. */
export function getOriginal(id: string): Promise<Blob | undefined> {
  return db.get<Blob>('original:' + id)
}

export function setOriginal(id: string, pdf: Blob): Promise<void> {
  return db.set('original:' + id, pdf)
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
