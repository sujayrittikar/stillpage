import hljs from 'highlight.js/lib/common'
import { Marked } from 'marked'
import { clean, escapeHtml } from '../sanitize'

export function highlight(code: string, lang?: string): string {
  if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
  return escapeHtml(code)
}

const marked = new Marked({
  gfm: true,
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
  return clean(marked.parse(body, { async: false }) as string)
}
