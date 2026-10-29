import { clean, escapeHtml } from '../sanitize'
import { highlight, renderMarkdown } from './markdown'

type Source = string | string[]
interface Cell {
  cell_type: 'markdown' | 'code' | 'raw'
  source: Source
  outputs?: Array<{ output_type: string; text?: Source; data?: Record<string, Source>; traceback?: string[] }>
}

const join = (s?: Source) => (Array.isArray(s) ? s.join('') : (s ?? ''))
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

export function renderIpynb(src: string): string {
  const nb = JSON.parse(src) as { cells: Cell[]; metadata?: { language_info?: { name?: string } } }
  const lang = nb.metadata?.language_info?.name ?? 'python'
  const parts = nb.cells.map((cell) => {
    if (cell.cell_type === 'markdown') return renderMarkdown(join(cell.source))
    if (cell.cell_type === 'raw') return `<pre>${escapeHtml(join(cell.source))}</pre>`
    const outputs = (cell.outputs ?? []).map((o) => {
      if (o.output_type === 'stream') return `<pre class="nb-out">${escapeHtml(join(o.text))}</pre>`
      if (o.output_type === 'error') return `<pre class="nb-out nb-err">${escapeHtml(stripAnsi((o.traceback ?? []).join('\n')))}</pre>`
      const data = o.data ?? {}
      if (data['image/png']) return `<img class="nb-img" src="data:image/png;base64,${join(data['image/png']).replace(/\s/g, '')}" alt="">`
      if (data['image/jpeg']) return `<img class="nb-img" src="data:image/jpeg;base64,${join(data['image/jpeg']).replace(/\s/g, '')}" alt="">`
      if (data['text/html']) return `<div class="nb-html">${clean(join(data['text/html']))}</div>`
      if (data['text/markdown']) return renderMarkdown(join(data['text/markdown']))
      if (data['text/plain']) return `<pre class="nb-out">${escapeHtml(join(data['text/plain']))}</pre>`
      return ''
    })
    return `<div class="nb-cell"><pre><code class="hljs">${highlight(join(cell.source), lang)}</code></pre>${outputs.join('')}</div>`
  })
  return parts.join('\n')
}
