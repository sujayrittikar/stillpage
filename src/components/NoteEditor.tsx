import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Extension, type Editor } from '@tiptap/react'
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state'
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import { getItem, setNote, useNote } from '../lib/library'
import { INLINE_MATH, mathExportCss, renderTexSafe } from '../lib/math'
import { Icon } from './Icon'
import { MathEditor, type MathTarget } from './MathEditor'

const announce = (saved: string | null) =>
  saved && window.dispatchEvent(new CustomEvent('stillpage:toast', { detail: `Saved ${saved.split('/').pop()}` }))

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

/** Notes are printed without the app around them, so formulas go out as
 *  finished KaTeX with its stylesheet and fonts. */
async function withMath(html: string): Promise<string> {
  if (!html.includes('-math"')) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  doc.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((el) => {
    el.innerHTML = renderTexSafe(el.dataset.latex ?? '', el.dataset.type === 'block-math')
  })
  return `<style>${await mathExportCss()} .katex { font-size: 1.08em; } [data-type="block-math"] { margin: 1em 0; }</style>${doc.body.innerHTML}`
}

type OpenMath = (display: boolean, pos?: number) => void

/** What each editor does to open its formula editor; set by the component. */
const openers = new WeakMap<Editor, OpenMath>()

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

type MathEdit = MathTarget & { range?: { from: number; to: number } }

const fileName = (id: string) => (getItem(id)?.title ?? 'note').replace(/[\\/:*?"<>|]/g, '-')

/** Notes are stored as Markdown but written like a document: typing `- `,
 *  `# `, `**bold**` or `> ` turns into the real thing and the marks vanish. */
export function NoteEditor({ id, active }: { id: string; active: boolean }) {
  const text = useNote(id)
  const [menu, setMenu] = useState(false)
  // The Markdown we last wrote ourselves. Anything else arriving in the store
  // (a quote added from a document) is an outside change to load in.
  const ours = useRef<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [math, setMath] = useState<MathEdit | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Formulas,
      Placeholder.configure({
        placeholder: ({ editor }) =>
          editor.isEmpty ? 'Start writing. Type # for a heading, - for a list, > for a quote, Ctrl M for a formula.' : '',
      }),
      Markdown,
    ],
    editorProps: { attributes: { class: 'prose note-prose', spellcheck: 'true' } },
    onUpdate: ({ editor }) => {
      const md = editor.getMarkdown()
      ours.current = md
      setNote(id, md)
    },
  })

  useEffect(() => {
    if (!editor || text === undefined || text === ours.current) return
    const appended = ours.current !== null && text.length > ours.current.length
    ours.current = text
    editor.commands.setContent(text, { contentType: 'markdown', emitUpdate: false })
    if (appended) {
      // Quotes arrive at the end: follow them.
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }))
    }
  }, [editor, text])

  // Opening an empty note puts the cursor in it. Only on opening: an empty
  // check on every keystroke would yank the cursor out of a fresh heading.
  const loaded = text !== undefined
  useEffect(() => {
    if (active && editor && loaded && editor.isEmpty) editor.commands.focus('end')
  }, [active, editor, loaded])

  // Opens the formula editor on the formula at `pos`, or on a new one built
  // from whatever is selected.
  const openMath = (display: boolean) => editor && openers.get(editor)?.(display)
  useEffect(() => {
    if (!editor) return
    openers.set(editor, (display, pos) => {
      const { view, state } = editor
      if (pos !== undefined) {
        const node = state.doc.nodeAt(pos)
        const dom = view.nodeDOM(pos)
        if (!node || !(dom instanceof HTMLElement)) return
        const r = dom.getBoundingClientRect()
        setMath({ latex: String(node.attrs.latex ?? ''), display: node.type.name === 'blockMath', pos, anchor: { left: r.left, top: r.top, bottom: r.bottom } })
        return
      }
      const { from, to, empty } = state.selection
      const c = view.coordsAtPos(from)
      setMath({
        latex: empty ? '' : state.doc.textBetween(from, to, ' '),
        display,
        pos: null,
        anchor: { left: c.left, top: c.top, bottom: c.bottom },
        range: { from, to },
      })
    })
  }, [editor])

  const words = useEditorState({
    editor,
    selector: ({ editor }) => {
      const t = editor?.state.doc.textContent.trim() ?? ''
      return t ? t.split(/\s+/).length : 0
    },
  })

  if (text === undefined || !editor) return null

  const exportMarkdown = async () => {
    setMenu(false)
    const md = editor.getMarkdown()
    if (window.stillpage?.saveFile) announce(await window.stillpage.saveFile(`${fileName(id)}.md`, md))
    else download(new Blob([md], { type: 'text/markdown' }), `${fileName(id)}.md`)
  }

  const exportPdf = async () => {
    setMenu(false)
    if (window.stillpage?.exportPdf) announce(await window.stillpage.exportPdf(`${fileName(id)}.pdf`, await withMath(editor.getHTML())))
    else window.print()
  }

  const mark = (on: boolean) => (on ? 'on' : '')

  const closeMath = () => {
    setMath(null)
    editor.commands.focus()
  }

  const commitMath = (latex: string, display: boolean) => {
    if (!math) return
    const type = display ? 'blockMath' : 'inlineMath'
    const chain = editor.chain().focus()
    if (math.pos !== null) {
      const node = editor.state.doc.nodeAt(math.pos)
      const span = { from: math.pos, to: math.pos + (node?.nodeSize ?? 0) }
      if (!latex) chain.deleteRange(span).run()
      else if (node?.type.name === type) chain.setNodeSelection(math.pos).updateAttributes(type, { latex }).setTextSelection(span.to).run()
      else chain.insertContentAt(span, { type, attrs: { latex } }).run()
    } else if (latex) {
      chain.insertContentAt(math.range ?? editor.state.selection.from, { type, attrs: { latex } }).run()
    }
    // Keep writing after a display formula rather than leaving it selected.
    const { selection } = editor.state
    if (selection instanceof NodeSelection && selection.node.type.name === 'blockMath') {
      const next = editor.state.doc.resolve(selection.to).nodeAfter
      if (next?.isTextblock) editor.commands.setTextSelection(selection.to + 1)
      else editor.commands.createParagraphNear()
    }
    setMath(null)
  }

  return (
    <div className="note">
      <div className="note-bar">
        <span className="note-count">{words === 1 ? '1 word' : `${(words ?? 0).toLocaleString()} words`}</span>
        <div className="export-anchor">
          <button className={`icon-btn ${menu ? 'on' : ''}`} title="Export" onClick={() => setMenu((m) => !m)}>
            <Icon name="download" size={16} />
          </button>
          {menu && (
            <>
              <div className="scrim clear" onClick={() => setMenu(false)} />
              <div className="popover export-menu">
                <button className="menu-item" onClick={() => void exportPdf()}>
                  Export as PDF
                </button>
                <button className="menu-item" onClick={() => void exportMarkdown()}>
                  Export as Markdown
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="scroll note-write" ref={scroller} data-scroll onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <EditorContent editor={editor} />
      </div>
      <BubbleMenu editor={editor} className="format-bar" options={{ placement: 'top' }} shouldShow={({ editor, state }) => editor.isFocused && state.selection instanceof TextSelection && !state.selection.empty}>
        <button className={mark(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl B)">
          <b>B</b>
        </button>
        <button className={mark(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl I)">
          <i>I</i>
        </button>
        <button className={mark(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl U)">
          <u>U</u>
        </button>
        <button className={mark(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <s>S</s>
        </button>
        <button onClick={() => openMath(false)} title="Formula (Ctrl M)">
          ∑
        </button>
        <span className="format-sep" />
        <button className={mark(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">
          H
        </button>
        <button className={mark(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">
          <Icon name="list" size={15} />
        </button>
        <button className={mark(editor.isActive('taskList'))} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Checklist">
          ☐
        </button>
        <button className={mark(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
          <Icon name="quote" size={15} />
        </button>
      </BubbleMenu>
      {math && (
        <MathEditor
          key={`${math.pos}:${math.anchor.left}:${math.anchor.top}`}
          target={math}
          onCommit={commitMath}
          onCancel={closeMath}
          onRemove={math.pos !== null ? () => commitMath('', math.display) : undefined}
        />
      )}
    </div>
  )
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
