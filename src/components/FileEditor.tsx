import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent } from '@tiptap/react'
import { Lexer, type Token } from 'marked'
import { readDocText, saveDocText, splitFrontMatter, type Saved } from '../lib/files'
import type { Item } from '../lib/types'
import { CodeEditor } from './CodeEditor'
import { Loading } from './DocView'
import { useRichEditor } from './RichText'

const SAVE_AFTER = 600

/** Why a Markdown file can't be written as a page without losing something,
 *  or null when it can. */
function richBlocker(md: string): string | null {
  let found: string | null = null
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      if (found) return
      if (t.type === 'html') found = 'HTML'
      else if (t.type === 'image') found = 'images'
      const nested = (t as { tokens?: Token[] }).tokens
      if (nested) walk(nested)
      if (t.type === 'list') walk((t as { items: Token[] }).items)
      if (t.type === 'table') {
        const table = t as unknown as { header: { tokens: Token[] }[]; rows: { tokens: Token[] }[][] }
        walk(table.header.flatMap((c) => c.tokens))
        walk(table.rows.flat().flatMap((c) => c.tokens))
      }
    }
  }
  try {
    const tokens = new Lexer({ gfm: true }).lex(md)
    walk(tokens)
    if (!found && Object.keys(tokens.links).length) found = 'reference links'
    if (!found && /\[\^[^\]]+\]/.test(md)) found = 'footnotes'
  } catch {
    found = 'unusual Markdown'
  }
  return found
}

type Status = Saved['state'] | 'saving' | 'idle'

interface Props {
  item: Item
  /** 'page' writes Markdown as a page; 'source' edits the text itself. */
  mode: 'page' | 'source'
}

/** Edits a document's text and saves it back to its file as you go. */
export function FileEditor({ item, mode }: Props) {
  const [loaded, setLoaded] = useState<{ text: string; mtime?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  // The words as they are now, and the file's time when we last agreed with it.
  const latest = useRef<string | null>(null)
  const mtime = useRef<number | undefined>(undefined)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef(false)

  const load = useCallback(async () => {
    try {
      const doc = await readDocText(item)
      mtime.current = doc.mtime
      latest.current = doc.text
      pending.current = false
      setLoaded(doc)
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
      if (!pending.current || latest.current === null) return
      pending.current = false
      setStatus('saving')
      const result = await saveDocText(item.id, latest.current, mtime.current, force)
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
    [item.id],
  )

  const change = useCallback(
    (text: string) => {
      latest.current = text
      pending.current = true
      setStatus('idle')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void save(), SAVE_AFTER)
    },
    [save],
  )

  // Leaving (closing the tab, switching to Read) saves what's left.
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

  const { front, body } = loaded ? splitFrontMatter(loaded.text) : { front: '', body: '' }
  const blocker = loaded && item.format === 'md' && mode === 'page' ? richBlocker(body) : null
  const asPage = item.format === 'md' && mode === 'page' && !blocker

  if (error) return <p className="viewer-empty">{error}</p>
  if (!loaded) return <Loading />

  return (
    <div className="file-edit">
      <div className="file-bar">
        <span className={`file-status ${status}`} title={item.path ?? 'Kept in Stillpage’s library'}>
          {statusText(status, message, Boolean(item.path))}
        </span>
        {blocker && <span className="file-note">Editing as text: this file has {blocker}, which the page editor would drop.</span>}
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
        {asPage ? (
          <PageEditor key={`${item.id}:${loaded.mtime}`} text={body} onChange={(md) => change(front + md)} />
        ) : (
          <CodeEditor
            key={`${item.id}:${mode}`}
            text={loaded.text}
            filename={`${item.title}.${item.ext ?? 'txt'}`}
            prose={item.format === 'md' || item.format === 'txt'}
            onChange={change}
          />
        )}
      </div>
    </div>
  )
}

function statusText(status: Status, message: string | null, onDisk: boolean): string {
  switch (status) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved to the file'
    case 'library':
      return 'Saved in Stillpage'
    case 'error':
      return message ?? 'Not saved'
    default:
      return onDisk ? 'Edits save to the file as you type' : 'Edits are kept in Stillpage'
  }
}

/** Markdown written as a page, like a note. */
function PageEditor({ text, onChange }: { text: string; onChange: (md: string) => void }) {
  const { editor, overlay } = useRichEditor({ text, onChange, placeholder: 'Start writing.' })
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
