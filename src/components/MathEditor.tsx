import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { complete, PALETTE, renderTex, renderTexSafe, SLOT, type Completion } from '../lib/math'

export interface MathTarget {
  latex: string
  display: boolean
  /** Where the formula is, or null for a new one. */
  pos: number | null
  anchor: { left: number; top: number; bottom: number }
}

interface Props {
  target: MathTarget
  onCommit: (latex: string, display: boolean) => void
  onCancel: () => void
  onRemove?: () => void
}

const WIDTH = 440

/** A small formula editor: LaTeX on top, the result right under it, a symbol
 *  palette and command completion. Tab jumps between the • slots a template
 *  leaves, the way TeXstudio's placeholders do. */
export function MathEditor({ target, onCommit, onCancel, onRemove }: Props) {
  const [latex, setLatexState] = useState(target.latex)
  const [display, setDisplayState] = useState(target.display)
  // While the formula is half-typed, the last version that rendered stays up.
  const [view, setView] = useState(() => draw(target.latex, target.display, ''))
  const [group, setGroup] = useState(0)
  const [suggest, setSuggest] = useState<{ items: Completion[]; from: number; index: number } | null>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  const setLatex = (next: string) => {
    setLatexState(next)
    setView((v) => draw(next, display, v.html))
  }
  const setDisplay = (next: boolean) => {
    setDisplayState(next)
    setView((v) => draw(latex, next, v.html))
  }

  const commit = () => onCommit(latex.replaceAll(SLOT, '').trim(), display)

  // Sit under the formula, or above it when there's no room below.
  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 320
    const left = Math.min(window.innerWidth - WIDTH - 12, Math.max(12, target.anchor.left - 24))
    const below = target.anchor.bottom + 10
    const top = below + height > window.innerHeight - 12 ? Math.max(12, target.anchor.top - height - 10) : below
    setPlace({ left, top })
  }, [target.anchor])

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    if (!selectSlot(el, 0)) el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // Clicking elsewhere keeps what you wrote, like closing a note.
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && commitRef.current()
    document.addEventListener('mousedown', away, true)
    return () => document.removeEventListener('mousedown', away, true)
  }, [])

  const refreshSuggestions = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart)
    const m = /\\(?:begin\{[a-zA-Z]*|[a-zA-Z]+)$/.exec(before)
    if (!m || m[0].length < 2 || el.selectionStart !== el.selectionEnd) return setSuggest(null)
    const items = complete(m[0])
    setSuggest(items.length && !(items.length === 1 && items[0].tex === m[0]) ? { items, from: m.index, index: 0 } : null)
  }

  /** Types text at the cursor, keeping undo, then lands on the first slot. */
  const insert = (text: string, replaceFrom?: number) => {
    const el = input.current
    if (!el) return
    el.focus()
    if (replaceFrom !== undefined) el.setSelectionRange(replaceFrom, el.selectionEnd)
    const start = el.selectionStart
    // A completion replaces what was typed; a palette key wraps the selection.
    const selected = replaceFrom === undefined ? el.value.slice(start, el.selectionEnd) : ''
    // A selection goes into the template's first slot: select "x", press √, get √x.
    const filled = selected && text.includes(SLOT) ? text.replace(SLOT, selected) : text
    document.execCommand('insertText', false, filled)
    setLatex(el.value)
    setSuggest(null)
    if (!selectSlot(el, start, start + filled.length)) el.setSelectionRange(start + filled.length, start + filled.length)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    if (suggest) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setSuggest({ ...suggest, index: (suggest.index + step + suggest.items.length) % suggest.items.length })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insert(suggest.items[suggest.index].tex, suggest.from)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setSuggest(null)
        return
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (!display && !e.shiftKey))) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) selectSlotBefore(el)
      else if (!selectSlot(el, el.selectionEnd)) selectSlot(el, 0)
    } else if (e.key === '{') {
      e.preventDefault()
      const selected = el.value.slice(el.selectionStart, el.selectionEnd)
      const at = el.selectionStart
      document.execCommand('insertText', false, `{${selected}}`)
      el.setSelectionRange(at + 1, at + 1 + selected.length)
      setLatex(el.value)
    } else if (e.key === '}' && el.selectionStart === el.selectionEnd && el.value[el.selectionStart] === '}') {
      e.preventDefault()
      el.setSelectionRange(el.selectionStart + 1, el.selectionStart + 1)
    }
  }

  const symbols = PALETTE[group].symbols
  const keys = useMemo(() => symbols.map((sym) => renderTexSafe((sym.label ?? sym.tex).replaceAll(SLOT, '\\square'), false)), [symbols])

  return (
    <div
      ref={box}
      className="math-editor"
      role="dialog"
      aria-label="Formula"
      style={{ width: WIDTH, left: place?.left ?? -9999, top: place?.top ?? 0 }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="math-head">
        <div className="segmented math-kind" role="radiogroup" aria-label="Formula placement">
          <button role="radio" aria-checked={!display} className={!display ? 'on' : ''} onClick={() => setDisplay(false)} title="In the line of text">
            Inline
          </button>
          <button role="radio" aria-checked={display} className={display ? 'on' : ''} onClick={() => setDisplay(true)} title="On its own line, centred">
            Display
          </button>
        </div>
        <span className="math-keys">{display ? 'Ctrl Enter to finish' : 'Enter to finish'}, Tab for the next •</span>
      </div>

      <div className="math-source">
        <textarea
          ref={input}
          value={latex}
          spellCheck={false}
          rows={display ? 4 : 2}
          placeholder="Type LaTeX, like \frac{a}{b} or \alpha^2"
          aria-label="LaTeX source"
          onChange={(e) => {
            setLatex(e.target.value)
            refreshSuggestions(e.target)
          }}
          onKeyDown={onKeyDown}
          onClick={(e) => refreshSuggestions(e.currentTarget)}
        />
        {suggest && (
          <ul className="math-suggest" role="listbox">
            {suggest.items.map((c, i) => (
              <li
                key={c.name}
                role="option"
                aria-selected={i === suggest.index}
                className={i === suggest.index ? 'on' : ''}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insert(c.tex, suggest.from)
                }}
              >
                <code>{c.name}</code>
                <span className="math-suggest-glyph" dangerouslySetInnerHTML={{ __html: renderTexSafe(c.tex.replaceAll(SLOT, '\\square'), false) }} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`math-preview ${display ? 'display' : ''} ${view.error ? 'stale' : ''}`} aria-live="polite">
        {latex.trim() ? <span dangerouslySetInnerHTML={{ __html: view.html }} /> : <span className="math-empty">Your formula appears here</span>}
      </div>
      {view.error && latex.trim() && <p className="math-error-line">{view.error}</p>}

      <div className="math-tabs" role="tablist">
        {PALETTE.map((g, i) => (
          <button key={g.name} role="tab" aria-selected={i === group} className={i === group ? 'on' : ''} onClick={() => setGroup(i)}>
            {g.name}
          </button>
        ))}
      </div>
      <div className="math-palette" role="tabpanel">
        {symbols.map((sym, i) => (
          <button
            key={sym.tex}
            className="math-key"
            title={`${sym.tex.replaceAll(SLOT, '□')}${sym.hint ? `  ${sym.hint}` : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(sym.tex.includes(SLOT) || sym.tex.length === 1 ? sym.tex : sym.tex + ' ')}
            dangerouslySetInnerHTML={{ __html: keys[i] }}
          />
        ))}
      </div>

      <div className="math-foot">
        {onRemove && (
          <button className="btn small quiet" onClick={onRemove}>
            Remove
          </button>
        )}
        <span className="grow" />
        <button className="btn small quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn small" onClick={commit}>
          Done
        </button>
      </div>
    </div>
  )
}

function draw(latex: string, display: boolean, previous: string) {
  const r = renderTex(latex.replaceAll(SLOT, '\\square'), display)
  return r.error === null ? r : { html: previous, error: r.error }
}

/** Selects the first slot at or after `from` (and before `to`). */
function selectSlot(el: HTMLTextAreaElement, from: number, to = el.value.length): boolean {
  const at = el.value.indexOf(SLOT, from)
  if (at < 0 || at >= to) return false
  el.setSelectionRange(at, at + SLOT.length)
  return true
}

function selectSlotBefore(el: HTMLTextAreaElement): boolean {
  const at = el.value.lastIndexOf(SLOT, el.selectionStart - 1)
  if (at < 0) return false
  el.setSelectionRange(at, at + SLOT.length)
  return true
}
