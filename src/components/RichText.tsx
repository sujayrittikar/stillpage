import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { openers, richExtensions, tidyMarkdown } from '../lib/richtext'
import { Icon } from './Icon'
import { MathEditor, type MathTarget } from './MathEditor'

type MathEdit = MathTarget & { range?: { from: number; to: number } }

interface Options {
  /** The Markdown to show. A value we didn't produce ourselves is loaded in. */
  text: string | undefined
  onChange: (markdown: string) => void
  placeholder: string
  className?: string
  /** Called when outside text arrives that only adds to the end (a quote). */
  onAppended?: () => void
}

/** A page you write like a document and that is kept as Markdown: typing
 *  `- `, `# `, `**bold**` or `> ` turns into the real thing and the marks
 *  vanish. Returns the editor plus its floating parts (the format bar and the
 *  formula editor) to render next to it. */
export function useRichEditor({ text, onChange, placeholder, className = '', onAppended }: Options): { editor: Editor | null; overlay: ReactNode } {
  // The Markdown we last wrote ourselves. Anything else arriving is an outside
  // change to load in.
  const ours = useRef<string | null>(null)
  const changed = useRef(onChange)
  const appended = useRef(onAppended)
  useEffect(() => {
    changed.current = onChange
    appended.current = onAppended
  })
  const [math, setMath] = useState<MathEdit | null>(null)

  const editor = useEditor({
    extensions: richExtensions(placeholder),
    editorProps: { attributes: { class: `prose note-prose ${className}`, spellcheck: 'true' } },
    onUpdate: ({ editor }) => {
      const md = tidyMarkdown(editor.getMarkdown())
      ours.current = md
      changed.current(md)
    },
  })

  useEffect(() => {
    if (!editor || text === undefined || text === ours.current) return
    const grew = ours.current !== null && text.length > ours.current.length
    ours.current = text
    editor.commands.setContent(text, { contentType: 'markdown', emitUpdate: false })
    if (grew) appended.current?.()
  }, [editor, text])

  // Opens the formula editor on the formula at `pos`, or on a new one built
  // from whatever is selected.
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

  if (!editor) return { editor, overlay: null }

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

  const overlay = (
    <>
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
        <button onClick={() => openers.get(editor)?.(false)} title="Formula (Ctrl M)">
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
    </>
  )
  return { editor, overlay }
}
