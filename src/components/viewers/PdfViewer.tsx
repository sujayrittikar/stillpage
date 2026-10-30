import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../Icon'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const ASSETS = new URL('./pdfjs/', document.baseURI).href

type Size = [number, number]

export default function PdfViewer({ id, data, tint }: { id: string; data: ArrayBuffer; tint: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<Size[]>([])
  // Zoom is kept relative to fitting the width, so pages grow and shrink with
  // the pane: drag the divider and a page at 130% stays at 130% of the pane.
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const fitScale = useRef(1)

  useEffect(() => {
    let cancelled = false
    const task = pdfjs.getDocument({
      data: new Uint8Array(data.slice(0)),
      cMapUrl: ASSETS + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: ASSETS + 'standard_fonts/',
      wasmUrl: ASSETS + 'wasm/',
    })
    task.promise.then(
      async (d) => {
        if (cancelled) return
        const first = (await d.getPage(1)).getViewport({ scale: 1 })
        const initial: Size[] = Array.from({ length: d.numPages }, () => [first.width, first.height])
        setDoc(d)
        setSizes(initial)
        // Real sizes trickle in; mixed-size PDFs settle without blocking first paint.
        const real = [...initial]
        for (let i = 2; i <= d.numPages && !cancelled; i++) {
          const vp = (await d.getPage(i)).getViewport({ scale: 1 })
          real[i - 1] = [vp.width, vp.height]
          if (i % 25 === 0 || i === d.numPages) setSizes([...real])
        }
      },
      (err: Error) => !cancelled && setError(err.name === 'PasswordException' ? 'This PDF is password-protected.' : 'This PDF could not be opened.'),
    )
    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [data])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => entry.contentRect.width > 0 && setWidth(entry.contentRect.width))
    ro.observe(el)
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => relative(fitScale.current, fitScale.current * z * (e.deltaY < 0 ? 1.1 : 0.9)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  const maxW = sizes.reduce((m, s) => Math.max(m, s[0]), 1)
  const fit = clampZoom((width - 56) / maxW)
  const scale = clampZoom(fit * zoom)
  useLayoutEffect(() => {
    fitScale.current = fit
  }, [fit])
  // Keep the spot you were looking at in the middle while the pages grow or
  // shrink, instead of drifting to the top-left.
  const previousScale = useRef(scale)
  useLayoutEffect(() => {
    const el = scrollRef.current
    const ratio = scale / previousScale.current
    previousScale.current = scale
    if (!el || ratio === 1) return
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2
  }, [scale])

  useEffect(() => {
    const onZoom = (e: Event) => {
      const { id: target, dir } = (e as CustomEvent<{ id: string; dir: 1 | -1 | 0 }>).detail
      if (target !== id) return
      if (dir === 0) setZoom(1)
      else setZoom((z) => relative(fitScale.current, fitScale.current * z * (dir > 0 ? 1.15 : 0.85)))
    }
    window.addEventListener('stillpage:pdf-zoom', onZoom)
    return () => window.removeEventListener('stillpage:pdf-zoom', onZoom)
  }, [id])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const probe = el.scrollTop + el.clientHeight * 0.35
    const pages = el.querySelectorAll<HTMLElement>('.pdf-page')
    for (const p of pages) {
      if (p.offsetTop + p.offsetHeight > probe) {
        setPage(Number(p.dataset.page))
        break
      }
    }
  }

  const goTo = (n: number) => {
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${n}"]`)
    target?.scrollIntoView({ block: 'start' })
  }

  if (error) return <p className="viewer-empty">{error}</p>

  return (
    <div className={`pdf ${tint ? 'tint' : ''}`}>
      <div className="pdf-scroll" ref={scrollRef} onScroll={onScroll} data-scroll>
        {doc &&
          width > 0 &&
          sizes.map(([w, h], i) => <PdfPage key={i} doc={doc} num={i + 1} scale={scale} width={w * scale} height={h * scale} />)}
      </div>
      {doc && (
        <div className="pdf-bar" role="toolbar" aria-label="PDF controls">
          <label className="pdf-pageno">
            <input
              key={page}
              defaultValue={page}
              inputMode="numeric"
              aria-label="Page"
              onKeyDown={(e) => {
                if (e.key === 'Enter') goTo(Math.min(sizes.length, Math.max(1, Number(e.currentTarget.value) || 1)))
              }}
            />
            <span>of {sizes.length}</span>
          </label>
          <span className="pdf-sep" />
          <button className="icon-btn" title="Zoom out" onClick={() => setZoom(relative(fit, scale * 0.85))}>
            <Icon name="minus" size={16} />
          </button>
          <button className={`text-btn ${zoom === 1 ? 'on' : ''}`} title="Fit width" onClick={() => setZoom(1)}>
            {Math.round(scale * 100)}%
          </button>
          <button className="icon-btn" title="Zoom in" onClick={() => setZoom(relative(fit, scale * 1.15))}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function clampZoom(z: number) {
  return Math.min(4, Math.max(0.3, Number.isFinite(z) ? z : 1))
}

/** A wanted scale as a multiple of the fit-width scale. */
function relative(fit: number, scale: number) {
  return clampZoom(scale) / fit
}

function PdfPage({ doc, num, scale, width, height }: { doc: PDFDocumentProxy; num: number; scale: number; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '1500px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const text = textRef.current
    if (!canvas || !text) return
    if (!near) {
      // Free memory for pages far off-screen.
      canvas.width = 0
      canvas.height = 0
      text.replaceChildren()
      return
    }
    let renderTask: ReturnType<pdfjs.PDFPageProxy['render']> | null = null
    let textLayer: pdfjs.TextLayer | null = null
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const page = await doc.getPage(num)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width * dpr)
      off.height = Math.floor(viewport.height * dpr)
      renderTask = page.render({ canvas: off, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      try {
        await renderTask.promise
      } catch {
        return
      }
      if (cancelled) return
      // Swap in the finished bitmap so zooming never flashes blank.
      canvas.width = off.width
      canvas.height = off.height
      canvas.getContext('2d')?.drawImage(off, 0, 0)
      text.replaceChildren()
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport })
      await textLayer.render().catch(() => {})
    }, 60)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [near, scale, doc, num])

  return (
    <div
      ref={ref}
      className="pdf-page"
      data-page={num}
      data-where={`p. ${num}`}
      style={{ width, height, '--scale-factor': scale, '--total-scale-factor': scale } as CSSProperties}
    >
      <canvas ref={canvasRef} />
      <div ref={textRef} className="textLayer" />
    </div>
  )
}
