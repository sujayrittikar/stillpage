import { useEffect, useState } from 'react'
import type { Layout, Prefs } from './types'

export const DEFAULT_PREFS: Prefs = { theme: 'stone', fontSize: 19, measure: 68, lineHeight: 1.7, font: 'serif', pdfTint: true }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => read('stillpage.prefs', DEFAULT_PREFS))
  useEffect(() => {
    localStorage.setItem('stillpage.prefs', JSON.stringify(prefs))
    const root = document.documentElement
    root.dataset.theme = prefs.theme
    root.style.setProperty('--read-size', `${prefs.fontSize}px`)
    root.style.setProperty('--read-measure', `${prefs.measure}ch`)
    root.style.setProperty('--read-leading', String(prefs.lineHeight))
    root.style.setProperty('--read-font', prefs.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)')
  }, [prefs])
  return [prefs, (patch) => setPrefs((p) => ({ ...p, ...patch }))]
}

export function loadLayout(fallback: Layout): Layout {
  try {
    const raw = localStorage.getItem('stillpage.layout')
    const parsed = raw ? (JSON.parse(raw) as Layout) : null
    if (parsed?.panes?.length) return parsed
  } catch {
    /* fall through */
  }
  return fallback
}

export function saveLayout(layout: Layout) {
  localStorage.setItem('stillpage.layout', JSON.stringify(layout))
}
