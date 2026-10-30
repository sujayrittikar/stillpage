import type { Prefs, ThemeName } from '../lib/types'

const THEMES: { id: ThemeName; name: string }[] = [
  { id: 'stone', name: 'Stone' },
  { id: 'linen', name: 'Linen' },
  { id: 'mist', name: 'Mist' },
  { id: 'dusk', name: 'Dusk' },
]

const SHORTCUTS: [string, string][] = [
  ['Ctrl O', 'Open files'],
  ['Alt N', 'New note beside'],
  ['Ctrl \\', 'Split the workspace'],
  ['Ctrl .', 'Zen mode'],
  ['Ctrl + / -', 'Bigger, smaller text (PDF: zoom)'],
  ['Ctrl Shift S', 'Span all screens'],
  ['F11', 'Full screen'],
  ['Ctrl D', 'Look up a word (or right-click it)'],
  ['Alt W', 'Close tab'],
  ['Ctrl Tab', 'Next tab in pane'],
  ['Alt 1–4', 'Jump to pane'],
  ['Ctrl B / I / U', 'Bold, italic, underline in notes'],
]

export function Settings({ prefs, set, onClose }: { prefs: Prefs; set: (p: Partial<Prefs>) => void; onClose: () => void }) {
  return (
    <>
      <div className="scrim clear" onClick={onClose} />
      <div className="popover settings" role="dialog" aria-label="Reading settings">
        <div className="themes" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={prefs.theme === t.id} className={`swatch ${t.id} ${prefs.theme === t.id ? 'on' : ''}`} onClick={() => set({ theme: t.id })}>
              <span className="swatch-chip">Aa</span>
              {t.name}
            </button>
          ))}
        </div>

        <div className="segmented wide" role="radiogroup" aria-label="Typeface">
          <button role="radio" aria-checked={prefs.font === 'serif'} className={`serif ${prefs.font === 'serif' ? 'on' : ''}`} onClick={() => set({ font: 'serif' })}>
            Literata
          </button>
          <button role="radio" aria-checked={prefs.font === 'sans'} className={`sans ${prefs.font === 'sans' ? 'on' : ''}`} onClick={() => set({ font: 'sans' })}>
            Figtree
          </button>
        </div>

        <label className="range">
          <span>Text size</span>
          <input type="range" min={13} max={36} step={1} value={prefs.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
          <output>{prefs.fontSize}</output>
        </label>
        <label className="range">
          <span>Line length</span>
          <input type="range" min={50} max={96} step={2} value={prefs.measure} onChange={(e) => set({ measure: Number(e.target.value) })} />
          <output>{prefs.measure}</output>
        </label>
        <label className="range">
          <span>Line spacing</span>
          <input type="range" min={1.4} max={2.1} step={0.05} value={prefs.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} />
          <output>{prefs.lineHeight.toFixed(2)}</output>
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.pdfTint} onChange={(e) => set({ pdfTint: e.target.checked })} />
          <span>Tint PDF pages to match the theme</span>
        </label>
        <label className="check" title="Backspace right after a fix puts your word back">
          <input type="checkbox" checked={prefs.autocorrect} onChange={(e) => set({ autocorrect: e.target.checked })} />
          <span>Fix common typos as I write</span>
        </label>

        <details className="shortcuts">
          <summary>Keyboard shortcuts</summary>
          <dl>
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </>
  )
}
