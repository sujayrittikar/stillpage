import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'

interface Heading {
  id: string
  text: string
  level: number
}

export function HtmlDoc({ html, variant }: { html: string; variant?: 'code' | 'plain' }) {
  const ref = useRef<HTMLElement>(null)
  const [headings, setHeadings] = useState<Heading[]>([])
  const [outlineOpen, setOutlineOpen] = useState(false)

  useEffect(() => {
    const root = ref.current
    if (!root || variant === 'code') return
    const found: Heading[] = []
    root.querySelectorAll('h1, h2, h3').forEach((el, i) => {
      el.id ||= `h-${i}`
      const text = el.textContent?.trim()
      if (text) found.push({ id: el.id, text, level: Number(el.tagName[1]) })
    })
    setHeadings(found.length >= 3 ? found : [])
  }, [html, variant])

  return (
    <>
      {headings.length > 0 && (
        <div className="outline">
          <button className="ghost-btn outline-toggle" onClick={() => setOutlineOpen((o) => !o)} aria-expanded={outlineOpen}>
            <Icon name="list" size={16} /> Contents
          </button>
          {outlineOpen && (
            <nav className="outline-list">
              {headings.map((h) => (
                <button
                  key={h.id}
                  className={`outline-item l${h.level}`}
                  onClick={() => {
                    ref.current?.querySelector(`#${CSS.escape(h.id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    setOutlineOpen(false)
                  }}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}
      <article ref={ref} className={`prose ${variant ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
