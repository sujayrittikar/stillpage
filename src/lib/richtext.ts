import { Extension, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Plugin } from '@tiptap/pm/state'
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import { INLINE_MATH, mathExportCss, renderTexSafe } from './math'

// The stock rule reads "$5 and $10" as a formula; ours leaves prices alone.
const NoteInlineMath = InlineMath.extend({
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const m = INLINE_MATH.exec(src)
      return m ? { type: 'inlineMath', raw: m[0], latex: (m[1] ?? m[2]).trim() } : undefined
    },
  },
})

export type OpenMath = (display: boolean, pos?: number) => void

/** What each editor does to open its formula editor; set by the component. */
export const openers = new WeakMap<Editor, OpenMath>()

/** Inline and display formulas: click one to edit it, Ctrl M (Ctrl Shift M
 *  for display) to write a new one. */
const Formulas = Extension.create({
  name: 'formulas',
  addExtensions: () => [NoteInlineMath, BlockMath],
  addKeyboardShortcuts() {
    return {
      'Mod-m': () => (openers.get(this.editor)?.(false), true),
      'Mod-Shift-m': () => (openers.get(this.editor)?.(true), true),
    }
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handleClickOn: (_view, _pos, node, nodePos) => {
            if (node.type.name !== 'inlineMath' && node.type.name !== 'blockMath') return false
            openers.get(editor)?.(node.type.name === 'blockMath', nodePos)
            return true
          },
        },
      }),
    ]
  },
})

/** Everything a page of writing understands, stored as Markdown: headings,
 *  lists, checklists, quotes, tables and formulas. */
export function richExtensions(placeholder: string) {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Formulas,
    Placeholder.configure({ placeholder: ({ editor }) => (editor.isEmpty ? placeholder : '') }),
    Markdown,
  ]
}

/** Pages are printed without the app around them, so formulas go out as
 *  finished KaTeX with its stylesheet and fonts. */
export async function withMath(html: string): Promise<string> {
  if (!html.includes('-math"')) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  doc.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((el) => {
    el.innerHTML = renderTexSafe(el.dataset.latex ?? '', el.dataset.type === 'block-math')
  })
  return `<style>${await mathExportCss()} .katex { font-size: 1.08em; } [data-type="block-math"] { margin: 1em 0; }</style>${doc.body.innerHTML}`
}

/** The editor leaves runs of blank lines after lists and tables. Squeeze them
 *  to one, outside code blocks, and end the text with a single newline. */
export function tidyMarkdown(md: string): string {
  const parts = md.split(/(^```[\s\S]*?^```[^\n]*$)/m)
  const tidy = parts.map((part, i) => (i % 2 ? part : part.replace(/\n{3,}/g, '\n\n'))).join('')
  return tidy.trim() ? tidy.replace(/\s+$/, '') + '\n' : ''
}
