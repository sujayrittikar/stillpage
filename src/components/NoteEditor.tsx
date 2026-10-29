import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { getItem, setNote, useNote } from '../lib/library'
import { Icon } from './Icon'

const announce = (saved: string | null) =>
  saved && window.dispatchEvent(new CustomEvent('stillpage:toast', { detail: `Saved ${saved.split('/').pop()}` }))

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ editor }) =>
          editor.isEmpty ? 'Start writing. Type # for a heading, - for a list, > for a quote.' : '',
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
    if (window.stillpage?.exportPdf) announce(await window.stillpage.exportPdf(`${fileName(id)}.pdf`, editor.getHTML()))
    else window.print()
  }

  const mark = (on: boolean) => (on ? 'on' : '')

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
      <BubbleMenu editor={editor} className="format-bar" options={{ placement: 'top' }}>
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
