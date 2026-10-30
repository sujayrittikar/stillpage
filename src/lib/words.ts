import { isJapanese, lookupable } from './dictionary'

/** A word on screen: its text, where it is, and (in something editable) the
 *  range to replace when you pick a synonym. */
export interface WordAt {
  word: string
  rect: { left: number; top: number; bottom: number }
  range: Range | null
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

function wordRange(node: Node, offset: number): Range | null {
  if (node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike && offset >= seg.index && offset <= seg.index + seg.segment.length) {
      const range = document.createRange()
      range.setStart(node, seg.index)
      // Japanese has no spaces, and a conjugated verb spans several of the
      // segmenter's pieces: hand over a run of text and let the dictionary
      // find the longest word in it.
      range.setEnd(node, isJapanese(seg.segment) ? runEnd(text, seg.index) : seg.index + seg.segment.length)
      return range
    }
  }
  return null
}

/** Where a run of Japanese worth scanning ends: 16 characters on, or the
 *  first punctuation or space. */
function runEnd(text: string, from: number): number {
  const stop = text.slice(from, from + 16).search(/[\s、。，．！？!?,.「」『』（）()・…]/u)
  return stop < 0 ? Math.min(text.length, from + 16) : from + stop
}

const editableAt = (node: Node | null) => {
  const el = node instanceof Element ? node : node?.parentElement
  return Boolean(el?.closest('[contenteditable="true"], textarea, input'))
}

function toWordAt(range: Range): WordAt | null {
  const word = range.toString().trim()
  if (!lookupable(word)) return null
  const r = range.getClientRects()[0] ?? range.getBoundingClientRect()
  return { word, rect: { left: r.left, top: r.top, bottom: r.bottom }, range: editableAt(range.startContainer) ? range.cloneRange() : null }
}

/** The word under a point on screen. */
export function wordAtPoint(x: number, y: number): WordAt | null {
  const pos = document.caretPositionFromPoint?.(x, y)
  const range = pos && wordRange(pos.offsetNode, pos.offset)
  return range ? toWordAt(range) : null
}

/** The selected words, or the word the cursor is in. */
export function wordAtSelection(): WordAt | null {
  const sel = window.getSelection()
  if (!sel?.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return toWordAt(range)
  const around = wordRange(range.startContainer, range.startOffset)
  return around ? toWordAt(around) : null
}

