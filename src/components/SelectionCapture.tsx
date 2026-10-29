import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export interface Capture {
  text: string
  source: string
  where: string | null
}

/** Floating "Add to note" button for text selected inside any document. */
export function SelectionCapture({ onCapture }: { onCapture: (c: Capture) => void }) {
  const [pos, setPos] = useState<(Capture & { x: number; y: number }) | null>(null)

  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('.capture-btn')) return
      setTimeout(() => {
        const sel = window.getSelection()
        const text = sel?.toString().trim()
        if (!sel || !text || sel.rangeCount === 0) return setPos(null)
        const node = sel.anchorNode
        const el = node instanceof Element ? node : node?.parentElement
        const src = el?.closest('[data-capture-source]')
        if (!src) return setPos(null)
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        setPos({
          x: Math.min(window.innerWidth - 90, Math.max(90, rect.left + rect.width / 2)),
          y: rect.top,
          text,
          source: src.getAttribute('data-capture-source') ?? 'Untitled',
          where: el?.closest('[data-where]')?.getAttribute('data-where') ?? null,
        })
      }, 0)
    }
    const hide = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('.capture-btn')) setPos(null)
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('mousedown', hide)
    document.addEventListener('scroll', hide, true)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('scroll', hide, true)
    }
  }, [])

  if (!pos) return null
  return (
    <button
      className="capture-btn"
      style={{ left: pos.x, top: pos.y < 60 ? pos.y + 28 : pos.y - 46 }}
      onClick={() => {
        onCapture(pos)
        window.getSelection()?.removeAllRanges()
        setPos(null)
      }}
    >
      <Icon name="quote" size={15} /> Add to note
    </button>
  )
}
