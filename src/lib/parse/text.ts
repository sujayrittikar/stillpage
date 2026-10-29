import hljs from 'highlight.js/lib/common'
import { escapeHtml } from '../sanitize'

export function renderPlainText(src: string): string {
  return src
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p class="pre">${escapeHtml(para)}</p>`)
    .join('\n')
}

export function renderCode(src: string, lang?: string): string {
  let html: string
  if (lang && hljs.getLanguage(lang)) html = hljs.highlight(src, { language: lang, ignoreIllegals: true }).value
  else if (src.length < 200_000) html = hljs.highlightAuto(src).value
  else html = escapeHtml(src)
  return `<pre class="code-file"><code class="hljs">${html}</code></pre>`
}
