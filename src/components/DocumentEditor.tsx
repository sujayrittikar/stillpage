import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, type Editor } from '@tiptap/react'
import { readDocument, saveDocument, type LoadedDocument, type Saved } from '../lib/files'
import { getItem, refreshFromDisk } from '../lib/library'
import type { Item } from '../lib/types'
import { Loading } from './DocView'
import { useRichEditor } from './RichText'

// Rewriting a whole document takes a moment; wait for a pause in typing.
const SAVE_AFTER = 1200

type Status = Saved['state'] | 'saving' | 'idle'

/** Edits a Word (.docx) or LibreOffice (.odt) document as a page and saves
 *  it back in its own format as you go. The first save keeps a backup of the
 *  original, since layout details the editor doesn't know are not carried. */
export function DocumentEditor({ item }: { item: Item }) {
  const [doc, setDoc] = useState<(LoadedDocument & { version: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const latest = useRef<Editor | null>(null)
  const mtime = useRef<number | undefined>(undefined)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef(false)

  const load = useCallback(async () => {
    try {
      await refreshFromDisk(item.id)
      const fresh = getItem(item.id) ?? item
      const loaded = await readDocument(fresh)
      mtime.current = fresh.mtime
      pending.current = false
      setDoc((d) => ({ ...loaded, version: (d?.version ?? 0) + 1 }))
      setConflict(false)
    } catch (e) {
      setError((e as Error).message)
    }
    // Reload only when the document itself changes, not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    async (force = false) => {
      window.clearTimeout(timer.current)
      const editor = latest.current
      if (!pending.current || !editor || editor.isDestroyed) return
      pending.current = false
      setStatus('saving')
      const json = editor.getJSON()
      const { writeDocx } = await import('../lib/write/docx')
      const { writeOdt } = await import('../lib/write/odt')
      const bytes = item.ext === 'odt' ? await writeOdt(json) : await writeDocx(json)
      const result = await saveDocument(item.id, bytes, mtime.current, force)
      if (result.state === 'conflict') {
        pending.current = true
        setConflict(true)
        setStatus('idle')
        return
      }
      if (result.state === 'saved') mtime.current = result.mtime
      setMessage(result.state === 'error' ? result.message : null)
      setStatus(result.state)
    },
    [item.id, item.ext],
  )

  const change = useCallback(
    (editor: Editor) => {
      latest.current = editor
      pending.current = true
      setStatus('idle')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void save(), SAVE_AFTER)
    },
    [save],
  )

  // Leaving (closing the tab, switching to Reading) saves what's left.
  useEffect(() => () => void save(), [save])

  // Coming back to the window: pick up changes made in another program.
  useEffect(() => {
    const onFocus = async () => {
      if (!item.path || !window.stillpage?.statFile) return
      const stat = await window.stillpage.statFile(item.path)
      if (!stat || mtime.current === undefined || Math.abs(stat.mtime - mtime.current) <= 1) return
      if (pending.current) setConflict(true)
      else void load()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [item.path, load])

  if (error) return <p className="viewer-empty">{error}</p>
  if (!doc) return <Loading />

  const kind = item.ext === 'odt' ? 'LibreOffice document' : 'Word document'
  return (
    <div className="file-edit">
      <div className="file-bar">
        <span className={`file-status ${status}`} title={item.path ?? 'Kept in Stillpage’s library'}>
          {statusText(status, message, Boolean(item.path), kind)}
        </span>
        <span className="file-note">
          Keeps text, headings, lists, tables, links and images
          {doc.dropped.length > 0 ? `; this file's ${list(doc.dropped)} won't be kept` : ''}. The original is backed up first.
        </span>
        {window.stillpage?.showBackups && (
          <button className="text-btn" onClick={() => void window.stillpage?.showBackups()}>
            Backups
          </button>
        )}
      </div>
      {conflict && (
        <div className="file-conflict" role="alert">
          <span>This file changed on disk while you were editing.</span>
          <button className="btn small quiet" onClick={() => void load()}>
            Load the disk version
          </button>
          <button className="btn small" onClick={() => void save(true)}>
            Keep mine
          </button>
        </div>
      )}
      <div className="file-body">
        <Page key={doc.version} html={doc.html} onChange={change} />
      </div>
    </div>
  )
}

const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

function statusText(status: Status, message: string | null, onDisk: boolean, kind: string): string {
  switch (status) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return `Saved to the ${kind}`
    case 'library':
      return 'Saved in Stillpage'
    case 'error':
      return message ?? 'Not saved'
    default:
      return onDisk ? `Edits save to the ${kind} as you type` : 'Edits are kept in Stillpage'
  }
}

function Page({ html, onChange }: { html: string; onChange: (editor: Editor) => void }) {
  const { editor, overlay } = useRichEditor({ text: html, html: true, images: true, onChange: (_md, ed) => onChange(ed), placeholder: 'Start writing.' })
  if (!editor) return null
  return (
    <>
      <div className="scroll note-write" data-scroll onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <EditorContent editor={editor} />
      </div>
      {overlay}
    </>
  )
}
