import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { renderItem } from '../lib/render'
import type { Item, Prefs, Rendered } from '../lib/types'
import { Enso } from './Icon'
import { HtmlDoc } from './viewers/HtmlDoc'
import { ImageViewer } from './viewers/ImageViewer'
import { SheetViewer } from './viewers/SheetViewer'
import { SlidesViewer } from './viewers/SlidesViewer'

const PdfViewer = lazy(() => import('./viewers/PdfViewer'))

export function Loading() {
  return (
    <div className="viewer-loading" aria-label="Opening">
      <Enso size={44} className="breathing" />
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
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    renderItem(item).then(
      (r) => alive && setRendered(r),
      (e: Error) => alive && setError(e.message || 'This file could not be opened.'),
    )
    return () => {
      alive = false
    }
  }, [item])

  if (error) return <p className="viewer-empty">{error}</p>
  if (!rendered) return <Loading />

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
      {body}
    </div>
  )
}
