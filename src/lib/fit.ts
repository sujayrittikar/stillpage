import { useEffect, type RefObject } from 'react'
import type { Prefs } from './types'

/** Text never shrinks below this share of the size you chose. */
const MIN_FIT = 0.8
// .prose padding on both sides.
const GUTTER = 72

let probe: CanvasRenderingContext2D | null = null

/** How wide a full reading line is, in pixels, at the chosen size. */
function lineWidth(prefs: Prefs): number {
  probe ??= document.createElement('canvas').getContext('2d')
  const family = prefs.font === 'serif' ? 'Literata Variable' : 'Figtree Variable'
  if (!probe) return prefs.fontSize * 0.55 * prefs.measure
  probe.font = `${prefs.fontSize}px "${family}"`
  return probe.measureText('0').width * prefs.measure
}

/** Lets a pane's text follow the pane. Narrow it and the type steps down a
 *  little, so a line keeps its length instead of breaking every few words;
 *  widen it and the type returns to the size you chose, never beyond. Set
 *  straight on the element, so dragging a divider costs no re-render. */
export function usePaneFit(ref: RefObject<HTMLElement | null>, prefs: Prefs) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let need = lineWidth(prefs) + GUTTER
    const apply = (width: number) => {
      const fit = Math.min(1, Math.max(MIN_FIT, width / need))
      el.style.setProperty('--read-size', `${(prefs.fontSize * fit).toFixed(2)}px`)
    }
    const ro = new ResizeObserver(([entry]) => apply(entry.contentRect.width))
    ro.observe(el)
    // The reading font may still be loading; measure again once it's in.
    void document.fonts.ready.then(() => {
      need = lineWidth(prefs) + GUTTER
      apply(el.clientWidth)
    })
    return () => {
      ro.disconnect()
      el.style.removeProperty('--read-size')
    }
  }, [ref, prefs])
}
