import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { EDITABLE, EDITABLE_DOCUMENTS } from '../lib/files'
import { HAS_ORIGINAL, kindName } from '../lib/formats'
import { refreshFromDisk } from '../lib/library'
import { NeedsOffice, renderItem } from '../lib/render'
import type { DocView as View, Item, Prefs, Rendered } from '../lib/types'
import { Enso, Icon } from './Icon'
import { HtmlDoc } from './viewers/HtmlDoc'
import { ImageViewer } from './viewers/ImageViewer'
import { SheetViewer } from './viewers/SheetViewer'
import { SlidesViewer } from './viewers/SlidesViewer'

const PdfViewer = lazy(() => import('./viewers/PdfViewer'))
const FileEditor = lazy(() => import('./FileEditor').then((m) => ({ default: m.FileEditor })))
const DocumentEditor = lazy(() => import('./DocumentEditor').then((m) => ({ default: m.DocumentEditor })))

/** Reading a text file, or editing it: as a page (Markdown) or as text. */
type Mode = 'read' | 'edit' | 'source'
const modeKey = (id: string) => `stillpage.mode.${id}`

function readMode(id: string): Mode {
  try {
    const m = localStorage.getItem(modeKey(id))
    return m === 'edit' || m === 'source' ? m : 'read'
  } catch {
    return 'read'
  }
}

export function Loading({ slowly }: { slowly?: string }) {
  // Converting with LibreOffice can take a few seconds the first time; say so
  // rather than leave a silent spinner.
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!slowly) return
    const t = setTimeout(() => setLate(true), 1200)
    return () => clearTimeout(t)
  }, [slowly])
  return (
    <div className="viewer-loading" aria-label="Opening">
      <Enso size={44} className="breathing" />
      {late && <p className="loading-note">{slowly}</p>}
    </div>
  )
}

const viewKey = (id: string) => `stillpage.view.${id}`

function readView(id: string): View {
  try {
    return localStorage.getItem(viewKey(id)) === 'original' ? 'original' : 'reading'
  } catch {
    return 'reading'
  }
}

/** Shown when a file needs LibreOffice and it isn't installed. */
function OfficeMissing({ item, onRetry, onReading }: { item: Item; onRetry: () => void; onReading?: () => void }) {
  const [install, setInstall] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    void window.stillpage?.officeStatus().then((s) => setInstall(s.install))
  }, [])
  const kind = kindName(item.ext ?? '')
  return (
    <div className="office-missing">
      <Enso size={40} />
      <h2>{onReading ? 'The original layout needs LibreOffice' : `This ${kind} needs LibreOffice`}</h2>
      <p>
        {onReading
          ? 'Stillpage asks LibreOffice, the free office suite, to draw the pages exactly as the author laid them out.'
          : `Stillpage opens ${kind}s through LibreOffice, the free office suite. Install it once and every file like this opens here, page for page.`}
      </p>
      {install && (
        <div className="command">
          <code>{install}</code>
          <button
            className="btn small quiet"
            onClick={() => {
              void navigator.clipboard.writeText(install).then(() => setCopied(true))
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div className="office-actions">
        <button className="btn small" onClick={onRetry}>
          I've installed it
        </button>
        {onReading && (
          <button className="btn small quiet" onClick={onReading}>
            Back to reading view
          </button>
        )}
      </div>
    </div>
  )
}

/** Scroll container with a hairline reading-progress indicator. */
export function ScrollArea({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  return (
    <div
      ref={ref}
      className={`scroll ${className}`}
      data-scroll
      onScroll={(e) => {
        const el = e.currentTarget
        const max = el.scrollHeight - el.clientHeight
        setProgress(max > 0 ? el.scrollTop / max : 0)
      }}
    >
      <div className="progress" style={{ transform: `scaleX(${progress})` }} />
      {children}
    </div>
  )
}

export function DocView({ item, prefs }: { item: Item; prefs: Prefs }) {
  const [view, setViewState] = useState<View>(() => readView(item.id))
  const [mode, setModeState] = useState<Mode>(() => readMode(item.id))
  const editable = EDITABLE.has(item.format!)
  // Word and LibreOffice documents are edited as a page and saved in their
  // own format. Only on the desktop, where there's a file to save to.
  const docEditable = EDITABLE_DOCUMENTS.has(item.ext ?? '') && Boolean(window.stillpage?.writeDocument)
  const editing = (editable || docEditable) && mode !== 'read'

  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem(modeKey(item.id), m)
    } catch {
      /* not remembered, still switched */
    }
  }

  // A file that lives on disk may have changed since we last read it:
  // check when it's opened and whenever you come back to the window.
  useEffect(() => {
    if (!item.path) return
    const check = () => void refreshFromDisk(item.id)
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [item.id, item.path])
  const [attempt, setAttempt] = useState(0)
  // Each result remembers which view and attempt it answers, so switching
  // views shows the loader instead of the previous view's pages.
  const [result, setResult] = useState<{ key: string; rendered?: Rendered; error?: Error } | null>(null)
  const switchable = HAS_ORIGINAL.has(item.format ?? '') && Boolean(window.stillpage)
  const effective: View = item.format === 'office' ? 'original' : switchable ? view : 'reading'

  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(viewKey(item.id), v)
    } catch {
      /* not remembered, still switched */
    }
  }

  const key = `${item.id}:${effective}:${attempt}:${item.fingerprint}`
  useEffect(() => {
    if (editing) return
    let alive = true
    renderItem(item, effective).then(
      (r) => alive && setResult({ key, rendered: r }),
      (e: Error) => alive && setResult({ key, error: e }),
    )
    return () => {
      alive = false
    }
  }, [item, effective, key, editing])
  const current = result?.key === key ? result : null
  const rendered = current?.rendered ?? null
  const error = current?.error ?? null

  const modes: Mode[] = item.format === 'md' ? ['read', 'edit', 'source'] : ['read', 'edit']
  const modeSwitch = editable && (
    <div className="view-switch segmented" role="radiogroup" aria-label="Read or edit">
      {modes.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          className={mode === m ? 'on' : ''}
          onClick={() => setMode(m)}
          title={m === 'read' ? 'Read it, typeset' : m === 'edit' ? (item.format === 'md' ? 'Write in it like a page' : 'Edit the text') : 'Edit the Markdown itself'}
        >
          <Icon name={m === 'read' ? 'read' : m === 'edit' ? 'note' : 'code'} size={14} />
          <span>{m === 'read' ? 'Read' : m === 'edit' ? 'Edit' : 'Source'}</span>
        </button>
      ))}
    </div>
  )

  // Documents: read reflowed, see the original pages, or edit.
  const docSwitch = docEditable && (
    <div className="view-switch segmented" role="radiogroup" aria-label="How to show this document">
      {(['reading', 'original', 'edit'] as const)
        .filter((o) => o !== 'original' || switchable)
        .map((o) => {
          const on = o === 'edit' ? mode === 'edit' : mode !== 'edit' && effective === o
          return (
            <button
              key={o}
              role="radio"
              aria-checked={on}
              className={on ? 'on' : ''}
              onClick={() => {
                if (o === 'edit') return setMode('edit')
                setMode('read')
                setView(o)
              }}
              title={o === 'reading' ? 'Reflowed in your theme and text size' : o === 'original' ? 'The pages as the author laid them out' : 'Write in it; saves back to the file'}
            >
              <Icon name={o === 'reading' ? 'read' : o === 'original' ? 'page' : 'note'} size={14} />
              <span>{o === 'reading' ? 'Reading' : o === 'original' ? 'Original' : 'Edit'}</span>
            </button>
          )
        })}
    </div>
  )

  if (editing) {
    return (
      <div className="doc doc-edit" data-capture-source={item.title}>
        {docSwitch || modeSwitch}
        <Suspense fallback={<Loading />}>
          {docEditable ? <DocumentEditor key={item.id} item={item} /> : <FileEditor key={`${item.id}:${mode}`} item={item} mode={mode === 'edit' ? 'page' : 'source'} />}
        </Suspense>
      </div>
    )
  }

  const switcher = docSwitch || (switchable && (
    <div className="view-switch segmented" role="radiogroup" aria-label="How to show this document">
      {(['reading', 'original'] as View[]).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={effective === v}
          className={effective === v ? 'on' : ''}
          onClick={() => setView(v)}
          title={v === 'reading' ? 'Reflowed in your theme and text size' : 'The pages as the author laid them out'}
        >
          <Icon name={v === 'reading' ? 'read' : 'page'} size={14} />
          <span>{v === 'reading' ? 'Reading' : 'Original'}</span>
        </button>
      ))}
    </div>
  )) || modeSwitch

  if (error instanceof NeedsOffice) {
    return (
      <div className="doc doc-message">
        {switcher}
        <OfficeMissing item={item} onRetry={() => setAttempt((a) => a + 1)} onReading={switchable ? () => setView('reading') : undefined} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="doc doc-message">
        {switcher}
        <p className="viewer-empty">{error.message || 'This file could not be opened.'}</p>
      </div>
    )
  }
  if (!rendered) {
    return (
      <div className="doc doc-message">
        {switcher}
        <Loading slowly={effective === 'original' ? 'Laying out the original pages. The first time takes a few seconds.' : undefined} />
      </div>
    )
  }

  let body: ReactNode
  switch (rendered.type) {
    case 'html':
      body = (
        <ScrollArea>
          <HtmlDoc html={rendered.html} variant={rendered.variant} />
        </ScrollArea>
      )
      break
    case 'slides':
      body = (
        <ScrollArea>
          <SlidesViewer slides={rendered.slides} />
        </ScrollArea>
      )
      break
    case 'sheet':
      body = <SheetViewer sheets={rendered.sheets} />
      break
    case 'image':
      body = <ImageViewer url={rendered.url} title={item.title} />
      break
    case 'pdf':
      body = (
        <Suspense fallback={<Loading />}>
          <PdfViewer id={item.id} data={rendered.data} tint={prefs.pdfTint} />
        </Suspense>
      )
      break
  }
  return (
    <div className={`doc doc-${rendered.type}`} data-capture-source={item.title}>
      {switcher}
      {body}
    </div>
  )
}
