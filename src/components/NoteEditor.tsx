import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditorState } from '@tiptap/react'
import { getItem, setNote, useNote } from '../lib/library'
import { tidyMarkdown, withMath } from '../lib/richtext'
import { Icon } from './Icon'
import { useRichEditor } from './RichText'

const announce = (saved: string | null) =>
  saved && window.dispatchEvent(new CustomEvent('stillpage:toast', { detail: `Saved ${saved.split('/').pop()}` }))

const fileName = (id: string) => (getItem(id)?.title ?? 'note').replace(/[\\/:*?"<>|]/g, '-')

/** Notes are stored as Markdown but written like a document: typing `- `,
 *  `# `, `**bold**` or `> ` turns into the real thing and the marks vanish. */
export function NoteEditor({ id, active }: { id: string; active: boolean }) {
  const text = useNote(id)
  const [menu, setMenu] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const { editor, overlay } = useRichEditor({
    text,
    onChange: (md) => setNote(id, md),
    placeholder: 'Start writing. Type # for a heading, - for a list, > for a quote, Ctrl M for a formula.',
    // Quotes arrive at the end: follow them.
    onAppended: () => requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })),
  })

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
    const md = tidyMarkdown(editor.getMarkdown())
    if (window.stillpage?.saveFile) announce(await window.stillpage.saveFile(`${fileName(id)}.md`, md))
    else download(new Blob([md], { type: 'text/markdown' }), `${fileName(id)}.md`)
  }

  const exportPdf = async () => {
    setMenu(false)
    if (window.stillpage?.exportPdf) announce(await window.stillpage.exportPdf(`${fileName(id)}.pdf`, await withMath(editor.getHTML())))
    else window.print()
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
      {overlay}
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
