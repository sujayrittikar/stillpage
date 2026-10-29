import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getItem, setNote, useNote } from '../lib/library'
import { Icon } from './Icon'

type Mode = 'write' | 'read' | 'both'

function wrapSelection(ta: HTMLTextAreaElement, mark: string) {
  const { selectionStart: s, selectionEnd: e, value } = ta
  const picked = value.slice(s, e)
  ta.setRangeText(mark + picked + mark, s, e, picked ? 'select' : 'end')
  if (!picked) ta.setSelectionRange(s + mark.length, s + mark.length)
}

export function NoteEditor({ id, active }: { id: string; active: boolean }) {
  const text = useNote(id)
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('stillpage.noteMode') as Mode) || 'write')
  const [html, setHtml] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const writeScroll = useRef<HTMLDivElement>(null)
  const localEdit = useRef(false)
  const prevLength = useRef(text?.length ?? 0)

  useEffect(() => localStorage.setItem('stillpage.noteMode', mode), [mode])

  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${ta.scrollHeight}px`
  }, [text, mode])

  // Quotes added from a document arrive from outside: follow them to the end.
  useEffect(() => {
    if (text === undefined) return
    if (!localEdit.current && text.length > prevLength.current && prevLength.current > 0) {
      const el = writeScroll.current
      el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
    localEdit.current = false
    prevLength.current = text.length
  }, [text])

  useEffect(() => {
    if (mode === 'write' || text === undefined) return
    let alive = true
    void import('../lib/parse/markdown').then((m) => alive && setHtml(m.renderMarkdown(text)))
    return () => {
      alive = false
    }
  }, [text, mode])

  useEffect(() => {
    if (active && mode !== 'read' && text !== undefined && text.trim() === '') taRef.current?.focus()
  }, [active, mode, text])

  if (text === undefined) return null
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  const commit = (value: string) => {
    localEdit.current = true
    setNote(id, value)
  }

  const exportNote = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
    a.download = `${(getItem(id)?.title ?? 'note').replace(/[\\/:*?"<>|]/g, '-')}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className={`note mode-${mode}`}>
      <div className="note-bar">
        <div className="segmented" role="radiogroup" aria-label="Note view">
          {(['write', 'both', 'read'] as Mode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} title={m === 'both' ? 'Write and preview' : m === 'read' ? 'Preview' : 'Write'}>
              <Icon name={m} size={15} />
              <span>{m === 'both' ? 'Side by side' : m === 'read' ? 'Preview' : 'Write'}</span>
            </button>
          ))}
        </div>
        <span className="note-count">{words === 1 ? '1 word' : `${words.toLocaleString()} words`}</span>
        <button className="icon-btn" title="Export as Markdown" onClick={exportNote}>
          <Icon name="download" size={16} />
        </button>
      </div>
      <div className="note-body">
        {mode !== 'read' && (
          <div className="scroll note-write" ref={writeScroll} onClick={(e) => e.target === e.currentTarget && taRef.current?.focus()}>
            <textarea
              ref={taRef}
              value={text}
              spellCheck
              placeholder={'Start writing.\n\nSelect a passage in any document and choose “Add to note” to quote it here, with its page.'}
              onChange={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                const ta = e.currentTarget
                if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault()
                  ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end')
                  commit(ta.value)
                } else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'i')) {
                  e.preventDefault()
                  wrapSelection(ta, e.key === 'b' ? '**' : '_')
                  commit(ta.value)
                }
              }}
            />
          </div>
        )}
        {mode !== 'write' && (
          <div className="scroll note-read" data-scroll>
            {text.trim() ? <article className="prose" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="viewer-empty">Nothing written yet.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
