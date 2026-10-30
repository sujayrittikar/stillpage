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
function persist() {
  void db.set('items', items)
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
  items[id] = { id, kind: 'note', title: titleFromText(initial), createdAt: now, updatedAt: now, lastOpenedAt: now }
  notes.set(id, initial)
  void db.set('note:' + id, initial)
  emit()
  persist()
  return id
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
  saveTimers.set(
    id,
    window.setTimeout(() => {
      void db.set('note:' + id, text)
      if (items[id]) {
        items[id] = { ...items[id], title: titleFromText(text), updatedAt: Date.now() }
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
