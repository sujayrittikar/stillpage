import hljs from 'highlight.js/lib/common'
import { Marked } from 'marked'
import { BLOCK_MATH, INLINE_MATH, renderTexSafe } from '../math'
import { clean, escapeHtml } from '../sanitize'

export function highlight(code: string, lang?: string): string {
  if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
  return escapeHtml(code)
}

// Formulas pass through sanitising as empty placeholders and are drawn by
// KaTeX afterwards, since the sanitiser strips the styles KaTeX relies on.
const placeholder = (latex: string, display: boolean) =>
  `<span data-math="${display ? 'display' : 'inline'}" data-latex="${escapeHtml(latex)}"></span>`

const marked = new Marked({
  gfm: true,
  extensions: [
    {
      name: 'blockMath',
      level: 'block',
      start: (src: string) => src.match(/^\$\$/m)?.index,
      tokenizer(src: string) {
        const m = BLOCK_MATH.exec(src)
        if (m) return { type: 'blockMath', raw: m[0], text: m[1] }
      },
      renderer: (token) => `<p>${placeholder(token.text as string, true)}</p>\n`,
    },
    {
      name: 'inlineMath',
      level: 'inline',
      start: (src: string) => src.indexOf('$'),
      tokenizer(src: string) {
        const m = INLINE_MATH.exec(src)
        if (m) return { type: 'inlineMath', raw: m[0], text: m[1] ?? m[2] }
      },
      renderer: (token) => placeholder(token.text as string, false),
    },
  ],
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? '').split(/\s/)[0]
      return `<pre><code class="hljs">${highlight(text, language)}</code></pre>\n`
    },
  },
})

export function renderMarkdown(src: string): string {
  // Front matter is metadata, not reading material.
  const body = src.replace(/^---\n[\s\S]*?\n---\n/, '')
  const html = clean(marked.parse(body, { async: false }) as string)
  return html.replace(/<span data-math="(inline|display)" data-latex="([^"]*)"><\/span>/g, (_all, kind: string, latex: string) =>
    renderTexSafe(unescape(latex), kind === 'display'),
  )
}

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
