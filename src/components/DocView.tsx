import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { HAS_ORIGINAL, kindName } from '../lib/formats'
import { NeedsOffice, renderItem } from '../lib/render'
import type { DocView as View, Item, Prefs, Rendered } from '../lib/types'
import { Enso, Icon } from './Icon'
import { HtmlDoc } from './viewers/HtmlDoc'
import { ImageViewer } from './viewers/ImageViewer'
import { SheetViewer } from './viewers/SheetViewer'
import { SlidesViewer } from './viewers/SlidesViewer'

const PdfViewer = lazy(() => import('./viewers/PdfViewer'))

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

  const key = `${item.id}:${effective}:${attempt}`
  useEffect(() => {
    let alive = true
    renderItem(item, effective).then(
      (r) => alive && setResult({ key, rendered: r }),
      (e: Error) => alive && setResult({ key, error: e }),
    )
    return () => {
      alive = false
    }
  }, [item, effective, key])
  const current = result?.key === key ? result : null
  const rendered = current?.rendered ?? null
  const error = current?.error ?? null

  const switcher = switchable && (
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
  )

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
